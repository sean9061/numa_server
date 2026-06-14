r"""LangGraph グラフ定義 (Phase 1: タスク管理クロール MVP)。

    START -> crawl -> reconcile -(提案あり)-> review(interrupt) -> END
                               \-(提案なし)--------------------> END

- crawl_node    : Gmail(重要/未読) + Calendar(今後の予定) + Notion(既存タスク) を並行取得
- reconcile_node: LLM(構造化出力)で「対応すべき新タスク」を抽出 → 既存と重複除去
- review_node   : 提案を interrupt() でDiscordに提示 → 承認時のみ Notion に書込

外部I/Oとブロッキング処理は asyncio.to_thread / LLMの ainvoke で実行し、
Discordゲートウェイのイベントループを塞がないようにする。
"""
from __future__ import annotations

import asyncio
import datetime as dt
import json
import logging
import re
from typing import Any, Optional, TypedDict

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt
from pydantic import BaseModel, Field

from .config import settings
from .llm import make_llm
from .tools import gcal, gmail, notion

log = logging.getLogger("agent.graph")


# --- LLM 構造化出力スキーマ ---
class Proposal(BaseModel):
    title: str = Field(description="日本語の簡潔なタスク名")
    due: Optional[str] = Field(default=None, description="締切 ISO8601(YYYY-MM-DD 等)。不明ならnull")
    reason: str = Field(description="このタスクを提案する根拠(どのメール/予定からか)")
    source: Optional[str] = Field(default=None, description="由来ID (gmail:.. / calendar:..)")


class ProposalList(BaseModel):
    proposals: list[Proposal]


class AgentState(TypedDict, total=False):
    emails: list[dict[str, Any]]
    events: list[dict[str, Any]]
    existing_tasks: list[dict[str, Any]]
    proposals: list[dict[str, Any]]
    applied: list[dict[str, Any]]
    approved: bool


_SYSTEM_PROMPT = (
    "あなたは優秀なタスク管理アシスタントです。"
    "ユーザーの未読/重要メール、今後の予定、既存のタスク一覧が与えられます。"
    "メールや予定の中から、ユーザーが新たに対応すべきアクション(タスク)を抽出してください。"
    "既存タスクと重複・実質同一のものは提案しないこと。"
    "各タスクには日本語の簡潔なタイトル、締切(分かれば ISO8601、不明なら null)、"
    "根拠(reason)、由来ID(source)を付けてください。"
    "締切は与えられた『本日の日付』を基準に、『6月20日』『明後日』等を必ず YYYY-MM-DD 形式へ変換すること。"
    "単なる通知や対応不要なものは含めないこと。"
)


def _norm(s: str) -> str:
    return "".join(s.split()).lower()


_JP_DATE = re.compile(r"(?:(\d{4})[/年-])?\s*(\d{1,2})月(\d{1,2})日")


def _due_fallback(text: str, today: dt.date) -> Optional[str]:
    """『6月20日』『2026年6月20日』等を ISO 日付へ変換。年が無ければ今年、過去日なら翌年扱い。"""
    m = _JP_DATE.search(text or "")
    if not m:
        return None
    year = int(m.group(1)) if m.group(1) else today.year
    try:
        d = dt.date(year, int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None
    if not m.group(1) and d < today:
        d = d.replace(year=year + 1)
    return d.isoformat()


async def crawl_node(state: AgentState) -> dict[str, Any]:
    emails, events, existing = await asyncio.gather(
        asyncio.to_thread(gmail.fetch_recent),
        asyncio.to_thread(gcal.fetch_upcoming),
        asyncio.to_thread(notion.list_tasks),
    )
    return {"emails": emails, "events": events, "existing_tasks": existing}


async def reconcile_node(state: AgentState) -> dict[str, Any]:
    payload = {
        "today": dt.date.today().isoformat(),
        "emails": state.get("emails", []),
        "events": state.get("events", []),
        "existing_tasks": [t["title"] for t in state.get("existing_tasks", [])],
        "max_proposals": settings.max_proposals_per_run,
    }
    llm = make_llm().with_structured_output(ProposalList)
    result: ProposalList = await llm.ainvoke(
        [
            SystemMessage(content=_SYSTEM_PROMPT),
            HumanMessage(content=json.dumps(payload, ensure_ascii=False, indent=2)),
        ]
    )

    # 締切の決定論的フォールバック用に、由来メール本文と予定開始日を引けるようにする
    today = dt.date.today()
    email_text = {
        e.get("source", ""): f"{e.get('subject', '')} {e.get('snippet', '')}"
        for e in state.get("emails", [])
    }
    event_due = {
        e.get("source", ""): (e.get("start", "") or "")[:10]  # 予定開始日(YYYY-MM-DD)
        for e in state.get("events", [])
    }

    # 既存タイトルとの重複をプログラム的にも除去 (LLMの取りこぼし対策)
    existing_norm = {_norm(t["title"]) for t in state.get("existing_tasks", [])}
    proposals: list[dict[str, Any]] = []
    seen: set[str] = set()
    for p in result.proposals:
        key = _norm(p.title)
        if not p.title or key in existing_norm or key in seen:
            continue
        seen.add(key)
        item = p.model_dump()
        if not item.get("due"):  # LLMが取りこぼした締切を決定論的に補完
            tokens = re.split(r"[,\s]+", item.get("source", "") or "")
            text = " ".join(email_text.get(t, "") for t in tokens) + f" {p.reason} {p.title}"
            due = _due_fallback(text, today)  # ① メール本文等の「○月○日」を解釈
            if not due:  # ② カレンダー予定由来なら予定開始日を締切に流用
                due = next((event_due[t] for t in tokens if event_due.get(t)), None)
            item["due"] = due
        proposals.append(item)
        if len(proposals) >= settings.max_proposals_per_run:
            break

    log.info("reconcile: 提案 %d件", len(proposals))
    return {"proposals": proposals}


async def review_node(state: AgentState) -> dict[str, Any]:
    proposals = state.get("proposals", [])
    decision = interrupt({"proposals": proposals})
    approved = bool(decision.get("approved")) if isinstance(decision, dict) else bool(decision)
    if not approved:
        return {"approved": False, "applied": []}

    applied: list[dict[str, Any]] = []
    for p in proposals:
        try:
            await asyncio.to_thread(notion.create_task, p["title"], p.get("due"), p.get("source"))
            applied.append(p)
        except Exception:
            log.exception("Notion作成失敗: %s", p.get("title"))
    return {"approved": True, "applied": applied}


def _route_after_reconcile(state: AgentState) -> str:
    return "review" if state.get("proposals") else "end"


def build_graph(checkpointer: BaseCheckpointSaver):
    builder = StateGraph(AgentState)
    builder.add_node("crawl", crawl_node)
    builder.add_node("reconcile", reconcile_node)
    builder.add_node("review", review_node)
    builder.add_edge(START, "crawl")
    builder.add_edge("crawl", "reconcile")
    builder.add_conditional_edges("reconcile", _route_after_reconcile, {"review": "review", "end": END})
    builder.add_edge("review", END)
    return builder.compile(checkpointer=checkpointer)
