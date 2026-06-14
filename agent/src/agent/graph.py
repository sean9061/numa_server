"""LangGraph グラフ定義。

Phase 0: 配線実証用の最小 HITL ループ。
    START -> crawl -> review(interrupt で停止) -> END

review ノードは interrupt() で提案をユーザー(Discord)に渡して停止する。
Discord のボタン承認で Command(resume=...) を渡すと review ノードの先頭から
再実行され、interrupt() が承認結果を返す → その分だけ「反映」する。

Phase 1 では crawl を Moodle/Gmail/Calendar 取得に、review の反映処理を
Notion 書込に差し替える。グラフの骨格はそのまま再利用できる。
"""
from __future__ import annotations

from typing import Any, TypedDict

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt


class AgentState(TypedDict, total=False):
    proposals: list[dict[str, Any]]   # クロールで生成された提案
    applied: list[dict[str, Any]]     # 承認され反映された項目
    approved: bool                    # ユーザーの承認結果


def crawl_node(state: AgentState) -> dict[str, Any]:
    """Phase 0: ダミー提案を返す。Phase 1 で実クロール+LLM突合に差し替える。"""
    proposals = [
        {"title": "レポート提出: 情報理論 第3回", "due": "2026-06-20"},
        {"title": "メール返信: 研究室ゼミの日程調整", "due": "2026-06-16"},
    ]
    return {"proposals": proposals}


def review_node(state: AgentState) -> dict[str, Any]:
    """提案をユーザーに提示し、承認を待つ(HITL)。"""
    decision = interrupt({"proposals": state.get("proposals", [])})
    approved = bool(decision.get("approved")) if isinstance(decision, dict) else bool(decision)
    if approved:
        # Phase 0: 反映=エコー。Phase 1 で Notion 書込に差し替える。
        return {"approved": True, "applied": state.get("proposals", [])}
    return {"approved": False, "applied": []}


def build_graph(checkpointer: BaseCheckpointSaver):
    builder = StateGraph(AgentState)
    builder.add_node("crawl", crawl_node)
    builder.add_node("review", review_node)
    builder.add_edge(START, "crawl")
    builder.add_edge("crawl", "review")
    builder.add_edge("review", END)
    return builder.compile(checkpointer=checkpointer)
