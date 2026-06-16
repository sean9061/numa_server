"""定期クロールのスケジューラ。AsyncIOScheduler で run_crawl を一定間隔で起動する。"""
from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from .config import settings
from .runtime import AgentRuntime

log = logging.getLogger("agent.scheduler")


def make_scheduler(runtime: AgentRuntime) -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler()
    # クロールと返信案は1ジョブで逐次実行する(モデルへの並行リクエストを避ける)。
    scheduler.add_job(
        runtime.run_cycle,
        trigger="interval",
        minutes=settings.crawl_interval_min,
        id="cycle",
        max_instances=1,
        coalesce=True,
    )
    what = "クロール＋返信案" if settings.draft_enabled else "クロール"
    log.info("スケジューラ設定: %d分間隔で%s(逐次)", settings.crawl_interval_min, what)
    return scheduler
