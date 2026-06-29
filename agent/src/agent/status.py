"""実行中のライブ状態を data/agent_status.json に書き出す (#72 段階2)。

dashboard はこのファイルを read-only マウントで読み、グラフ上で「今どのノードを
実行中か」をリアルタイムにハイライトする。agent と dashboard はネットワーク分離
されているため、共有ファイル経由で渡す(段階1の runs.jsonl と同じ方式)。
"""
from __future__ import annotations

import datetime as dt
import json
import logging
import os

from .config import settings

log = logging.getLogger("agent.status")


def _path() -> str:
    return os.path.join(settings.data_dir, "agent_status.json")


def _now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def write(running: bool, graph: str | None = None, node: str | None = None,
          started: str | None = None) -> None:
    """現在の実行状態を書き出す。失敗してもクロール本体は止めない。"""
    rec = {
        "running": running,
        "graph": graph,        # "orchestrator" | "task" | "draft" | None
        "node": node,          # 実行中ノード名 | None
        "started": started,
        "updated": _now(),
    }
    try:
        tmp = _path() + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(rec, f, ensure_ascii=False)
        os.replace(tmp, _path())
    except Exception:
        log.debug("status の書き出しに失敗 (無視)", exc_info=True)


def clear(graph: str | None = None) -> None:
    """実行終了。idle 状態にする。"""
    write(running=False, graph=graph, node=None)
