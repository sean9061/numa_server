"""定期クロールのスケジューラ。AsyncIOScheduler で run_crawl を一定間隔で起動する。"""
from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from .config import settings
from .runtime import AgentRuntime

log = logging.getLogger("agent.scheduler")


def make_scheduler(runtime: AgentRuntime) -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        runtime.run_crawl,
        trigger="interval",
        minutes=settings.crawl_interval_min,
        id="crawl",
        max_instances=1,
        coalesce=True,
    )
    log.info("スケジューラ設定: %d分間隔でクロール", settings.crawl_interval_min)
    return scheduler
