"""提案を処理済みの由来ID(source)を永続記憶し、再提案を防ぐ。

現状の重複判定は「Notionの現タイトル」のみのため、ユーザーがタスクを削除/完了で消したり、
承認フローで却下すると、同じメール/予定から再びタスクが提案されてしまう。
そこで処理済みの source(gmail:.. / calendar:.. 等) を記録し、reconcile で除外する。

保存先: {data_dir}/seen_sources.json
形式  : { "<source_id>": {"title": str, "status": "applied"|"rejected", "ts": ISO8601} }
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
_cache: dict | None = None


def _path() -> str:
    return os.path.join(settings.data_dir, "seen_sources.json")


def _tokens(source: str | None) -> list[str]:
    """'gmail:1 gmail:2' / 'gmail:1,calendar:2' 等を個々のIDへ分割する。"""
    return [t for t in re.split(r"[,\s]+", source or "") if t]


def _load() -> dict:
    global _cache
    if _cache is None:
        try:
            with open(_path(), encoding="utf-8") as f:
                _cache = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            _cache = {}
    return _cache


def _save(store: dict) -> None:
    os.makedirs(settings.data_dir, exist_ok=True)
    tmp = _path() + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(store, f, ensure_ascii=False, indent=2)
    os.replace(tmp, _path())  # アトミック置換


def is_seen(source: str | None) -> bool:
    """source(複数IDの場合あり)のいずれかが処理済みなら True。"""
    store = _load()
    return any(tok in store for tok in _tokens(source))


def mark(proposals: Iterable[dict], status: str) -> None:
    """提案群の source を status(applied/rejected)として記録する。source無しは無視。"""
    items = list(proposals)
    if not items:
        return
    ts = dt.datetime.now(dt.timezone.utc).isoformat()
    with _lock:
        store = _load()
        n = 0
        for p in items:
            for tok in _tokens(p.get("source")):
                store[tok] = {"title": p.get("title", ""), "status": status, "ts": ts}
                n += 1
        if n:
            _save(store)
            log.info("seen: %d件の由来を記録 (status=%s)", n, status)
