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
    """custom_id に action と thread_id を埋め込んだ永続ボタン。"""

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
        # 再開は時間がかかり得る (Phase 1 で LLM/外部API) ので ACK 後に実行。
        await interaction.client.runtime.resume(self.thread_id, approved)


def _make_view(thread_id: str) -> discord.ui.View:
    view = discord.ui.View(timeout=None)
    view.add_item(ProposalButton("approve", thread_id))
    view.add_item(ProposalButton("reject", thread_id))
    return view


def _build_embed(payload: dict[str, Any]) -> discord.Embed:
    proposals = payload.get("proposals", [])
    embed = discord.Embed(
        title="📋 タスク提案",
        description=f"{len(proposals)} 件の提案があります。承認すると反映します。",
        color=0x5865F2,
    )
    for i, p in enumerate(proposals, 1):
        due = p.get("due")
        value = f"締切: {due}" if due else "—"
        embed.add_field(name=f"{i}. {p.get('title', '(無題)')}", value=value, inline=False)
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
            log.info("RUN_ON_START=true: 起動時クロールを実行")
            asyncio.create_task(self.runtime.run_crawl())

    async def _channel(self) -> discord.abc.Messageable:
        ch = self.get_channel(settings.discord_channel_id)
        if ch is None:
            ch = await self.fetch_channel(settings.discord_channel_id)
        return ch  # type: ignore[return-value]

    async def send_proposal(self, thread_id: str, payload: dict[str, Any]) -> None:
        ch = await self._channel()
        await ch.send(embed=_build_embed(payload), view=_make_view(thread_id))

    async def send_text(self, text: str) -> None:
        ch = await self._channel()
        await ch.send(text)
