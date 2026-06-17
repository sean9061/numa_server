r"""自然言語アシスタント(チャット + 方針管理) — 段階B (docs/agent-memory.md §6)。

Discordの会話に対し、**基本は通常のチャットAIとして自然に応答**する。
そのうえで、ユーザーが明示的にエージェントの『振る舞いの方針(directive)』や基本情報を
覚える/変える/忘れる/一覧と指示したときだけ、メモリ層への操作(action)を併せて返す。

1回のLLM呼び出しで必ず会話応答(reply)を返し、操作は任意(action)。実際の適用
(確認HITL・書込)は discordbot 側で行う。司書はエージェント本体と同一プロセスで動くため、
directive を更新すると `_dir_cache` が即時共有され、次回クロールから再起動なしで反映される。
"""
from __future__ import annotations

import datetime as dt
import json
import logging
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from . import memory
from .graph import _extract_json
from .llm import make_llm

log = logging.getLogger("agent.librarian")

VALID_DOMAINS = {"global", "task", "draft", "home"}

_SYSTEM = (
    "あなたはユーザー(numa)の個人アシスタント『Numa Agent』です。日本語で、通常のチャットAIの"
    "ように自然に会話・質問対応してください。あなたはエージェントの『振る舞いの方針(directive)』"
    "とユーザーの基本情報も管理しています。\n"
    "基本はあくまで普通の会話です。ユーザーが明確に『方針や基本情報を覚えて/変えて/忘れて』、"
    "または『何を覚えてる?』と求めたときだけ、メモリ操作を行ってください。"
    "少しでも迷うなら操作せず普通に会話する(むやみにメモリを書き換えない)。\n\n"
    "あなたはユーザーの Google カレンダーを参照できます(読み取り専用)。"
    "予定や空き時間を聞かれたら、決して『権限がない』等と断らず action=\"calendar\" を返してください。\n\n"
    "必ず次のJSONだけを返す(前後に説明文を付けない):\n"
    '{"reply": "ユーザーに見せる会話文(必須・日本語)", '
    '"action": "none"|"remember"|"forget"|"list"|"deny"|"calendar", '
    '"directives": [{"text": "方針/基本情報の一文", "domain": "global|task|draft|home"}], '
    '"supersede": ["この記憶で置き換える既存方針のid"], '
    '"targets": ["忘れる対象のid"], '
    '"patterns": ["除外する送信元(メールアドレス/ドメイン)"], '
    '"mode": "free"|"events", "range_start": "YYYY-MM-DD", "range_end": "YYYY-MM-DD"}\n'
    "- 通常の会話・質問・雑談 → action=\"none\"。reply で普通に答える。\n"
    "- 予定・スケジュール・空き時間の照会 → action=\"calendar\"。"
    "『空いてる時間/予定がない時間』は mode=\"free\"、『予定/スケジュールを教えて』は mode=\"events\"。"
    "『来週』『明日』『今週末』等は下記『本日の日付』を基準に range_start/range_end の具体的な日付へ変換する"
    "(範囲が曖昧なら省略可)。reply は『来週の空き時間を確認しますね』等の一言にとどめ、"
    "具体的な日時はこちらで算出するので reply に書かないこと。\n"
    "- 覚えて/変えて(方針・基本情報の追加変更) → action=\"remember\"、directives に入れる。"
    "reply は『了解、こう覚えますね』等の一言。基本情報は domain=global。"
    "**下記『現在の方針』と重複・矛盾するものがあれば、その id を supersede に入れる**"
    "(新しい記憶で古いものを置き換える)。\n"
    "- 方針を整理して/まとめて → 現在の方針を統合・重複排除した新セットを directives に入れ、"
    "置き換える古い id を全て supersede に入れた action=\"remember\" を返す。\n"
    "- 忘れて → action=\"forget\"、下記『現在の方針』の id を targets に。reply は一言。\n"
    "- 何覚えてる? → action=\"list\"。reply は一言。\n"
    "- 特定の送信元(メールアドレス/ドメイン)からのメールを無視/タスク化しないでと言われたら → "
    "あいまいな方針でなく確実な除外リストに入れる: action=\"deny\"、patterns にその送信元を入れる。\n"
    "domain: global=全般/基本情報, task=タスク抽出, draft=メール返信案, home=家電。"
)


_WD = ("月", "火", "水", "木", "金", "土", "日")


def _today_context() -> str:
    today = dt.date.today()
    return f"\n\n本日の日付: {today.isoformat()} ({_WD[today.weekday()]})"


def _valid_date(s: Any) -> str | None:
    """'YYYY-MM-DD' として妥当なら ISO 文字列を返す。不正なら None。"""
    if not isinstance(s, str):
        return None
    try:
        return dt.date.fromisoformat(s[:10]).isoformat()
    except ValueError:
        return None


def _directives_context() -> str:
    items = memory.list_directives()
    parts = []
    if items:
        lines = "\n".join(f"- id={it['id']} ({it['domain']}) {it['text']}" for it in items)
        parts.append("現在の方針:\n" + lines)
    else:
        parts.append("現在の方針: (なし)")
    denied = memory.list_denied()
    if denied:
        parts.append("現在の除外送信元(deny-list): " + ", ".join(denied))
    return "\n\n" + "\n\n".join(parts)


async def _invoke(messages: list[Any]) -> str:
    """アシスタントLLMを呼び生テキストを返す(JSON抽出は呼び出し側)。"""
    llm = make_llm(reasoning=False)
    resp = await llm.ainvoke(messages)
    return resp.content if hasattr(resp, "content") else str(resp)


_CAL_ANSWER_SYSTEM = (
    "あなたはユーザー(numa)のカレンダー照会に答えるアシスタントです。"
    "システムが算出した確定情報として、対象期間の『予定(events)』と『空き時間枠(free_slots)』が"
    "与えられます。**この情報だけを根拠に**、ユーザーの質問へ日本語で簡潔・具体的に答えてください。\n"
    "- 提示された日付・時間以外を創作しないこと(無いものは『予定なし』として扱う)。\n"
    "- 『一番負担がない日は?』『泊められる日は?』等の判断を求める質問には、予定の少なさ・"
    "空き枠の多さから根拠を添えて具体的な日を推薦すること(単なる一覧で済ませない)。\n"
    "- 空き時間枠は平日日中(営業時間)のみの算出である点に留意し、終日の予定の有無も判断に使うこと。\n"
    "- 各予定には日時・タイトルのほか、場所・会議URL・参加者・主催・メモ・リンクが含まれる場合がある。"
    "場所や参加者などを聞かれたらそれを使って答え、無い項目は『記載なし』とすること。\n"
    "- 単に一覧を求められたら見やすく列挙すること(関係ない詳細は省いてよい)。"
)


async def answer_calendar(question: str, event_labels: list[str], slot_labels: list[str]) -> str:
    """確定スケジュール(予定・空き枠の文字列)を根拠に、ユーザーの質問へ自然文で答える。

    時刻はすべてシステムが決定論的に算出した文字列を渡すため、LLMには判断・要約だけさせる
    (実在しない日時を作らせない)。失敗時は空文字を返し、呼び出し側がフォールバックする。
    """
    payload = {
        "today": dt.date.today().isoformat(),
        "question": question,
        "events": event_labels or ["(対象期間に予定なし)"],
        "free_slots": slot_labels or ["(算出された空き枠なし)"],
    }
    raw = await _invoke([
        SystemMessage(content=_CAL_ANSWER_SYSTEM),
        HumanMessage(content=json.dumps(payload, ensure_ascii=False, indent=2)),
    ])
    return (raw if isinstance(raw, str) else str(raw)).strip()


async def respond(message: str, history: list[tuple[str, str]] | None = None) -> dict[str, Any]:
    """会話メッセージに応答する。常に reply を返し、指示時のみ action を伴う。

    history は短期セッションの直近のやり取り [(role, content), …]
    (role は "user"/"assistant")。多ターンの文脈を保つために渡す。
    返り値: {reply, action(none/remember/forget/list), directives, targets}
    JSONが壊れたら生テキストをそのままチャット応答に使う(普通に会話できるよう安全側)。
    """
    messages: list[Any] = [SystemMessage(content=_SYSTEM + _today_context() + _directives_context())]
    for role, content in history or []:
        messages.append(AIMessage(content=content) if role == "assistant" else HumanMessage(content=content))
    messages.append(HumanMessage(content=message))

    raw = await _invoke(messages)
    text = raw if isinstance(raw, str) else str(raw)
    data = _extract_json(text)
    if not isinstance(data, dict):
        return {"action": "none", "reply": text.strip() or "うまく応答できませんでした。",
                "directives": [], "targets": []}

    action = data.get("action")
    if action not in {"remember", "forget", "list", "deny", "calendar", "none"}:
        action = "none"
    out: dict[str, Any] = {
        "action": action,
        "reply": str(data.get("reply") or "").strip(),
        "directives": [],
        "supersede": [],
        "targets": [],
        "patterns": [],
        "mode": "free",
        "range_start": None,
        "range_end": None,
    }
    valid_ids = {it["id"] for it in memory.list_directives()}

    if action == "remember":
        for d in data.get("directives") or []:
            if isinstance(d, dict) and str(d.get("text") or "").strip():
                dom = d.get("domain") if d.get("domain") in VALID_DOMAINS else "global"
                out["directives"].append({"text": str(d["text"]).strip(), "domain": dom})
        out["supersede"] = [s for s in (data.get("supersede") or []) if s in valid_ids]
        if not out["directives"]:
            out["action"] = "none"  # 操作実体が無ければ普通の会話に落とす
    elif action == "forget":
        out["targets"] = [t for t in (data.get("targets") or []) if t in valid_ids]
        if not out["targets"]:
            out["action"] = "none"
            out["reply"] = out["reply"] or "どの方針を忘れるか特定できませんでした。"
    elif action == "deny":
        out["patterns"] = [str(p).strip() for p in (data.get("patterns") or []) if str(p).strip()]
        if not out["patterns"]:
            out["action"] = "none"
            out["reply"] = out["reply"] or "どの送信元を除外するか特定できませんでした。"
    elif action == "calendar":
        out["mode"] = "events" if data.get("mode") == "events" else "free"
        out["range_start"] = _valid_date(data.get("range_start"))
        out["range_end"] = _valid_date(data.get("range_end"))
        out["reply"] = out["reply"] or ("予定を確認しますね。" if out["mode"] == "events" else "空き時間を確認しますね。")

    if out["action"] == "none" and not out["reply"]:
        out["reply"] = "(応答を生成できませんでした)"
    return out
