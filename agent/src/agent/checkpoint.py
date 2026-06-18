"""LangGraph チェックポインタ。SQLite に thread_id 単位で状態を永続化し、
HITL の interrupt 中にプロセスが再起動しても承認後に再開できるようにする。"""
from __future__ import annotations

import os

import aiosqlite
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

from .config import settings


async def make_checkpointer() -> AsyncSqliteSaver:
    os.makedirs(settings.data_dir, exist_ok=True)
    path = os.path.join(settings.data_dir, "checkpoints.sqlite")
    conn = await aiosqlite.connect(path)
    saver = AsyncSqliteSaver(conn)
    await saver.setup()
    return saver
