"""エントリポイント。Discord ボットと APScheduler を 1 プロセス(共有イベントループ)で起動する。"""
from __future__ import annotations

import asyncio
import logging

from .checkpoint import make_checkpointer
from .config import settings
from .discordbot import AgentBot
from .draft_graph import build_draft_graph
from .graph import build_graph
from .runtime import AgentRuntime
from .scheduler import make_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s | %(message)s",
)
log = logging.getLogger("agent.main")


async def main() -> None:
    log.info("エージェント起動 (model=%s, ollama=%s)", settings.agent_model, settings.ollama_base_url)

    bot = AgentBot()
    checkpointer = await make_checkpointer()
    graph = build_graph(checkpointer)
    draft_graph = build_draft_graph(checkpointer) if settings.draft_enabled else None
    runtime = AgentRuntime(graph, bot, draft_graph)
    bot.runtime = runtime

    scheduler = make_scheduler(runtime)
    scheduler.start()  # async main 内なので稼働中ループに乗る

    async with bot:
        await bot.start(settings.discord_bot_token)


if __name__ == "__main__":
    asyncio.run(main())
