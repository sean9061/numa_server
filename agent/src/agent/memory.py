r"""エージェント・メモリ層 (設計: docs/agent-memory.md)。
全動作(タスク抽出・返信案・将来の家電制御…)が共通参照する単一の振る舞いメモリ。

二層構成:
  1. **directive層 (常時注入)** — 「メルマガ由来はタスク化しない」等のルール・方針。
     `data/directives.json` に人間可読で永続化。埋め込み不要・常時ON(空なら無効果)。
     domain(global/task/draft/home…)で全動作横断 or 限定。`directives_block(domain)` で
     global+domain の active を優先度順・予算内に整形して取り出す。
  2. **example層 (RAG)** — 過去の返信判断などの事例。`nomic-embed-text`(Ollama)で埋め込み
     Chroma(`{data_dir}/chroma`)に永続化し近傍検索。`MEMORY_ENABLED=false`(既定)なら
     `recall()=[]`/`remember()=no-op`(依存が重い任意機能)。

`context(domain, query)` は両層を1つのプロンプトブロックに統合する糖衣。
外部I/O(Ollama埋め込み・Chroma)は遅延importで包み、無効時/未インストール時でも
import を壊さない。失敗しても本体フローは止めない(例外は握りつぶしログのみ・空で続行)。
同期APIなので呼び出し側は asyncio.to_thread から使う。
"""
from __future__ import annotations

import datetime as dt
import json
import logging
import os
import threading
import uuid
from typing import Any

from .config import settings

log = logging.getLogger("agent.memory")

# 遅延初期化するシングルトン (プロセス内で使い回す)
_embeddings: Any = None
_collections: dict[str, Any] = {}

# directive層の永続キャッシュ (seen.py と同方式)
_dir_lock = threading.Lock()
_dir_cache: dict[str, dict] | None = None


def _chroma_dir() -> str:
    return os.path.join(settings.data_dir, "chroma")


def _get_embeddings() -> Any:
    """OllamaEmbeddings を遅延生成して使い回す。"""
    global _embeddings
    if _embeddings is None:
        from langchain_ollama import OllamaEmbeddings  # 遅延import

        _embeddings = OllamaEmbeddings(
            base_url=settings.ollama_base_url, model=settings.embed_model
        )
    return _embeddings


def _get_collection(namespace: str) -> Any:
    """名前空間ごとの Chroma コレクションを遅延生成して使い回す(cosine距離)。"""
    if namespace not in _collections:
        import chromadb  # 遅延import

        os.makedirs(_chroma_dir(), exist_ok=True)
        client = chromadb.PersistentClient(path=_chroma_dir())
        _collections[namespace] = client.get_or_create_collection(
            name=namespace, metadata={"hnsw:space": "cosine"}
        )
    return _collections[namespace]


def remember(items: list[dict[str, Any]], namespace: str = "draft") -> None:
    """事例を埋め込んで永続化する(idで upsert するので再実行でも重複しない)。

    items: [{"id": str, "text": str, "metadata": dict}] 形式。
    無効時・item無し・失敗時は何もしない(返信案フローを止めないため)。
    """
    if not settings.memory_enabled:
        return
    valid = [it for it in items if it.get("id") and it.get("text")]
    if not valid:
        return
    try:
        vectors = _get_embeddings().embed_documents([it["text"] for it in valid])
        _get_collection(namespace).upsert(
            ids=[it["id"] for it in valid],
            embeddings=vectors,
            documents=[it["text"] for it in valid],
            metadatas=[it.get("metadata") or {} for it in valid],
        )
        log.info("memory[%s]: %d件を記憶", namespace, len(valid))
    except Exception:
        log.exception("memory[%s]: 記憶に失敗(無視して続行)", namespace)


def recall(query: str, namespace: str = "draft", k: int | None = None) -> list[dict[str, Any]]:
    """query に類似する過去事例を最大k件返す。各要素は {text, metadata, distance}。

    無効時・query無し・コレクション空・失敗時は空配列を返す(必ず安全に縮退する)。
    cosine距離が `memory_max_distance` を超える(=無関係な)事例は除外する。
    """
    if not settings.memory_enabled or not (query or "").strip():
        return []
    k = k or settings.memory_top_k
    try:
        col = _get_collection(namespace)
        if col.count() == 0:
            return []
        vector = _get_embeddings().embed_query(query)
        res = col.query(query_embeddings=[vector], n_results=k)
        docs = (res.get("documents") or [[]])[0]
        metas = (res.get("metadatas") or [[]])[0]
        dists = (res.get("distances") or [[]])[0]
        out: list[dict[str, Any]] = []
        for doc, meta, dist in zip(docs, metas, dists):
            if dist is not None and dist > settings.memory_max_distance:
                continue
            out.append({"text": doc, "metadata": meta or {}, "distance": dist})
        return out
    except Exception:
        log.exception("memory[%s]: 想起に失敗(空で続行)", namespace)
        return []


# =========================================================
#  directive層 (常時注入のルール・方針) — data/directives.json
#  形式: { "<id>": {"text","domain","kind","priority","active","origin","ts"} }
# =========================================================

def _dir_path() -> str:
    return os.path.join(settings.data_dir, "directives.json")


def _dir_load() -> dict:
    global _dir_cache
    if _dir_cache is None:
        try:
            with open(_dir_path(), encoding="utf-8") as f:
                _dir_cache = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            _dir_cache = {}
    return _dir_cache


def _dir_save(store: dict) -> None:
    os.makedirs(settings.data_dir, exist_ok=True)
    tmp = _dir_path() + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(store, f, ensure_ascii=False, indent=2)
    os.replace(tmp, _dir_path())  # アトミック置換


def add_directive(
    text: str,
    domain: str = "global",
    kind: str = "directive",
    priority: int = 100,
    origin: str = "manual",
    id: str | None = None,
) -> str:
    """方針を1件追加(または id 指定で上書き)し、その id を返す。"""
    text = (text or "").strip()
    if not text:
        raise ValueError("directive text is empty")
    did = id or uuid.uuid4().hex[:12]
    with _dir_lock:
        store = _dir_load()
        store[did] = {
            "text": text,
            "domain": domain,
            "kind": kind,
            "priority": priority,
            "active": True,
            "origin": origin,
            "ts": dt.datetime.now(dt.timezone.utc).isoformat(),
        }
        _dir_save(store)
    log.info("directive: 追加 id=%s domain=%s", did, domain)
    return did


def deactivate_directive(did: str) -> bool:
    """方針を無効化(supersede)する。履歴は残す。存在し無効化できたら True。"""
    with _dir_lock:
        store = _dir_load()
        item = store.get(did)
        if not item or not item.get("active", True):
            return False
        item["active"] = False
        _dir_save(store)
    log.info("directive: 無効化 id=%s", did)
    return True


def list_directives(domain: str | None = None, include_inactive: bool = False) -> list[dict[str, Any]]:
    """方針を一覧する。domain 指定でその領域のみ。優先度降順→新しい順。"""
    store = _dir_load()
    out = []
    for did, it in store.items():
        if not include_inactive and not it.get("active", True):
            continue
        if domain is not None and it.get("domain") != domain:
            continue
        out.append({"id": did, **it})
    out.sort(key=lambda x: (-x.get("priority", 0), x.get("ts", "")))
    return out


def _mark_directives_used(ids: list[str]) -> None:
    """注入した方針の使用回数・最終使用時刻を更新する(段階C: 昇格降格の素材)。"""
    if not ids:
        return
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    with _dir_lock:
        store = _dir_load()
        changed = False
        for did in ids:
            it = store.get(did)
            if it:
                it["use_count"] = it.get("use_count", 0) + 1
                it["last_used"] = now
                changed = True
        if changed:
            _dir_save(store)


def directives(domain: str) -> list[dict[str, Any]]:
    """global+domain の active を 優先度→最近使用→新しさ で並べ、予算内を返す。

    段階C: 返した分は使用済みとして記録(昇格降格の素材)。予算超過分は RAG有効時のみ
    example層へ降格し、context() の recall で関連時に拾えるようにする(無効時は単に不採用)。
    """
    items = [it for it in list_directives() if it.get("domain") in ("global", domain)]
    items.sort(key=lambda x: (x.get("priority", 0), x.get("last_used") or "", x.get("ts") or ""), reverse=True)
    budget = settings.memory_directive_budget
    top, overflow = items[:budget], items[budget:]
    _mark_directives_used([it["id"] for it in top])
    if overflow and settings.memory_enabled:
        try:  # 予算超過分は RAG へ降格(関連時に recall される)
            remember(
                [{"id": f"dir:{it['id']}", "text": it["text"],
                  "metadata": {"domain": it["domain"], "demoted": True}} for it in overflow],
                namespace=domain,
            )
        except Exception:
            log.exception("directive降格(RAG)に失敗")
    return top


def directives_block(domain: str) -> str:
    """directives(domain) をシステムプロンプト用の文字列ブロックに整形する。空なら ''。"""
    items = directives(domain)
    if not items:
        return ""
    lines = "\n".join(f"- ({it['domain']}) {it['text']}" for it in items)
    return "【ユーザーが記憶させた方針(必ず守ること)】\n" + lines


def context(domain: str, query: str = "") -> str:
    """directive(常時) + example(RAG) を1つのプロンプトブロックに統合する糖衣。

    全動作が `System(base_prompt + memory.context(domain, query))` の形で使える。
    """
    parts = []
    block = directives_block(domain)
    if block:
        parts.append(block)
    examples = recall(query, namespace=domain) if query else []
    if examples:
        ex = "\n".join(f"- {e['text']}" for e in examples)
        parts.append("【関連する過去の事例(参考)】\n" + ex)
    return "\n\n".join(parts)


# =========================================================
#  deny-list (deterministic routing・段階C §8) — data/denylist.json: ["pattern", ...]
#  「送信元Xからのメールは無視」のような構造化できる指示は、あいまいな directive でなく
#  確実な deny-list に落とす。crawl/draft がメールの From をこれと突合して除外する。
# =========================================================

_deny_cache: list[str] | None = None


def _deny_path() -> str:
    return os.path.join(settings.data_dir, "denylist.json")


def _deny_load() -> list[str]:
    global _deny_cache
    if _deny_cache is None:
        try:
            with open(_deny_path(), encoding="utf-8") as f:
                data = json.load(f)
            _deny_cache = [str(p).lower() for p in data if str(p).strip()]
        except (FileNotFoundError, json.JSONDecodeError):
            _deny_cache = []
    return _deny_cache


def _deny_save(patterns: list[str]) -> None:
    os.makedirs(settings.data_dir, exist_ok=True)
    tmp = _deny_path() + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(patterns, f, ensure_ascii=False, indent=2)
    os.replace(tmp, _deny_path())


def add_denied(pattern: str) -> bool:
    """送信元パターン(メールアドレス/ドメイン等の部分文字列)を deny-list に追加。"""
    p = (pattern or "").strip().lower()
    if not p:
        return False
    with _dir_lock:
        patterns = _deny_load()
        if p in patterns:
            return False
        patterns.append(p)
        _deny_save(patterns)
    log.info("denylist: 追加 '%s'", p)
    return True


def remove_denied(pattern: str) -> bool:
    p = (pattern or "").strip().lower()
    with _dir_lock:
        patterns = _deny_load()
        if p not in patterns:
            return False
        patterns.remove(p)
        _deny_save(patterns)
    return True


def list_denied() -> list[str]:
    return list(_deny_load())


def is_denied(from_header: str | None) -> bool:
    low = (from_header or "").lower()
    return any(p in low for p in _deny_load())


def filter_denied(emails: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """From が deny-list に該当するメールを除外する。"""
    patterns = _deny_load()
    if not patterns:
        return emails
    kept = [e for e in emails if not is_denied(e.get("from", ""))]
    if len(kept) != len(emails):
        log.info("denylist: %d件を除外", len(emails) - len(kept))
    return kept
