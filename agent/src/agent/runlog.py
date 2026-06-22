"""エージェントの実行履歴(いつ・何を見て・何をしたか)を永続記録する (#64)。

自動起動(定期/起動時クロール)は Discord に毎回サマリを出すが、流れて消えてしまう。
そこで構造化レコードを {data_dir}/runs.jsonl に「1実行=1行」で追記する(無制限・時系列)。
『最近何やった?』等の照会(司書 action="runs")はここから読む。

1行=1 JSON:
  {
    "ts":      開始時刻(ISO8601/UTC),
    "ended":   終了時刻(ISO8601/UTC),
    "trigger": "startup" | "schedule" | "manual",
    "kind":    "crawl" | "draft" | "apply",
    "mode":    "orchestrator" | "simple" | "",
    "saw":     {見たもの: 件数や件名リスト},
    "did":     {やったこと: 提案/追加/返信案の件数やタイトル},
    "outcome": "applied" | "proposed" | "awaiting_approval" | "suggested" | "none" | "error",
    "error":   失敗時のメッセージ(任意)
  }
"""
from __future__ import annotations

import datetime as dt
import json
import logging
import os
import threading
from typing import Any

from .config import settings

log = logging.getLogger("agent.runlog")

_lock = threading.Lock()

_FILENAME = "runs.jsonl"


def _path() -> str:
    return os.path.join(settings.data_dir, _FILENAME)


def build(
    started: dt.datetime,
    trigger: str,
    kind: str,
    mode: str,
    saw: dict[str, Any],
    did: dict[str, Any],
    outcome: str,
    error: str | None = None,
) -> dict[str, Any]:
    """実行レコードを組み立てる(終了時刻は呼び出し時点を採用)。"""
    rec: dict[str, Any] = {
        "ts": started.isoformat(),
        "ended": dt.datetime.now(dt.timezone.utc).isoformat(),
        "trigger": trigger,
        "kind": kind,
        "mode": mode,
        "saw": saw,
        "did": did,
        "outcome": outcome,
    }
    if error:
        rec["error"] = error
    return rec


def record(run: dict[str, Any]) -> None:
    """実行レコードを runs.jsonl に1行追記する(アトミックな追記・スレッドセーフ)。"""
    os.makedirs(settings.data_dir, exist_ok=True)
    line = json.dumps(run, ensure_ascii=False) + "\n"
    with _lock:
        with open(_path(), "a", encoding="utf-8") as f:
            f.write(line)
    log.info(
        "runlog: 記録 trigger=%s kind=%s outcome=%s", run.get("trigger"), run.get("kind"), run.get("outcome")
    )


def recent(limit: int = 15) -> list[dict[str, Any]]:
    """直近 limit 件の実行レコードを古い順で返す(壊れた行はスキップ)。"""
    try:
        with open(_path(), encoding="utf-8") as f:
            lines = f.readlines()
    except FileNotFoundError:
        return []
    out: list[dict[str, Any]] = []
    for line in lines[-limit:]:
        line = line.strip()
        if not line:
            continue
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return out
