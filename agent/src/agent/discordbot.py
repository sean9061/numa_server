"""Discord ボット。通知の投稿と、Approve/Reject ボタンによる HITL 承認を担う。

ボタンは DynamicItem を使い custom_id に thread_id を埋め込む。これにより
ボットが再起動しても (SQLite に状態が残っているため) ボタン押下からグラフを再開できる。
"""
from __future__ import annotations

import asyncio
import datetime as dt
import logging
import time
from typing import Any

import discord

from . import availability, librarian, memory, runlog
from .config import settings
from .tools import gcal

log = logging.getLogger("agent.discord")

_JST = dt.timezone(dt.timedelta(hours=9))
_WD = ("月", "火", "水", "木", "金", "土", "日")
_MAX_EVENTS = 25  # Discord メッセージ長対策


def _fmt_range(range_start: dt.date | None, range_end: dt.date | None) -> str:
    if range_start and range_end:
        return f"{range_start.month}/{range_start.day}〜{range_end.month}/{range_end.day}"
    if range_start:
        return f"{range_start.month}/{range_start.day}以降"
    if range_end:
        return f"{range_end.month}/{range_end.day}まで"
    return "今後"


def _event_label(ev: dict[str, Any]) -> str:
    start = ev.get("start", "") or ""
    summary = ev.get("summary", "(無題の予定)")
    if "T" in start:
        try:
            s = dt.datetime.fromisoformat(start.replace("Z", "+00:00")).astimezone(_JST)
            when = f"{s.month}月{s.day}日({_WD[s.weekday()]}) {s:%H:%M}"
        except ValueError:
            when = start[:16]
    elif start:
        try:
            d = dt.date.fromisoformat(start[:10])
            when = f"{d.month}月{d.day}日({_WD[d.weekday()]}) 終日"
        except ValueError:
            when = start[:10]
    else:
        when = "?"
    return f"{when} {summary}"


def _event_detail(ev: dict[str, Any]) -> str:
    """推論回答用に、取得できた有用な情報を全部含めた1件の説明文を作る(空欄は省く)。"""
    parts = [_event_label(ev)]
    if ev.get("location"):
        parts.append(f"場所: {ev['location']}")
    if ev.get("conference_url"):
        parts.append(f"会議URL: {ev['conference_url']}")
    att = [a for a in (ev.get("attendees") or []) if a]
    if att:
        shown = "、".join(att[:10]) + (f" ほか{len(att) - 10}名" if len(att) > 10 else "")
        parts.append(f"参加者: {shown}")
    if ev.get("organizer"):
        parts.append(f"主催: {ev['organizer']}")
    if ev.get("description"):
        parts.append(f"メモ: {ev['description']}")
    if ev.get("link"):
        parts.append(f"リンク: {ev['link']}")
    return " ｜ ".join(parts)


def _format_free_slots(slots: list[dict], range_start: dt.date | None, range_end: dt.date | None) -> str:
    rng = _fmt_range(range_start, range_end)
    if not slots:
        return f"🗓️ {rng}の空き時間は見つかりませんでした（平日{settings.avail_day_start}:00〜{settings.avail_day_end}:00で予定が埋まっています）。"
    lines = "\n".join(f"• {s['label']}" for s in slots)
    return f"🗓️ {rng}の空き時間（平日{settings.avail_day_start}:00〜{settings.avail_day_end}:00）:\n{lines}"


def _events_in_range(events: list[dict], range_start: dt.date | None, range_end: dt.date | None) -> list[dict]:
    if not (range_start or range_end):
        return events

    def ok(ev: dict[str, Any]) -> bool:
        s = (ev.get("start") or "")[:10]
        if not s:
            return False
        try:
            d = dt.date.fromisoformat(s)
        except ValueError:
            return False
        if range_start and d < range_start:
            return False
        if range_end and d > range_end:
            return False
        return True

    return [e for e in events if ok(e)]


def _format_events(events: list[dict], range_start: dt.date | None, range_end: dt.date | None) -> str:
    evs = _events_in_range(events, range_start, range_end)
    rng = _fmt_range(range_start, range_end)
    if not evs:
        return f"🗓️ {rng}の予定はありません。"
    shown = evs[:_MAX_EVENTS]
    lines = "\n".join(f"• {_event_label(e)}" for e in shown)
    more = f"\n…ほか{len(evs) - len(shown)}件" if len(evs) > len(shown) else ""
    return f"🗓️ {rng}の予定:\n{lines}{more}"


class ProposalButton(
    discord.ui.DynamicItem[discord.ui.Button],
    template=r"agent:(?P<action>approve|reject):(?P<thread>[0-9a-f]+)",
):
    """custom_id に action と thread_id を埋め込んだ永続ボタン (タスク承認用)。"""

    def __init__(self, action: str, thread_id: str):
        self.action = action
        self.thread_id = thread_id
        approve = action == "approve"
        super().__init__(
            discord.ui.Button(
                label="承認" if approve else "却下",
                style=discord.ButtonStyle.success if approve else discord.ButtonStyle.danger,
                custom_id=f"agent:{action}:{thread_id}",
            )
        )

    @classmethod
    async def from_custom_id(cls, interaction, item, match):
        return cls(match["action"], match["thread"])

    async def callback(self, interaction: discord.Interaction):
        approved = self.action == "approve"
        # 3秒以内にACK。ボタンを無効化しつつメッセージを更新。
        await interaction.response.edit_message(
            content=f"{'✅ 承認' if approved else '❌ 却下'} を受け付けました。処理中...",
            view=None,
        )
        await interaction.client.runtime.resume(self.thread_id, approved)


def _make_view(thread_id: str) -> discord.ui.View:
    view = discord.ui.View(timeout=None)
    view.add_item(ProposalButton("approve", thread_id))
    view.add_item(ProposalButton("reject", thread_id))
    return view


def _source_line(p: dict[str, Any]) -> str:
    """提案の由来を1行で表す。リンクがあれば Markdown リンクにする。"""
    label = p.get("source_label") or p.get("source") or "不明"
    url = p.get("source_url")
    return f"[{label}]({url})" if url else label


def _proposal_field(p: dict[str, Any]) -> str:
    due = p.get("due")
    lines = [f"締切: {due}" if due else "締切: —", f"出典: {_source_line(p)}"]
    return "\n".join(lines)


def _build_embed(payload: dict[str, Any]) -> discord.Embed:
    proposals = payload.get("proposals", [])
    embed = discord.Embed(
        title="📋 タスク提案",
        description=f"{len(proposals)} 件の提案があります。承認すると反映します。",
        color=0x5865F2,
    )
    for i, p in enumerate(proposals, 1):
        embed.add_field(name=f"{i}. {p.get('title', '(無題)')}", value=_proposal_field(p), inline=False)
    return embed


def _build_applied_embed(applied: list[dict[str, Any]]) -> discord.Embed:
    embed = discord.Embed(
        title="✅ タスクを追加しました",
        description=f"{len(applied)} 件を Notion に追加しました。",
        color=0x57F287,
    )
    for i, p in enumerate(applied, 1):
        embed.add_field(name=f"{i}. {p.get('title', '(無題)')}", value=_proposal_field(p), inline=False)
    return embed


def _clip(text: str, n: int) -> str:
    text = (text or "").strip()
    return text if len(text) <= n else text[: n - 1] + "…"


def _suggestion_field(d: dict[str, Any]) -> str:
    link = d.get("link")
    src = f"  [元メール]({link})" if link else ""
    head = f"宛先: {_clip(d.get('to', ''), 60)}{src}"
    return f"{head}\n```\n{_clip(d.get('body', ''), 900)}\n```"


def _build_suggestions_embed(suggestions: list[dict[str, Any]]) -> discord.Embed:
    embed = discord.Embed(
        title="✉️ 返信案",
        description=f"{len(suggestions)} 件の返信案です（Gmailへの書込はしません）。内容を確認し、必要ならGmailにコピーして送ってください。",
        color=0xFEE75C,
    )
    for i, d in enumerate(suggestions, 1):
        embed.add_field(name=f"{i}. {_clip(d.get('subject', '(無題)'), 80)}", value=_suggestion_field(d), inline=False)
    return embed


# --- 実行サマリ / 実行履歴 (#64) ---
_TRIGGER_LABEL = {"startup": "起動時", "schedule": "定期", "manual": "手動"}
_KIND_LABEL = {"crawl": "クロール", "draft": "返信案", "apply": "反映"}
_OUTCOME = {  # outcome -> (絵文字, 色, 文言)
    "applied": ("✅", 0x57F287, "タスクを追加"),
    "proposed": ("📋", 0x5865F2, "提案あり"),
    "awaiting_approval": ("📋", 0x5865F2, "提案あり(承認待ち)"),
    "suggested": ("✉️", 0xFEE75C, "返信案あり"),
    "none": ("➖", 0x4F545C, "対応なし"),
    "rejected": ("🚫", 0x4F545C, "却下"),
    "error": ("⚠️", 0xED4245, "失敗"),
}


def _fmt_jst(iso: str | None) -> str:
    if not iso:
        return "?"
    try:
        return dt.datetime.fromisoformat(iso).astimezone(_JST).strftime("%m/%d %H:%M")
    except ValueError:
        return iso[:16]


def _run_headline(run: dict[str, Any]) -> str:
    """outcome から1行の結果文を作る。"""
    emoji, _, word = _OUTCOME.get(run.get("outcome", ""), ("•", 0, run.get("outcome", "")))
    return f"{emoji} {word}"


def _crawl_saw_line(saw: dict[str, Any]) -> str:
    parts = [f"メール{saw.get('emails', 0)}", f"予定{saw.get('events', 0)}"]
    if saw.get("moodle"):
        parts.append(f"課題{saw.get('moodle', 0)}")
    parts.append(f"既存タスク{saw.get('existing_tasks', 0)}")
    line = "確認: " + " ・ ".join(parts)
    if saw.get("moodle_expired"):
        line += "\n⚠ Moodle再ログインが必要: scripts/moodle_login.py を実行してください"
    plan = saw.get("plan")
    if plan:  # orchestrator の計画
        line += f"\n計画: {len(plan)}サブタスク (" + ", ".join(s.get("type", "?") for s in plan) + ")"
    return line


def _build_run_summary_embed(run: dict[str, Any]) -> discord.Embed:
    emoji, color, _ = _OUTCOME.get(run.get("outcome", ""), ("🔍", 0x5865F2, ""))
    trig = _TRIGGER_LABEL.get(run.get("trigger", ""), run.get("trigger", ""))
    kind = _KIND_LABEL.get(run.get("kind", ""), run.get("kind", ""))
    embed = discord.Embed(
        title=f"{emoji} {kind}完了（{trig}）",
        color=color,
        timestamp=dt.datetime.now(dt.timezone.utc),
    )
    saw, did = run.get("saw", {}), run.get("did", {})
    if run.get("kind") == "draft":
        embed.add_field(name="確認", value=f"返信候補メール{saw.get('candidates', 0)}件", inline=False)
        embed.add_field(name="結果",
                        value=f"返信案 {did.get('suggestions', 0)}件" if did.get("suggestions")
                        else "返信案なし", inline=False)
        subs = did.get("subjects") or []
    else:  # crawl / apply
        if saw:
            embed.add_field(name="確認", value=_crawl_saw_line(saw), inline=False)
        embed.add_field(name="結果",
                        value=f"提案{did.get('proposals', 0)} / 追加{did.get('applied', 0)}", inline=False)
        subs = did.get("applied_titles") or did.get("proposal_titles") or []
    if subs:
        embed.add_field(name="内容", value="\n".join(f"• {_clip(s, 80)}" for s in subs[:10]), inline=False)
    if run.get("error"):
        embed.add_field(name="エラー", value=_clip(run["error"], 500), inline=False)
    if run.get("mode") == "orchestrator":
        embed.set_footer(text="orchestrator")
    return embed


def _build_runs_embed(runs: list[dict[str, Any]]) -> discord.Embed:
    embed = discord.Embed(
        title="🗒️ 最近の実行履歴",
        description=f"直近 {len(runs)} 件" if runs else "まだ実行記録がありません。",
        color=0x5865F2,
    )
    for run in reversed(runs):  # 新しい順に表示
        trig = _TRIGGER_LABEL.get(run.get("trigger", ""), run.get("trigger", ""))
        kind = _KIND_LABEL.get(run.get("kind", ""), run.get("kind", ""))
        saw, did = run.get("saw", {}), run.get("did", {})
        if run.get("kind") == "draft":
            detail = f"候補{saw.get('candidates', 0)} → 返信案{did.get('suggestions', 0)}"
        else:
            detail = (f"メール{saw.get('emails', 0)}・予定{saw.get('events', 0)} "
                      f"→ 提案{did.get('proposals', 0)}/追加{did.get('applied', 0)}")
        name = f"{_fmt_jst(run.get('ts'))}  {kind}（{trig}） {_run_headline(run)}"
        embed.add_field(name=_clip(name, 250), value=_clip(detail, 200), inline=False)
    return embed


class _ConfirmView(discord.ui.View):
    """覚える/忘れるの確認(HITL)。即時の会話用なので非永続(timeout付き)でよい。"""

    def __init__(self, on_confirm):
        super().__init__(timeout=300)
        self._on_confirm = on_confirm  # async () -> str

    @discord.ui.button(label="✅ 確定", style=discord.ButtonStyle.success)
    async def _confirm(self, interaction: discord.Interaction, button: discord.ui.Button):
        for c in self.children:
            c.disabled = True
        await interaction.response.edit_message(view=self)
        try:
            result = await self._on_confirm()
        except Exception:
            log.exception("司書: 方針の適用に失敗")
            result = "⚠️ 適用に失敗しました。"
        await interaction.followup.send(result)
        self.stop()

    @discord.ui.button(label="✖ キャンセル", style=discord.ButtonStyle.secondary)
    async def _cancel(self, interaction: discord.Interaction, button: discord.ui.Button):
        for c in self.children:
            c.disabled = True
        await interaction.response.edit_message(content="キャンセルしました。", view=self)
        self.stop()


def _build_directives_embed(items: list[dict[str, Any]], denied: list[str] | None = None) -> discord.Embed:
    embed = discord.Embed(
        title="🧠 記憶している方針",
        description=f"{len(items)} 件" if items else "まだ何も覚えていません。",
        color=0x9B59B6,
    )
    for it in items:
        embed.add_field(name=f"({it['domain']}) p{it.get('priority', 0)}", value=it["text"], inline=False)
    if denied:
        embed.add_field(name="🚫 除外送信元 (deny-list)", value="\n".join(denied), inline=False)
    return embed


# --- 方針の適用(確認ボタン押下後)。await をループで回す(ジェネレータ式内では不可) ---
async def _apply_remember(dirs: list[dict[str, Any]], supersede: list[str]) -> str:
    for d in dirs:
        await asyncio.to_thread(memory.add_directive, d["text"], d["domain"], "directive", 100, "discord")
    n_sup = 0
    for s in supersede:
        if await asyncio.to_thread(memory.deactivate_directive, s):
            n_sup += 1
    msg = f"✅ {len(dirs)}件を覚えました。次回クロールから反映されます。"
    return msg + (f"(古い{n_sup}件を置き換え)" if n_sup else "")


async def _apply_forget(targets: list[str]) -> str:
    n = 0
    for t in targets:
        if await asyncio.to_thread(memory.deactivate_directive, t):
            n += 1
    return f"✅ {n}件を忘れました。"


async def _apply_deny(patterns: list[str]) -> str:
    n = 0
    for p in patterns:
        if await asyncio.to_thread(memory.add_denied, p):
            n += 1
    return f"✅ {n}件の送信元を除外リストに追加しました。次回クロールから除外します。"


class AgentBot(discord.Client):
    def __init__(self):
        # message_content は司書(会話で方針管理)に必須。
        # ※ Discord Developer Portal で Message Content Intent を有効化すること。
        intents = discord.Intents.default()
        intents.message_content = True
        super().__init__(intents=intents)
        self.runtime = None  # main で AgentRuntime を注入
        self._ran_start = False
        # 短期会話セッション: channel_id -> {"history": [(role, content)], "last": monotonic}
        self._sessions: dict[int, dict[str, Any]] = {}

    async def setup_hook(self):
        # 再起動後もボタンを有効にするため動的アイテムを登録
        self.add_dynamic_items(ProposalButton)

    async def on_ready(self):
        log.info("Discord ログイン: %s (id=%s)", self.user, getattr(self.user, "id", "?"))
        if settings.run_on_start and not self._ran_start and self.runtime is not None:
            self._ran_start = True
            what = "クロール＋返信案" if settings.draft_enabled else "クロール"
            log.info("RUN_ON_START=true: 起動時に%sを逐次実行", what)
            asyncio.create_task(self.runtime.run_cycle("startup"))  # crawl→draft を逐次

    async def on_message(self, message: discord.Message):
        """設定チャンネルの人間の発話に応答する。基本は通常のチャット、
        方針の記憶/削除/一覧を指示されたときだけメモリ操作(確認HITL付き)を行う。"""
        if message.author.bot or message.channel.id != settings.discord_channel_id:
            return
        if not settings.librarian_enabled:
            return
        content = (message.content or "").strip()
        if not content:
            return
        # 短期セッション: アイドル超過なら文脈をリセット
        now = time.monotonic()
        sess = self._sessions.get(message.channel.id)
        if sess is None or now - sess["last"] > settings.session_idle_min * 60:
            sess = {"history": [], "last": now}
            self._sessions[message.channel.id] = sess
        try:
            async with message.channel.typing():
                result = await librarian.respond(content, sess["history"])
        except Exception:
            log.exception("アシスタント: 応答に失敗")
            await message.channel.send("⚠️ うまく応答できませんでした。")
            return
        # 今回のやり取りをセッションに追加(古いものは捨てる)
        sess["history"] += [("user", content), ("assistant", result.get("reply") or "")]
        sess["history"] = sess["history"][-settings.session_max_messages:]
        sess["last"] = time.monotonic()
        await self._dispatch_chat(message.channel, result, content)

    async def _dispatch_chat(self, channel, result: dict[str, Any], question: str = "") -> None:
        action = result.get("action")
        reply = result.get("reply") or ""
        lead = f"{reply}\n\n" if reply else ""
        if action == "list":
            if reply:
                await channel.send(reply)
            await channel.send(embed=_build_directives_embed(memory.list_directives(), memory.list_denied()))
        elif action == "remember":
            items = {it["id"]: it for it in memory.list_directives()}
            dirs = result["directives"]
            supersede = result.get("supersede", [])
            summary = "\n".join(f"- ({d['domain']}) {d['text']}" for d in dirs)
            if supersede:  # 矛盾/重複する古い方針を同時に置き換える(段階C #1/#4)
                old = "\n".join(f"- {items[s]['text']}" for s in supersede if s in items)
                summary += f"\n伴って忘れる:\n{old}"
            await channel.send(
                f"{lead}次の内容を覚えます:\n{summary}",
                view=_ConfirmView(lambda: _apply_remember(dirs, supersede)),
            )
        elif action == "forget":
            items = {it["id"]: it for it in memory.list_directives()}
            targets = result["targets"]
            summary = "\n".join(f"- {items[t]['text']}" for t in targets if t in items)
            await channel.send(
                f"{lead}次の内容を忘れます:\n{summary}",
                view=_ConfirmView(lambda: _apply_forget(targets)),
            )
        elif action == "deny":  # 送信元の確実な除外(段階C #3 deterministic routing)
            patterns = result["patterns"]
            summary = "\n".join(f"- {p}" for p in patterns)
            await channel.send(
                f"{lead}次の送信元からのメールを除外します:\n{summary}",
                view=_ConfirmView(lambda: _apply_deny(patterns)),
            )
        elif action == "calendar":  # カレンダー照会(空き時間/予定)。読み取り専用・HITL不要
            if reply:
                await channel.send(reply)
            await self._send_calendar(result, question)
        elif action == "runs":  # エージェント自身の実行履歴の照会 (#64)
            if reply:
                await channel.send(reply)
            runs = await asyncio.to_thread(runlog.recent, settings.runs_history_limit)
            await channel.send(embed=_build_runs_embed(runs))
        else:  # none = 通常のチャット応答
            await channel.send(reply or "(応答を生成できませんでした)")

    async def _send_calendar(self, result: dict[str, Any], question: str = "") -> None:
        """カレンダーを取得し、確定スケジュールを根拠に**質問へ推論で答える**。

        空き枠・予定は決定論的に算出し(時刻の幻覚を防ぐ)、その確定情報＋元の質問を
        LLMに渡して「一番負担がない日は?」等の判断質問にも答えさせる。
        LLM失敗時は決定論的な一覧ダンプにフォールバックする。
        """
        ch = await self._channel()
        mode = result.get("mode", "free")
        rs = result.get("range_start")
        re_ = result.get("range_end")
        range_start = dt.date.fromisoformat(rs) if rs else None
        range_end = dt.date.fromisoformat(re_) if re_ else None
        # 範囲が既定の lookahead より先まで及ぶなら取得日数を広げる
        days = None
        if range_end:
            need = (range_end - dt.date.today()).days + 1
            if need > settings.calendar_lookahead_days:
                days = need
        try:
            # detailed=True: 場所/会議URL/参加者/主催/説明も取得し、聞かれたら答えられるようにする
            events = await asyncio.to_thread(gcal.fetch_upcoming, days, True)
        except Exception:
            log.exception("カレンダー照会: 予定取得に失敗")
            await ch.send("⚠️ カレンダーの取得に失敗しました。")
            return
        # 判断材料: 範囲内の全予定(週末・終日含む・詳細付き) ＋ 空き枠(平日日中)。両方をLLMに渡す。
        events_in_range = _events_in_range(events, range_start, range_end)
        slots = await asyncio.to_thread(availability.free_slots, events, None, range_start, range_end)
        event_labels = [_event_detail(e) for e in events_in_range]
        slot_labels = [s["label"] for s in slots]
        answer = ""
        try:
            answer = await librarian.answer_calendar(question, event_labels, slot_labels)
        except Exception:
            log.exception("カレンダー照会: 回答生成に失敗")
        if not answer:  # フォールバック: 決定論的な一覧
            answer = _format_events(events, range_start, range_end) if mode == "events" \
                else _format_free_slots(slots, range_start, range_end)
        await ch.send(answer)

    async def _get_channel(self, channel_id: int) -> discord.abc.Messageable:
        ch = self.get_channel(channel_id)
        if ch is None:
            ch = await self.fetch_channel(channel_id)
        return ch  # type: ignore[return-value]

    async def _channel(self) -> discord.abc.Messageable:
        return await self._get_channel(settings.discord_channel_id)

    async def _summary_channel(self) -> discord.abc.Messageable:
        """実行サマリの送信先。RUN_SUMMARY_CHANNEL_ID 未設定(0)なら通常チャンネルに送る (#64)。"""
        cid = settings.run_summary_channel_id or settings.discord_channel_id
        return await self._get_channel(cid)

    async def send_proposal(self, thread_id: str, payload: dict[str, Any]) -> None:
        ch = await self._channel()
        await ch.send(embed=_build_embed(payload), view=_make_view(thread_id))

    async def send_applied(self, applied: list[dict[str, Any]]) -> None:
        ch = await self._channel()
        await ch.send(embed=_build_applied_embed(applied))

    async def send_suggestions(self, suggestions: list[dict[str, Any]]) -> None:
        ch = await self._channel()
        await ch.send(embed=_build_suggestions_embed(suggestions))

    async def send_run_summary(self, run: dict[str, Any]) -> None:
        ch = await self._summary_channel()
        await ch.send(embed=_build_run_summary_embed(run))

    async def send_text(self, text: str) -> None:
        ch = await self._channel()
        await ch.send(text)
