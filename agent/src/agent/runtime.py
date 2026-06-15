"""エージェントのオーケストレーション。

- run_crawl(): 新しい thread でグラフを実行し、interrupt(提案) が出たら Discord に通知する
- resume(): Discord のボタン承認結果を Command(resume=...) でグラフに渡して再開する

notifier は discordbot.AgentBot を想定 (send_proposal / send_text を持つ)。
"""
from __future__ import annotations

import logging
import uuid
from typing import Any, Protocol

from langgraph.types import Command

log = logging.getLogger("agent.runtime")


class Notifier(Protocol):
    async def send_proposal(self, thread_id: str, payload: dict[str, Any]) -> None: ...
    async def send_applied(self, applied: list[dict[str, Any]]) -> None: ...
    async def send_text(self, text: str) -> None: ...


class AgentRuntime:
    def __init__(self, graph, notifier: Notifier):
        self.graph = graph
        self.notifier = notifier

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

        interrupts = result.get("__interrupt__")
        if interrupts:
            # REQUIRE_APPROVAL=true: 承認待ち。Discordボタンへ。
            payload = interrupts[0].value
            log.info("提案あり thread=%s (%d件) → 承認待ち", thread_id, len(payload.get("proposals", [])))
            await self.notifier.send_proposal(thread_id, payload)
            return
        # 既定: 承認を挟まず直接 Notion へ反映済み。結果を通知。
        applied = result.get("applied", [])
        if applied:
            log.info("直接反映 thread=%s (%d件)", thread_id, len(applied))
            await self.notifier.send_applied(applied)
        else:
            log.info("提案なし thread=%s", thread_id)

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
            log.exception("反映失敗 thread=%s", thread_id)
            await self.notifier.send_text(f"⚠️ 反映に失敗しました: {e}")
            return
        applied = result.get("applied", [])
        if applied:
            await self.notifier.send_applied(applied)
        else:
            await self.notifier.send_text("反映対象がありませんでした。")
