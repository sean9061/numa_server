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
    async def send_text(self, text: str) -> None: ...


class AgentRuntime:
    def __init__(self, graph, notifier: Notifier):
        self.graph = graph
        self.notifier = notifier

    async def run_crawl(self) -> None:
        thread_id = uuid.uuid4().hex
        config = {"configurable": {"thread_id": thread_id}}
        log.info("クロール開始 thread=%s", thread_id)
        result = await self.graph.ainvoke({}, config)

        interrupts = result.get("__interrupt__")
        if interrupts:
            payload = interrupts[0].value
            log.info("提案あり thread=%s (%d件) → Discordへ", thread_id, len(payload.get("proposals", [])))
            await self.notifier.send_proposal(thread_id, payload)
        else:
            log.info("提案なし thread=%s", thread_id)

    async def resume(self, thread_id: str, approved: bool) -> None:
        config = {"configurable": {"thread_id": thread_id}}
        log.info("再開 thread=%s approved=%s", thread_id, approved)
        result = await self.graph.ainvoke(Command(resume={"approved": approved}), config)
        applied = result.get("applied", [])
        if approved:
            await self.notifier.send_text(f"✅ 反映完了: {len(applied)}件")
        else:
            await self.notifier.send_text("❌ 却下しました。反映は行いません。")
