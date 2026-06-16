"""Discord ボット。通知の投稿と、Approve/Reject ボタンによる HITL 承認を担う。

ボタンは DynamicItem を使い custom_id に thread_id を埋め込む。これにより
ボットが再起動しても (SQLite に状態が残っているため) ボタン押下からグラフを再開できる。
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

import discord

from .config import settings

log = logging.getLogger("agent.discord")


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


class AgentBot(discord.Client):
    def __init__(self):
        super().__init__(intents=discord.Intents.default())
        self.runtime = None  # main で AgentRuntime を注入
        self._ran_start = False

    async def setup_hook(self):
        # 再起動後もボタンを有効にするため動的アイテムを登録
        self.add_dynamic_items(ProposalButton)

    async def on_ready(self):
        log.info("Discord ログイン: %s (id=%s)", self.user, getattr(self.user, "id", "?"))
        if settings.run_on_start and not self._ran_start and self.runtime is not None:
            self._ran_start = True
            what = "クロール＋返信案" if settings.draft_enabled else "クロール"
            log.info("RUN_ON_START=true: 起動時に%sを逐次実行", what)
            asyncio.create_task(self.runtime.run_cycle())  # crawl→draft を逐次

    async def _channel(self) -> discord.abc.Messageable:
        ch = self.get_channel(settings.discord_channel_id)
        if ch is None:
            ch = await self.fetch_channel(settings.discord_channel_id)
        return ch  # type: ignore[return-value]

    async def send_proposal(self, thread_id: str, payload: dict[str, Any]) -> None:
        ch = await self._channel()
        await ch.send(embed=_build_embed(payload), view=_make_view(thread_id))

    async def send_applied(self, applied: list[dict[str, Any]]) -> None:
        ch = await self._channel()
        await ch.send(embed=_build_applied_embed(applied))

    async def send_suggestions(self, suggestions: list[dict[str, Any]]) -> None:
        ch = await self._channel()
        await ch.send(embed=_build_suggestions_embed(suggestions))

    async def send_text(self, text: str) -> None:
        ch = await self._channel()
        await ch.send(text)
