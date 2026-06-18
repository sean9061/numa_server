"""定期クロールのスケジューラ。AsyncIOScheduler で run_crawl を一定間隔で起動する。"""
from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from .config import settings
from .runtime import AgentRuntime

log = logging.getLogger("agent.scheduler")


def make_scheduler(runtime: AgentRuntime) -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler()
    # CRAWL_HOURS 指定時は時刻指定(cron)、空なら従来の固定インターバル。
    hours = settings.crawl_hours.strip()
    if hours:
        trigger = CronTrigger(hour=hours, minute=settings.crawl_minute)
        when = f"毎日 {hours}時 の{settings.crawl_minute}分"
    else:
        trigger = IntervalTrigger(minutes=settings.crawl_interval_min)
        when = f"{settings.crawl_interval_min}分間隔"
    # クロールと返信案は1ジョブで逐次実行する(モデルへの並行リクエストを避ける)。
    scheduler.add_job(
        runtime.run_cycle,
        trigger=trigger,
        id="cycle",
        max_instances=1,
        coalesce=True,
    )
    what = "クロール＋返信案" if settings.draft_enabled else "クロール"
    log.info("スケジューラ設定: %sで%s(逐次)", when, what)
    return scheduler
