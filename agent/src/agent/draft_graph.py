r"""メール返信案フロー (Phase 2a)。

    START -> gather -> compose -> END

- gather_node : 返信候補メール(本文・件名込み)を取得し、提示済み(記憶済み)を除外
- compose_node: LLMが「返信が必要なメール」を選び日本語の返信案を生成

完全な読み取り専用。Gmailへの書込(下書き作成/送信)は一切行わず、生成した返信案は
Discordに提示するだけ(runtime が送信し、提示済みの由来を scope="draft" で記憶)。
ユーザーは案をGmailに手動で貼り付けて送る。
"""
from __future__ import annotations

import asyncio
import datetime as dt
import json
import logging
from typing import Any, TypedDict

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, START, StateGraph

from . import memory, seen
from .availability import free_slots
from .config import settings
from .graph import _extract_json
from .llm import make_llm
from .tools import gcal, gmail

log = logging.getLogger("agent.draft_graph")

_JST = dt.timezone(dt.timedelta(hours=9))
_WD = ("月", "火", "水", "木", "金", "土", "日")


class DraftState(TypedDict, total=False):
    candidates: list[dict[str, Any]]
    events: list[dict[str, Any]]
    suggestions: list[dict[str, Any]]


_SYSTEM_PROMPT = (
    "あなたはユーザーのメール返信を支援する優秀なアシスタントです。"
    "未読/重要メールの一覧(本文付き)と、ユーザーのカレンダー予定(today以降の予定の開始/終了)、"
    "現在日時が与えられます。"
    "この中から『ユーザー本人が個人的に返信すべきメール』だけを選び、丁寧な日本語の返信案を作成してください。"
    "広告・通知・自動配信・採用案内・メルマガなど、返信が不要なものは絶対に含めないこと。"
    "返信は簡潔かつ礼儀正しく。"
    "各メールに past_examples(過去に作成した類似の返信案)が付いている場合は、"
    "その文体・敬語・署名・言い回しのトーンを踏襲して一貫性を保つこと。"
    "\n【日程調整の場合】free_slots は『予定が入っていない空き時間帯(レンジ)』の一覧です。"
    "提案する日時は必ずいずれかの free_slots の範囲内に完全に収まる時刻にすること"
    "(一覧に無い日や範囲外の時刻は絶対に提案しない)。範囲内であれば具体的な時刻(例:13:00〜13:30)を自由に切り出してよい。"
    "相手が指定する条件(時間帯〔例:12〜16時〕・候補数〔例:5つ〕・所要時間)を必ず守り、"
    "その条件を満たす候補を free_slots の範囲内から選んで提案すること。候補数の指定が無ければ3件。"
    "条件を満たす空きが足りない場合は、出せる分だけ具体的に提案したうえで不足分は正直にその旨を伝えること"
    "(『確認中』『追って連絡』などと曖昧に先送りしない)。"
    "カレンダーから判断できない情報(相手都合・場所など)だけは[ ]で空欄として残してよい。"
    "\n\n出力は説明文を一切付けず、次の形式の JSON 配列のみを返すこと:\n"
    '[{"source": "対象メールの由来ID(gmail:..)", "body": "返信案の本文(日本語)", '
    '"reason": "なぜ返信が必要かの一言"}]\n'
    "返信すべきメールが無ければ空配列 [] を返すこと。"
)


async def _generate_suggestions(payload: dict[str, Any], extra_system: str = "") -> list[dict[str, Any]]:
    """LLMに返信要否の判別と返信案生成をさせ、寛容パースで dict 配列にする。

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
            items = data if isinstance(data, list) else data.get("replies") or data.get("drafts") or []
            return [it for it in items if isinstance(it, dict) and it.get("source") and it.get("body")]
        log.warning("compose: LLM出力をJSONとして解釈できず再試行 (%d/3)", attempt)
    log.error("compose: 3回ともJSON解釈に失敗。返信案なしとして続行")
    return []


async def gather_node(state: DraftState) -> dict[str, Any]:
    candidates, events = await asyncio.gather(
        asyncio.to_thread(gmail.fetch_reply_candidates),
        asyncio.to_thread(gcal.fetch_upcoming),  # 日程調整の返信で空き時間を埋めるため
    )
    candidates = memory.filter_denied(candidates)  # deny-list の送信元は除外(段階C)
    # すでに返信案を提示済みのメールは除外 (毎回の再提示を防ぐ)
    fresh = [c for c in candidates if not seen.is_seen(c.get("source"), scope="draft")]
    # LLMへ渡す候補数を上限で絞る (本文を丸ごと渡すためプロンプト肥大→num_ctx超過を防ぐ)。
    # あふれた分は記憶しないので次サイクル以降に回る。
    capped = fresh[: settings.draft_max_candidates]
    log.info(
        "gather: 候補 %d件 (記憶除外後 %d件 → 上限 %d件に制限) / 予定 %d件",
        len(candidates), len(fresh), len(capped), len(events),
    )
    return {"candidates": capped, "events": events}


async def compose_node(state: DraftState) -> dict[str, Any]:
    candidates = state.get("candidates", [])
    if not candidates:
        return {"suggestions": []}

    now = dt.datetime.now(_JST)
    slots = free_slots(state.get("events", []), now)
    # RAG(Phase 2b): 各メールに類似の過去返信例を付与 (MEMORY_ENABLED=false なら空で素通り)
    emails_payload: list[dict[str, Any]] = []
    for c in candidates:
        item = {"source": c.get("source"), "from": c.get("from"),
                "subject": c.get("subject"), "body": c.get("body")}
        examples = await asyncio.to_thread(
            memory.recall, f"{c.get('subject', '')} {(c.get('body') or '')[:500]}", "draft"
        )
        if examples:
            item["past_examples"] = [ex["text"] for ex in examples]
        emails_payload.append(item)
    payload = {
        "now": f"{now:%Y-%m-%d %H:%M}({_WD[now.weekday()]})",
        "free_slots": [s["label"] for s in slots],  # 決定論的に算出した実在の空き枠
        "emails": emails_payload,
    }
    log.info("compose: 空き枠 %d件を提示", len(slots))
    # メモリ層の方針(draft領域+global)を常時注入し、文体・対応の一貫性を保つ
    extra = await asyncio.to_thread(memory.directives_block, "draft")
    generated = await _generate_suggestions(payload, extra_system=extra)

    by_source = {c.get("source"): c for c in candidates}
    suggestions: list[dict[str, Any]] = []
    seen_src: set[str] = set()
    for g in generated:
        src = g.get("source")
        cand = by_source.get(src)
        if not cand or src in seen_src:
            continue
        seen_src.add(src)
        suggestions.append(
            {
                "source": src,
                "to": cand.get("from", ""),       # 返信先(参考表示)
                "subject": cand.get("subject", ""),
                "body": str(g.get("body", "")),
                "reason": str(g.get("reason", "")),
                "link": cand.get("link", ""),
            }
        )
        if len(suggestions) >= settings.draft_max_per_run:
            break

    # RAG(Phase 2b): 今回の返信判断を記憶し、次回以降の文脈(文体の一貫性)に使う
    if suggestions:
        await asyncio.to_thread(
            memory.remember,
            [
                {
                    "id": s["source"],
                    "text": f"件名: {s['subject']}\n返信案:\n{s['body']}",
                    "metadata": {"source": s["source"], "subject": s["subject"], "to": s["to"]},
                }
                for s in suggestions
            ],
            "draft",
        )

    log.info("compose: 返信案 %d件", len(suggestions))
    return {"suggestions": suggestions}


def build_draft_graph(checkpointer: BaseCheckpointSaver):
    builder = StateGraph(DraftState)
    builder.add_node("gather", gather_node)
    builder.add_node("compose", compose_node)
    builder.add_edge(START, "gather")
    builder.add_edge("gather", "compose")
    builder.add_edge("compose", END)
    return builder.compile(checkpointer=checkpointer)
