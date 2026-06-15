"""エージェントのオーケストレーション。

- run_crawl()  : タスク提案グラフを実行 (既定は直接Notion反映、承認時のみinterrupt)
- run_drafts() : メール返信案グラフを実行 (読み取り専用→Discordに案を提示するだけ)
- resume()     : Discordボタンの承認結果を Command(resume=...) でタスクグラフに渡して再開する

notifier は discordbot.AgentBot を想定。
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any, Protocol

from langgraph.types import Command

from . import seen

log = logging.getLogger("agent.runtime")


class Notifier(Protocol):
    async def send_proposal(self, thread_id: str, payload: dict[str, Any]) -> None: ...
    async def send_applied(self, applied: list[dict[str, Any]]) -> None: ...
    async def send_suggestions(self, suggestions: list[dict[str, Any]]) -> None: ...
    async def send_text(self, text: str) -> None: ...


class AgentRuntime:
    def __init__(self, graph, notifier: Notifier, draft_graph=None):
        self.graph = graph
        self.draft_graph = draft_graph
        self.notifier = notifier

    # --- タスク提案 ---
    async def run_crawl(self) -> None:
        thread_id = uuid.uuid4().hex
        config = {"configurable": {"thread_id": thread_id}}
        log.info("クロール開始 thread=%s", thread_id)
        try:
            result = await self.graph.ainvoke({}, config)
        except Exception as e:
            log.exception("クロール失敗 thread=%s", thread_id)
            await self.notifier.send_text(f"⚠️ クロールに失敗しました: {e}")
            return

        if result.get("__interrupt__"):
            payload = result["__interrupt__"][0].value
            log.info("提案あり thread=%s (%d件) → 承認待ち", thread_id, len(payload.get("proposals", [])))
            await self.notifier.send_proposal(thread_id, payload)
            return
        applied = result.get("applied", [])
        if applied:
            log.info("直接反映 thread=%s (%d件)", thread_id, len(applied))
            await self.notifier.send_applied(applied)
        else:
            log.info("提案なし thread=%s", thread_id)

    # --- メール返信案 (読み取り専用・承認不要) ---
    async def run_drafts(self) -> None:
        if self.draft_graph is None:
            return
        thread_id = uuid.uuid4().hex
        config = {"configurable": {"thread_id": thread_id}}
        log.info("返信案クロール開始 thread=%s", thread_id)
        try:
            result = await self.draft_graph.ainvoke({}, config)
        except Exception as e:
            log.exception("返信案クロール失敗 thread=%s", thread_id)
            await self.notifier.send_text(f"⚠️ 返信案の生成に失敗しました: {e}")
            return

        suggestions = result.get("suggestions", [])
        if not suggestions:
            log.info("返信案なし thread=%s", thread_id)
            return
        await self.notifier.send_suggestions(suggestions)
        # 提示できたものだけ記憶し、次回以降は再提示しない (送信失敗時は再試行)
        await asyncio.to_thread(seen.mark, suggestions, "suggested", "draft")

    # --- タスク承認結果の反映 ---
    async def resume(self, thread_id: str, approved: bool) -> None:
        config = {"configurable": {"thread_id": thread_id}}
        log.info("再開 thread=%s approved=%s", thread_id, approved)
        if not approved:
            await self.graph.ainvoke(Command(resume={"approved": False}), config)
            await self.notifier.send_text("❌ 却下しました。Notionへの反映は行いません。")
            return
        try:
            result = await self.graph.ainvoke(Command(resume={"approved": True}), config)
        except Exception as e:
            log.exception("反映失敗")
            await self.notifier.send_text(f"⚠️ 反映に失敗しました: {e}")
            return
        applied = result.get("applied", [])
        if applied:
            await self.notifier.send_applied(applied)
        else:
            await self.notifier.send_text("反映対象がありませんでした。")
