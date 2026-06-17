r"""LangGraph グラフ定義 (Phase 1: タスク管理クロール MVP)。

    START -> crawl -> reconcile -(提案あり/承認不要)-> apply -> END
                               \-(提案あり/承認必要)-> review(interrupt) -(承認)-> apply -> END
                               \-(提案なし)----------------------------------------------> END

- crawl_node    : Gmail(重要/未読) + Calendar(今後の予定) + Notion(既存タスク) を並行取得
- reconcile_node: LLM(構造化出力)で「対応すべき新タスク」を抽出 → 既存と重複除去 → 由来を解決
- review_node   : (REQUIRE_APPROVAL=true 時のみ) 提案を interrupt() でDiscordに提示
- apply_node    : Notion へ書込 (タスク追加は低リスクのため既定で承認を挟まず直接挿入)

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

from . import memory, seen
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
    # 以下は reconcile で由来から解決して付与する (LLM出力ではない)
    source_url: Optional[str] = Field(default=None, description="由来へのリンク")
    source_label: Optional[str] = Field(default=None, description="由来の人間可読ラベル")


class ProposalList(BaseModel):
    proposals: list[Proposal]


class AgentState(TypedDict, total=False):
    emails: list[dict[str, Any]]
    events: list[dict[str, Any]]
    existing_tasks: list[dict[str, Any]]
    proposals: list[dict[str, Any]]
    applied: list[dict[str, Any]]
    approved: bool
    # --- orchestrator (#62 段階2) ---
    plan: list[dict[str, Any]]        # マネージャが書き出したサブタスク列
    scratchpad: list[dict[str, Any]]  # 各サブセッションの所見(タスク候補)
    plan_failed: bool                 # plan のLLM出力が解釈不能だった(→一括reconcileにフォールバック)


_SYSTEM_PROMPT = (
    "あなたは優秀なタスク管理アシスタントです。"
    "ユーザーの未読/重要メール、今後の予定、既存のタスク一覧が与えられます。"
    "メールや予定の中から、ユーザーが新たに対応すべきアクション(タスク)を抽出してください。"
    "既存タスクと重複・実質同一のものは提案しないこと。"
    "単なる通知や対応不要なものは含めないこと。"
    "締切は与えられた『本日の日付』を基準に、『6月20日』『明後日』等を必ず YYYY-MM-DD 形式へ変換すること。"
    "\n\n出力は説明文を一切付けず、次の形式の JSON 配列のみを返すこと:\n"
    '[{"title": "日本語の簡潔なタスク名", "due": "YYYY-MM-DD または null", '
    '"reason": "提案の根拠(どのメール/予定からか)", "source": "由来ID (gmail:.. / calendar:..)"}]\n'
    "対応すべきタスクが無ければ空配列 [] を返すこと。"
)


def _norm(s: str) -> str:
    return "".join(s.split()).lower()


_FENCE = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL)
_DUE_KEYS = ("due", "due_date", "deadline", "due_at", "期限", "締切")


def _extract_json(text: str) -> Any:
    """LLMの生テキストからJSON(配列/オブジェクト)を寛容に取り出す。失敗時は None。

    ローカル推論モデルは ```json フェンスや前置きの散文を付けることがあるため、
    フェンス内→先頭の [ / { 以降→全体、の順にパースを試みる。
    """
    if not text:
        return None
    m = _FENCE.search(text)
    candidates = [m.group(1).strip()] if m else []
    stripped = text.strip()
    for opener in ("[", "{"):
        idx = stripped.find(opener)
        if idx != -1:
            candidates.append(stripped[idx:])
    candidates.append(stripped)
    for c in candidates:
        try:
            return json.loads(c)
        except (json.JSONDecodeError, ValueError):
            continue
    return None


def _to_proposals(data: Any) -> list["Proposal"]:
    """パース済みJSONを Proposal のリストへ正規化 (キー別名・形ゆれを吸収)。"""
    if isinstance(data, dict):
        items = data.get("proposals") or data.get("tasks") or []
    elif isinstance(data, list):
        items = data
    else:
        items = []
    out: list[Proposal] = []
    for it in items:
        if not isinstance(it, dict):
            continue
        title = str(it.get("title") or "").strip()
        if not title:
            continue
        due = next((it[k] for k in _DUE_KEYS if it.get(k)), None)
        out.append(Proposal(title=title, due=due, reason=str(it.get("reason") or ""), source=it.get("source")))
    return out


async def _generate_proposals(payload: dict[str, Any], extra_system: str = "") -> list["Proposal"]:
    """LLMにタスク抽出させ、寛容パースで Proposal 化する。空応答は数回リトライ。

    qwen3.6 等のローカル推論モデルは format制約(structured output)下でまれに空応答を返すため、
    通常生成 + 自前パースの方が安定する (生出力は信頼できることを実機で確認済み)。
    また reasoning=False で thinking を無効化する。有効だと <think> が生成バジェットを
    使い切り done_reason=length で本文が空になることがあるため (実機で確認済み)。
    extra_system にはメモリ層の方針(directive)等を渡し、基本プロンプトの後ろに足す。
    """
    llm = make_llm(reasoning=False)
    system = _SYSTEM_PROMPT + (f"\n\n{extra_system}" if extra_system else "")
    messages = [
        SystemMessage(content=system),
        HumanMessage(content=json.dumps(payload, ensure_ascii=False, indent=2)),
    ]
    for attempt in range(1, 4):
        resp = await llm.ainvoke(messages)
        text = resp.content if hasattr(resp, "content") else str(resp)
        data = _extract_json(text if isinstance(text, str) else str(text))
        if data is not None:
            return _to_proposals(data)
        log.warning("reconcile: LLM出力をJSONとして解釈できず再試行 (%d/3)", attempt)
    log.error("reconcile: 3回ともJSON解釈に失敗。提案なしとして続行")
    return []


def _build_source_index(state: AgentState) -> dict[str, dict[str, str]]:
    """source ID -> {url, label} の索引を作る (Discord通知・Notionリンク用)。"""
    index: dict[str, dict[str, str]] = {}
    for e in state.get("emails", []):
        src = e.get("source", "")
        if src:
            subj = e.get("subject", "") or "(件名なし)"
            frm = e.get("from", "")
            index[src] = {"url": e.get("link", ""), "label": f"メール: {subj}".strip() + (f" — {frm}" if frm else "")}
    for ev in state.get("events", []):
        src = ev.get("source", "")
        if src:
            index[src] = {"url": ev.get("link", ""), "label": f"予定: {ev.get('summary', '(無題の予定)')}"}
    return index


def _resolve_source(source: Optional[str], index: dict[str, dict[str, str]]) -> dict[str, Optional[str]]:
    """提案の source (複数IDの場合あり) から最初に解決できた url/label を返す。"""
    for tok in re.split(r"[,\s]+", source or ""):
        if tok in index:
            return {"source_url": index[tok].get("url") or None, "source_label": index[tok].get("label")}
    return {"source_url": None, "source_label": None}


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


def finalize_proposals(generated: list["Proposal"], state: AgentState) -> list[dict[str, Any]]:
    """生成された Proposal 群を最終化する (reconcile と orchestrator の integrate で共用)。

    既存/記憶済み/同一バッチ内の重複除去 → 由来リンク・ラベル解決 →
    締切の決定論的フォールバック(メール本文の「○月○日」/予定開始日) → 件数上限、を適用する。
    seen.is_seen はファイル読み(同期)だが件数が少なく呼び出し側の挙動を維持するため同期のままにする。
    """
    today = dt.date.today()
    # 締切の決定論的フォールバック用に、由来メール本文と予定開始日を引けるようにする
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
    source_index = _build_source_index(state)
    proposals: list[dict[str, Any]] = []
    seen_titles: set[str] = set()
    for p in generated:
        key = _norm(p.title)
        if not p.title or key in existing_norm or key in seen_titles:
            continue
        if seen.is_seen(p.source):  # 過去に反映/却下済みの由来は再提案しない
            log.info("finalize: 記憶済みの由来をスキップ source=%s", p.source)
            continue
        seen_titles.add(key)
        item = p.model_dump()
        if not item.get("due"):  # LLMが取りこぼした締切を決定論的に補完
            tokens = re.split(r"[,\s]+", item.get("source", "") or "")
            text = " ".join(email_text.get(t, "") for t in tokens) + f" {p.reason} {p.title}"
            due = _due_fallback(text, today)  # ① メール本文等の「○月○日」を解釈
            if not due:  # ② カレンダー予定由来なら予定開始日を締切に流用
                due = next((event_due[t] for t in tokens if event_due.get(t)), None)
            item["due"] = due
        item.update(_resolve_source(item.get("source"), source_index))  # 由来リンク/ラベルを解決
        proposals.append(item)
        if len(proposals) >= settings.max_proposals_per_run:
            break
    return proposals


async def crawl_node(state: AgentState) -> dict[str, Any]:
    emails, events, existing = await asyncio.gather(
        asyncio.to_thread(gmail.fetch_recent),
        asyncio.to_thread(gcal.fetch_upcoming),
        asyncio.to_thread(notion.list_tasks),
    )
    emails = memory.filter_denied(emails)  # deny-list の送信元は除外(段階C)
    return {"emails": emails, "events": events, "existing_tasks": existing}


async def reconcile_node(state: AgentState) -> dict[str, Any]:
    payload = {
        "today": dt.date.today().isoformat(),
        "emails": state.get("emails", []),
        "events": state.get("events", []),
        "existing_tasks": [t["title"] for t in state.get("existing_tasks", [])],
        "max_proposals": settings.max_proposals_per_run,
    }
    # メモリ層の方針(task領域+global)を常時注入し、ゴミ提案を抑制する
    extra = await asyncio.to_thread(memory.directives_block, "task")
    generated = await _generate_proposals(payload, extra_system=extra)
    proposals = finalize_proposals(generated, state)
    log.info("reconcile: 提案 %d件", len(proposals))
    return {"proposals": proposals}


async def review_node(state: AgentState) -> dict[str, Any]:
    """REQUIRE_APPROVAL=true 時のみ経由。Discordに提案を提示し承認結果を受け取る。"""
    decision = interrupt({"proposals": state.get("proposals", [])})
    approved = bool(decision.get("approved")) if isinstance(decision, dict) else bool(decision)
    if not approved:  # 却下された由来は記憶し、次回以降は再提案しない
        await asyncio.to_thread(seen.mark, state.get("proposals", []), "rejected")
    return {"approved": approved}


async def apply_node(state: AgentState) -> dict[str, Any]:
    """提案を Notion に書き込む。由来リンク・ステータス・挿入者タグも併せて付与する。"""
    applied: list[dict[str, Any]] = []
    for p in state.get("proposals", []):
        try:
            await asyncio.to_thread(
                notion.create_task,
                p["title"],
                p.get("due"),
                p.get("source"),
                p.get("source_url"),
                p.get("source_label"),
            )
            applied.append(p)
        except Exception:
            log.exception("Notion作成失敗: %s", p.get("title"))
    if applied:  # 反映済みの由来は記憶し、削除後も再提案しない
        await asyncio.to_thread(seen.mark, applied, "applied")
    log.info("apply: Notion反映 %d件", len(applied))
    return {"applied": applied}


def _route_after_reconcile(state: AgentState) -> str:
    if not state.get("proposals"):
        return "end"
    return "review" if settings.require_approval else "apply"


def _route_after_review(state: AgentState) -> str:
    return "apply" if state.get("approved") else "end"


def build_graph(checkpointer: BaseCheckpointSaver):
    builder = StateGraph(AgentState)
    builder.add_node("crawl", crawl_node)
    builder.add_node("reconcile", reconcile_node)
    builder.add_node("review", review_node)
    builder.add_node("apply", apply_node)
    builder.add_edge(START, "crawl")
    builder.add_edge("crawl", "reconcile")
    builder.add_conditional_edges(
        "reconcile", _route_after_reconcile, {"review": "review", "apply": "apply", "end": END}
    )
    builder.add_conditional_edges("review", _route_after_review, {"apply": "apply", "end": END})
    builder.add_edge("apply", END)
    return builder.compile(checkpointer=checkpointer)
