"""処理済みの由来ID(source)を永続記憶し、再提案/再生成を防ぐ。

現状の重複判定は「Notionの現タイトル」のみのため、ユーザーがタスクを削除/完了で消したり、
承認フローで却下すると、同じメール/予定から再びタスクが提案されてしまう。
そこで処理済みの source(gmail:.. / calendar:.. 等) を記録し、reconcile で除外する。

scope で用途を分ける(タスク提案とメール下書きは独立に記憶):
  - "task"  -> {data_dir}/seen_sources.json   (既定・タスク提案)
  - "draft" -> {data_dir}/seen_drafts.json    (メール返信下書き)
形式: { "<source_id>": {"title": str, "status": str, "ts": ISO8601} }
"""
from __future__ import annotations

import datetime as dt
import json
import logging
import os
import re
import threading
from typing import Iterable

from .config import settings

log = logging.getLogger("agent.seen")

_lock = threading.Lock()
_caches: dict[str, dict] = {}

_FILENAMES = {"task": "seen_sources.json", "draft": "seen_drafts.json"}


def _path(scope: str) -> str:
    return os.path.join(settings.data_dir, _FILENAMES.get(scope, f"seen_{scope}.json"))


def _tokens(source: str | None) -> list[str]:
    """'gmail:1 gmail:2' / 'gmail:1,calendar:2' 等を個々のIDへ分割する。"""
    return [t for t in re.split(r"[,\s]+", source or "") if t]


def _load(scope: str) -> dict:
    if scope not in _caches:
        try:
            with open(_path(scope), encoding="utf-8") as f:
                _caches[scope] = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            _caches[scope] = {}
    return _caches[scope]


def _save(scope: str, store: dict) -> None:
    os.makedirs(settings.data_dir, exist_ok=True)
    tmp = _path(scope) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(store, f, ensure_ascii=False, indent=2)
    os.replace(tmp, _path(scope))  # アトミック置換


def is_seen(source: str | None, scope: str = "task") -> bool:
    """source(複数IDの場合あり)のいずれかが処理済みなら True。"""
    store = _load(scope)
    return any(tok in store for tok in _tokens(source))


def mark(proposals: Iterable[dict], status: str, scope: str = "task") -> None:
    """提案/下書き群の source を status として記録する。source無しは無視。"""
    items = list(proposals)
    if not items:
        return
    ts = dt.datetime.now(dt.timezone.utc).isoformat()
    with _lock:
        store = _load(scope)
        n = 0
        for p in items:
            for tok in _tokens(p.get("source")):
                store[tok] = {"title": p.get("title") or p.get("subject", ""), "status": status, "ts": ts}
                n += 1
        if n:
            _save(scope, store)
            log.info("seen[%s]: %d件の由来を記録 (status=%s)", scope, n, status)
