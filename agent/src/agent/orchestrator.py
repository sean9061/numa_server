r"""マネージャ・オーケストレータ (#62 段階2)。

    START -> gather -> plan -(計画あり)-> execute -> integrate -> (apply|review) -> END
                            \-(計画空)----------------> integrate ->（提案なし）-> END
                            \-(解釈不能)-> reconcile(フォールバック一括) -> (apply|review) -> END

狙いは「1回のクロールで全リソースを一度にLLMへ渡す」のをやめ、コンテキストを分割すること。

- gather   : Gmail/Calendar/Notion を取得 (graph.crawl_node を再利用)
- plan     : マネージャLLMがメール/予定の**索引(コンパクト)**だけを見て、作業計画
             (サブタスク列: inspect_email / check_calendar / web_research) をJSONで書き出す
- execute  : サブタスクを**1件ずつ逐次**にサブセッション実行。inspect_email は
             orchestrator_batch_size 件ずつに**再分割**して各呼び出しを num_ctx 内に収める
             (マネージャがまとめ過ぎても安全)。所見(タスク候補)を scratchpad に蓄積
- integrate: scratchpad の候補だけをLLMに渡し重複統合 → finalize_proposals で最終化
- apply/review: graph 側を再利用

ローカルLLM(35B MoE)は並行リクエストでクラッシュするため、execute は**直列**に await する。
plan の出力が解釈不能なときは従来の一括 reconcile にフォールバックして「提案ゼロで素通り」を防ぐ。
web_research 型は段階3で実装。段階2ではスキップ(ログのみ)。
"""
from __future__ import annotations

import asyncio
import datetime as dt
import json
import logging
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, START, StateGraph

from . import memory
from .config import settings
from .graph import (
    AgentState,
    Proposal,
    _extract_json,
    _route_after_reconcile,
    _route_after_review,
    _to_proposals,
    apply_node,
    crawl_node,
    finalize_proposals,
    reconcile_node,
    review_node,
)
from .llm import make_llm

log = logging.getLogger("agent.orchestrator")


# --- プロンプト ---
_PLAN_SYSTEM = (
    "あなたはタスク管理エージェントの『マネージャ』です。"
    "ユーザーの未読/重要メールの索引、今後の予定の索引、既存タスク一覧が与えられます。"
    "新タスクを抽出するための作業計画を、サブタスクの列として書き出してください。"
    "サブタスクの型は次の3つ:\n"
    "- inspect_email: メールを精査してタスクがあるか判断する。targets にメールのID(gmail:..)を入れる。\n"
    "- check_calendar: 予定を精査して準備/対応タスクがあるか判断する。targets に予定ID(calendar:..)を入れる。\n"
    "- web_research: 判断に外部情報が必要なときだけ。goal に調べたいことを書く(targets不要)。\n"
    "メールは1つの inspect_email に詰め込み過ぎず、関連するものをまとめて複数のサブタスクに分けること。"
    "既存タスクと重複しそうな対象は計画に含めないこと。単なる通知や対応不要なものは無視すること。"
    "\n\n出力は説明を付けず、次の形式の JSON 配列のみ:\n"
    '[{"type": "inspect_email", "targets": ["gmail:.."], "goal": "何を確認するか"}]\n'
    "やることが無ければ空配列 [] を返すこと。"
)

_INSPECT_SYSTEM = (
    "あなたはタスク抽出アシスタントです。与えられた1通以上のメールそれぞれについて、"
    "ユーザーが新たに対応すべきタスクがあるか判断し、あるものだけ抽出してください。"
    "単なる通知・対応不要なものは含めないこと。"
    "締切は与えられた『本日の日付』を基準に『6月20日』『明後日』等を必ず YYYY-MM-DD へ変換すること。"
    "\n\n出力は説明を付けず、次の形式の JSON 配列のみ:\n"
    '[{"title": "日本語の簡潔なタスク名", "due": "YYYY-MM-DD または null", '
    '"reason": "根拠", "source": "由来ID (gmail:..)"}]\n'
    "対応すべきタスクが無ければ空配列 [] を返すこと。"
)

_CALENDAR_SYSTEM = (
    "あなたはタスク抽出アシスタントです。与えられた予定から、ユーザーが事前に"
    "準備・対応すべきタスク(資料準備・移動手配・事前連絡など)があるものだけ抽出してください。"
    "予定そのものの再掲(『会議に出る』等)や対応不要なものは含めないこと。"
    "締切は『本日の日付』を基準に YYYY-MM-DD へ変換すること(予定開始日を流用可)。"
    "\n\n出力は説明を付けず、次の形式の JSON 配列のみ:\n"
    '[{"title": "...", "due": "YYYY-MM-DD または null", "reason": "根拠", "source": "由来ID (calendar:..)"}]\n'
    "無ければ空配列 [] を返すこと。"
)

_INTEGRATE_SYSTEM = (
    "あなたはタスク管理アシスタントの『編集者』です。"
    "各サブタスクが見つけたタスク候補の一覧が与えられます。"
    "実質的に重複する候補は1つに統合し、ユーザーが対応すべき最終タスク一覧に整えてください。"
    "情報を新たに創作しないこと(与えられた候補の範囲で統合・整理するだけ)。"
    "\n\n出力は説明を付けず、次の形式の JSON 配列のみ:\n"
    '[{"title": "...", "due": "YYYY-MM-DD または null", "reason": "根拠", "source": "由来ID"}]'
)


async def _llm_to_proposals(system: str, payload: dict[str, Any], extra_system: str = "") -> list[Proposal] | None:
    """LLMにJSON配列を生成させ Proposal 化する。3回とも解釈不能なら None。

    graph._generate_proposals と同じ「通常生成+寛容パース+リトライ」方針(reasoning=False)。
    None と [] を区別する(None=モデル故障→フォールバック判断に使う / []=該当なし)。
    """
    llm = make_llm(reasoning=False)
    sys = system + (f"\n\n{extra_system}" if extra_system else "")
    messages = [
        SystemMessage(content=sys),
        HumanMessage(content=json.dumps(payload, ensure_ascii=False, indent=2)),
    ]
    for attempt in range(1, 4):
        resp = await llm.ainvoke(messages)
        text = resp.content if hasattr(resp, "content") else str(resp)
        data = _extract_json(text if isinstance(text, str) else str(text))
        if data is not None:
            return _to_proposals(data)
        log.warning("orchestrator: LLM出力をJSONとして解釈できず再試行 (%d/3)", attempt)
    return None


def _chunks(items: list[Any], size: int):
    for i in range(0, len(items), max(1, size)):
        yield items[i : i + size]


# --- ノード ---
async def plan_node(state: AgentState) -> dict[str, Any]:
    """マネージャLLMにサブタスク計画を書き出させる(渡すのは索引=コンパクトな要約のみ)。"""
    emails_idx = [
        {
            "id": e.get("source", ""),
            "from": e.get("from", ""),
            "subject": e.get("subject", ""),
            "snippet": (e.get("snippet", "") or "")[:120],
        }
        for e in state.get("emails", [])
    ]
    events_idx = [
        {"id": ev.get("source", ""), "summary": ev.get("summary", ""), "start": ev.get("start", "")}
        for ev in state.get("events", [])
    ]
    payload = {
        "today": dt.date.today().isoformat(),
        "emails": emails_idx,
        "events": events_idx,
        "existing_tasks": [t["title"] for t in state.get("existing_tasks", [])],
        "batch_size": settings.orchestrator_batch_size,
        "max_subtasks": settings.orchestrator_max_subtasks,
    }
    extra = await asyncio.to_thread(memory.directives_block, "task")
    llm = make_llm(reasoning=False)
    sys = _PLAN_SYSTEM + (f"\n\n{extra}" if extra else "")
    messages = [
        SystemMessage(content=sys),
        HumanMessage(content=json.dumps(payload, ensure_ascii=False, indent=2)),
    ]
    plan: list[dict[str, Any]] | None = None
    for attempt in range(1, 4):
        resp = await llm.ainvoke(messages)
        text = resp.content if hasattr(resp, "content") else str(resp)
        data = _extract_json(text if isinstance(text, str) else str(text))
        if isinstance(data, dict):
            data = data.get("plan") or data.get("subtasks") or []
        if isinstance(data, list):
            plan = [s for s in data if isinstance(s, dict) and s.get("type")]
            break
        log.warning("plan: LLM出力をJSONとして解釈できず再試行 (%d/3)", attempt)
    if plan is None:
        log.error("plan: 計画の解釈に3回失敗 → 一括reconcileにフォールバック")
        return {"plan_failed": True}
    plan = plan[: settings.orchestrator_max_subtasks]
    log.info("plan: サブタスク %d件 (%s)", len(plan), ", ".join(s.get("type", "?") for s in plan) or "なし")
    return {"plan": plan}


async def execute_node(state: AgentState) -> dict[str, Any]:
    """サブタスクを1件ずつ逐次実行し、所見(タスク候補)を scratchpad に蓄積する。"""
    today = dt.date.today().isoformat()
    emails_by_id = {e.get("source", ""): e for e in state.get("emails", [])}
    events_by_id = {ev.get("source", ""): ev for ev in state.get("events", [])}
    findings: list[dict[str, Any]] = []

    for st in state.get("plan", []):
        typ = st.get("type")
        targets = [t for t in (st.get("targets") or []) if t]
        goal = st.get("goal", "")
        if typ == "inspect_email":
            detail = [emails_by_id[t] for t in targets if t in emails_by_id]
            if not detail:
                continue
            # マネージャがまとめ過ぎても安全なよう batch_size 件ずつ再分割して逐次に精査
            for batch in _chunks(detail, settings.orchestrator_batch_size):
                payload = {"today": today, "goal": goal, "emails": batch}
                cands = await _llm_to_proposals(_INSPECT_SYSTEM, payload)
                if cands:
                    findings.extend(p.model_dump() for p in cands)
        elif typ == "check_calendar":
            detail = [events_by_id[t] for t in targets if t in events_by_id] or state.get("events", [])
            if not detail:
                continue
            payload = {"today": today, "goal": goal, "events": detail}
            cands = await _llm_to_proposals(_CALENDAR_SYSTEM, payload)
            if cands:
                findings.extend(p.model_dump() for p in cands)
        elif typ == "web_research":
            log.info("execute: web_research は段階3で実装予定。スキップ goal=%s", goal)
        else:
            log.warning("execute: 未知のサブタスク型をスキップ type=%s", typ)

    log.info("execute: 所見(タスク候補) %d件", len(findings))
    return {"scratchpad": findings}


async def integrate_node(state: AgentState) -> dict[str, Any]:
    """scratchpad の候補を統合し finalize_proposals で最終化する。"""
    findings = state.get("scratchpad", [])
    if not findings:
        log.info("integrate: 候補なし → 提案 0件")
        return {"proposals": []}
    extra = await asyncio.to_thread(memory.directives_block, "task")
    generated = await _llm_to_proposals(_INTEGRATE_SYSTEM, {"candidates": findings}, extra_system=extra)
    if generated is None:  # 統合LLMが故障 → 候補をそのまま採用(取りこぼし防止)
        log.warning("integrate: 統合に失敗 → 候補をそのまま finalize")
        generated = _to_proposals(findings)
    proposals = finalize_proposals(generated, state)
    log.info("integrate: 最終提案 %d件", len(proposals))
    return {"proposals": proposals}


def _route_after_plan(state: AgentState) -> str:
    if state.get("plan_failed"):
        return "fallback"
    if not state.get("plan"):
        return "integrate"  # 何もすることがない → integrate が空提案を返す
    return "execute"


def build_orchestrator_graph(checkpointer: BaseCheckpointSaver):
    builder = StateGraph(AgentState)
    builder.add_node("gather", crawl_node)        # graph.crawl_node を再利用
    builder.add_node("plan", plan_node)
    builder.add_node("execute", execute_node)
    builder.add_node("integrate", integrate_node)
    builder.add_node("reconcile", reconcile_node)  # plan失敗時のフォールバック(従来の一括)
    builder.add_node("review", review_node)        # graph.review_node を再利用
    builder.add_node("apply", apply_node)          # graph.apply_node を再利用

    builder.add_edge(START, "gather")
    builder.add_edge("gather", "plan")
    builder.add_conditional_edges(
        "plan", _route_after_plan,
        {"execute": "execute", "integrate": "integrate", "fallback": "reconcile"},
    )
    builder.add_edge("execute", "integrate")
    # integrate と reconcile はどちらも proposals を載せるので同じ分岐に合流させる
    builder.add_conditional_edges(
        "integrate", _route_after_reconcile, {"review": "review", "apply": "apply", "end": END}
    )
    builder.add_conditional_edges(
        "reconcile", _route_after_reconcile, {"review": "review", "apply": "apply", "end": END}
    )
    builder.add_conditional_edges("review", _route_after_review, {"apply": "apply", "end": END})
    builder.add_edge("apply", END)
    return builder.compile(checkpointer=checkpointer)
