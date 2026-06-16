r"""自然言語アシスタント(チャット + 方針管理) — 段階B (docs/agent-memory.md §6)。

Discordの会話に対し、**基本は通常のチャットAIとして自然に応答**する。
そのうえで、ユーザーが明示的にエージェントの『振る舞いの方針(directive)』や基本情報を
覚える/変える/忘れる/一覧と指示したときだけ、メモリ層への操作(action)を併せて返す。

1回のLLM呼び出しで必ず会話応答(reply)を返し、操作は任意(action)。実際の適用
(確認HITL・書込)は discordbot 側で行う。司書はエージェント本体と同一プロセスで動くため、
directive を更新すると `_dir_cache` が即時共有され、次回クロールから再起動なしで反映される。
"""
from __future__ import annotations

import logging
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from . import memory
from .graph import _extract_json
from .llm import make_llm

log = logging.getLogger("agent.librarian")

VALID_DOMAINS = {"global", "task", "draft", "home"}

_SYSTEM = (
    "あなたはユーザー(numa)の個人アシスタント『Numa Agent』です。日本語で、通常のチャットAIの"
    "ように自然に会話・質問対応してください。あなたはエージェントの『振る舞いの方針(directive)』"
    "とユーザーの基本情報も管理しています。\n"
    "基本はあくまで普通の会話です。ユーザーが明確に『方針や基本情報を覚えて/変えて/忘れて』、"
    "または『何を覚えてる?』と求めたときだけ、メモリ操作を行ってください。"
    "少しでも迷うなら操作せず普通に会話する(むやみにメモリを書き換えない)。\n\n"
    "必ず次のJSONだけを返す(前後に説明文を付けない):\n"
    '{"reply": "ユーザーに見せる会話文(必須・日本語)", '
    '"action": "none"|"remember"|"forget"|"list", '
    '"directives": [{"text": "方針/基本情報の一文", "domain": "global|task|draft|home"}], '
    '"targets": ["忘れる対象のid"]}\n'
    "- 通常の会話・質問・雑談 → action=\"none\"。reply で普通に答える。\n"
    "- 覚えて/変えて(方針・基本情報の追加変更) → action=\"remember\"、directives に入れる。"
    "reply は『了解、こう覚えますね』等の一言。基本情報は domain=global。\n"
    "- 忘れて → action=\"forget\"、下記『現在の方針』の id を targets に。reply は一言。\n"
    "- 何覚えてる? → action=\"list\"。reply は一言。\n"
    "domain: global=全般/基本情報, task=タスク抽出, draft=メール返信案, home=家電。"
)


def _directives_context() -> str:
    items = memory.list_directives()
    if not items:
        return "\n\n現在の方針: (なし)"
    lines = "\n".join(f"- id={it['id']} ({it['domain']}) {it['text']}" for it in items)
    return "\n\n現在の方針:\n" + lines


async def _invoke(messages: list[Any]) -> str:
    """アシスタントLLMを呼び生テキストを返す(JSON抽出は呼び出し側)。"""
    llm = make_llm(reasoning=False)
    resp = await llm.ainvoke(messages)
    return resp.content if hasattr(resp, "content") else str(resp)


async def respond(message: str, history: list[tuple[str, str]] | None = None) -> dict[str, Any]:
    """会話メッセージに応答する。常に reply を返し、指示時のみ action を伴う。

    history は短期セッションの直近のやり取り [(role, content), …]
    (role は "user"/"assistant")。多ターンの文脈を保つために渡す。
    返り値: {reply, action(none/remember/forget/list), directives, targets}
    JSONが壊れたら生テキストをそのままチャット応答に使う(普通に会話できるよう安全側)。
    """
    messages: list[Any] = [SystemMessage(content=_SYSTEM + _directives_context())]
    for role, content in history or []:
        messages.append(AIMessage(content=content) if role == "assistant" else HumanMessage(content=content))
    messages.append(HumanMessage(content=message))

    raw = await _invoke(messages)
    text = raw if isinstance(raw, str) else str(raw)
    data = _extract_json(text)
    if not isinstance(data, dict):
        return {"action": "none", "reply": text.strip() or "うまく応答できませんでした。",
                "directives": [], "targets": []}

    action = data.get("action")
    if action not in {"remember", "forget", "list", "none"}:
        action = "none"
    out: dict[str, Any] = {
        "action": action,
        "reply": str(data.get("reply") or "").strip(),
        "directives": [],
        "targets": [],
    }

    if action == "remember":
        for d in data.get("directives") or []:
            if isinstance(d, dict) and str(d.get("text") or "").strip():
                dom = d.get("domain") if d.get("domain") in VALID_DOMAINS else "global"
                out["directives"].append({"text": str(d["text"]).strip(), "domain": dom})
        if not out["directives"]:
            out["action"] = "none"  # 操作実体が無ければ普通の会話に落とす
    elif action == "forget":
        valid = {it["id"] for it in memory.list_directives()}
        out["targets"] = [t for t in (data.get("targets") or []) if t in valid]
        if not out["targets"]:
            out["action"] = "none"
            out["reply"] = out["reply"] or "どの方針を忘れるか特定できませんでした。"

    if out["action"] == "none" and not out["reply"]:
        out["reply"] = "(応答を生成できませんでした)"
    return out
