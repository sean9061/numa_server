"""エージェントのオーケストレーション。

- run_crawl()  : タスク提案グラフを実行 (既定は直接Notion反映、承認時のみinterrupt)
- run_drafts() : メール返信案グラフを実行 (読み取り専用→Discordに案を提示するだけ)
- resume()     : Discordボタンの承認結果を Command(resume=...) でタスクグラフに渡して再開する

notifier は discordbot.AgentBot を想定。
"""
from __future__ import annotations

import asyncio
import datetime as dt
import logging
import uuid
from typing import Any, Protocol

from langgraph.types import Command

from . import runlog, seen, status
from .config import settings

log = logging.getLogger("agent.runtime")


async def _run_with_status(graph, graph_name: str, payload, config) -> dict[str, Any]:
    """グラフを astream で実行し、各ノード遷移を data/agent_status.json に書き出して
    dashboard にライブ可視化させる(#72 段階2)。戻り値は ainvoke と同等の最終状態
    (interrupt 含む)。

    stream_mode=["updates","values"]: updates でノード名(と __interrupt__)を拾い、
    values で完全な最終状態を得る。"""
    started = dt.datetime.now(dt.timezone.utc).isoformat()
    final: dict[str, Any] = {}
    interrupt = None
    status.write(running=True, graph=graph_name, node=None, started=started)
    try:
        async for mode, chunk in graph.astream(payload, config, stream_mode=["updates", "values"]):
            if mode == "updates" and isinstance(chunk, dict):
                for node in chunk:
                    if node == "__interrupt__":
                        interrupt = chunk[node]
                    elif not node.startswith("__"):
                        status.write(running=True, graph=graph_name, node=node, started=started)
            elif mode == "values" and isinstance(chunk, dict):
                final = chunk
    finally:
        status.clear(graph=graph_name)
    if interrupt is not None:
        final = {**final, "__interrupt__": interrupt}
    return final


class Notifier(Protocol):
    async def send_proposal(self, thread_id: str, payload: dict[str, Any]) -> None: ...
    async def send_applied(self, applied: list[dict[str, Any]]) -> None: ...
    async def send_suggestions(self, suggestions: list[dict[str, Any]]) -> None: ...
    async def send_run_summary(self, run: dict[str, Any]) -> None: ...
    async def send_text(self, text: str) -> None: ...


class AgentRuntime:
    def __init__(self, graph, notifier: Notifier, draft_graph=None):
        self.graph = graph
        self.draft_graph = draft_graph
        self.notifier = notifier

    async def _save_and_summarize(self, run: dict[str, Any]) -> None:
        """実行レコードを runs.jsonl に記録し、設定時は Discord にサマリを送る (#64)。"""
        runlog.record(run)
        if settings.run_summary_enabled:
            try:
                await self.notifier.send_run_summary(run)
            except Exception:
                log.exception("実行サマリの送信に失敗 (記録は完了済み)")

    # --- タスク提案 ---
    async def run_crawl(self, trigger: str = "schedule") -> None:
        thread_id = uuid.uuid4().hex
        config = {"configurable": {"thread_id": thread_id}}
        started = dt.datetime.now(dt.timezone.utc)
        mode = "orchestrator" if settings.orchestrator_enabled else "simple"
        log.info("クロール開始 thread=%s trigger=%s mode=%s", thread_id, trigger, mode)
        graph_name = "orchestrator" if settings.orchestrator_enabled else "task"
        try:
            result = await _run_with_status(self.graph, graph_name, {}, config)
        except Exception as e:
            log.exception("クロール失敗 thread=%s", thread_id)
            run = runlog.build(started, trigger, "crawl", mode,
                               _crawl_saw({}), _crawl_did([], []), "error", error=str(e))
            await self._save_and_summarize(run)
            await self.notifier.send_text(f"⚠️ クロールに失敗しました: {e}")
            return

        interrupt = result.get("__interrupt__")
        if interrupt:
            payload = interrupt[0].value
            proposals = payload.get("proposals", [])
            log.info("提案あり thread=%s (%d件) → 承認待ち", thread_id, len(proposals))
            run = runlog.build(started, trigger, "crawl", mode,
                               _crawl_saw(result), _crawl_did(proposals, []), "awaiting_approval")
            await self.notifier.send_proposal(thread_id, payload)
            await self._save_and_summarize(run)
            return

        proposals = result.get("proposals", [])
        applied = result.get("applied", [])
        outcome = "applied" if applied else "none"
        run = runlog.build(started, trigger, "crawl", mode,
                           _crawl_saw(result), _crawl_did(proposals, applied), outcome)
        if applied:
            log.info("直接反映 thread=%s (%d件)", thread_id, len(applied))
            await self.notifier.send_applied(applied)
        else:
            log.info("提案なし thread=%s", thread_id)
        await self._save_and_summarize(run)

    # --- 1サイクル: クロール→返信案を逐次実行 ---
    async def run_cycle(self, trigger: str = "schedule") -> None:
        """タスククロールと返信案生成を**逐次**実行する。

        両者を同時に走らせると、リソース上限ギリギリのローカルLLM(35B MoE)へ
        並行リクエストが飛びモデルランナーがクラッシュする(実機で確認)。
        逐次化してモデルへの同時アクセスを避ける。
        """
        await self.run_crawl(trigger)
        await self.run_drafts(trigger)  # draft_graph 未設定なら内部で即return

    # --- メール返信案 (読み取り専用・承認不要) ---
    async def run_drafts(self, trigger: str = "schedule") -> None:
        if self.draft_graph is None:
            return
        thread_id = uuid.uuid4().hex
        config = {"configurable": {"thread_id": thread_id}}
        started = dt.datetime.now(dt.timezone.utc)
        log.info("返信案クロール開始 thread=%s trigger=%s", thread_id, trigger)
        try:
            result = await _run_with_status(self.draft_graph, "draft", {}, config)
        except Exception as e:
            log.exception("返信案クロール失敗 thread=%s", thread_id)
            run = runlog.build(started, trigger, "draft", "",
                               _draft_saw({}), _draft_did([]), "error", error=str(e))
            await self._save_and_summarize(run)
            await self.notifier.send_text(f"⚠️ 返信案の生成に失敗しました: {e}")
            return

        suggestions = result.get("suggestions", [])
        outcome = "suggested" if suggestions else "none"
        run = runlog.build(started, trigger, "draft", "",
                           _draft_saw(result), _draft_did(suggestions), outcome)
        if suggestions:
            await self.notifier.send_suggestions(suggestions)
            # 提示できたものだけ記憶し、次回以降は再提示しない (送信失敗時は再試行)
            await asyncio.to_thread(seen.mark, suggestions, "suggested", "draft")
        else:
            log.info("返信案なし thread=%s", thread_id)
        await self._save_and_summarize(run)

    # --- タスク承認結果の反映 ---
    async def resume(self, thread_id: str, approved: bool) -> None:
        config = {"configurable": {"thread_id": thread_id}}
        started = dt.datetime.now(dt.timezone.utc)
        log.info("再開 thread=%s approved=%s", thread_id, approved)
        if not approved:
            await self.graph.ainvoke(Command(resume={"approved": False}), config)
            await self._save_and_summarize(
                runlog.build(started, "manual", "apply", "", {}, _crawl_did([], []), "rejected")
            )
            await self.notifier.send_text("❌ 却下しました。Notionへの反映は行いません。")
            return
        try:
            result = await self.graph.ainvoke(Command(resume={"approved": True}), config)
        except Exception as e:
            log.exception("反映失敗")
            await self._save_and_summarize(
                runlog.build(started, "manual", "apply", "", {}, _crawl_did([], []), "error", error=str(e))
            )
            await self.notifier.send_text(f"⚠️ 反映に失敗しました: {e}")
            return
        applied = result.get("applied", [])
        await self._save_and_summarize(
            runlog.build(started, "manual", "apply", "", {}, _crawl_did([], applied),
                         "applied" if applied else "none")
        )
        if applied:
            await self.notifier.send_applied(applied)
        else:
            await self.notifier.send_text("反映対象がありませんでした。")


# --- 実行レコードの「見たもの/やったこと」をグラフ結果から抽出する (#64) ---
def _crawl_saw(result: dict[str, Any]) -> dict[str, Any]:
    emails = result.get("emails", [])
    events = result.get("events", [])
    mdl = result.get("moodle", [])
    saw: dict[str, Any] = {
        "emails": len(emails),
        "events": len(events),
        "moodle": len(mdl),
        "moodle_expired": bool(result.get("moodle_expired")),
        "existing_tasks": len(result.get("existing_tasks", [])),
        "email_subjects": [e.get("subject", "") for e in emails],
        "event_summaries": [ev.get("summary", "") for ev in events],
        "moodle_titles": [m.get("title", "") for m in mdl],
    }
    plan = result.get("plan") or []
    if plan:  # orchestrator のサブタスク計画
        saw["plan"] = [{"type": s.get("type"), "goal": s.get("goal", "")} for s in plan]
    return saw


def _crawl_did(proposals: list[dict[str, Any]], applied: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "proposals": len(proposals),
        "applied": len(applied),
        "proposal_titles": [p.get("title", "") for p in proposals],
        "applied_titles": [p.get("title", "") for p in applied],
    }


def _draft_saw(result: dict[str, Any]) -> dict[str, Any]:
    return {"candidates": len(result.get("candidates", []))}  # 精査した返信候補メール数


def _draft_did(suggestions: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "suggestions": len(suggestions),
        "subjects": [s.get("subject", "") for s in suggestions],
    }
