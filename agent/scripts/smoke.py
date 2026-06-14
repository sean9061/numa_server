"""オフライン・スモークテスト。

外部依存(Discord/Ollama)無しで以下を検証する:
  1. 全モジュールが import でき、langgraph 1.x の API が揃っている
  2. グラフの interrupt → resume(承認/却下) が期待通り動く
  3. AsyncSqliteSaver で再起動を跨いだ再開ができる

実行: docker run --rm -e DISCORD_BOT_TOKEN=x -e DISCORD_CHANNEL_ID=1 \
        -e DATA_DIR=/tmp -v $PWD/scripts:/app/scripts numa-agent python /app/scripts/smoke.py
"""
import asyncio
import os
import tempfile


async def main() -> None:
    # 1. import チェック (config はダミー env で通す)
    from agent import checkpoint, discordbot, graph, llm, runtime, scheduler  # noqa: F401
    from langgraph.checkpoint.memory import MemorySaver
    from langgraph.types import Command
    print("[1] imports OK")

    # 2. interrupt → resume(承認)
    g = graph.build_graph(MemorySaver())
    cfg = {"configurable": {"thread_id": "approve-case"}}
    r = await g.ainvoke({}, cfg)
    assert "__interrupt__" in r, f"interrupt が出ていない: {r}"
    payload = r["__interrupt__"][0].value
    assert "proposals" in payload and len(payload["proposals"]) == 2, payload
    print(f"[2] interrupt OK: {len(payload['proposals'])}件の提案")

    r2 = await g.ainvoke(Command(resume={"approved": True}), cfg)
    assert len(r2.get("applied", [])) == 2, r2
    print(f"[2] 承認 resume OK: applied={len(r2['applied'])}件")

    # 3. 却下ケース
    cfg2 = {"configurable": {"thread_id": "reject-case"}}
    await g.ainvoke({}, cfg2)
    r3 = await g.ainvoke(Command(resume={"approved": False}), cfg2)
    assert r3.get("applied") == [], r3
    print("[3] 却下 resume OK: applied=0件")

    # 4. AsyncSqliteSaver で再起動跨ぎの再開を模擬
    import aiosqlite
    from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

    db = os.path.join(tempfile.gettempdir(), "smoke_ckpt.sqlite")
    if os.path.exists(db):
        os.remove(db)
    cfg3 = {"configurable": {"thread_id": "restart-case"}}

    conn = await aiosqlite.connect(db)
    saver = AsyncSqliteSaver(conn)
    await saver.setup()
    g_a = graph.build_graph(saver)
    await g_a.ainvoke({}, cfg3)  # interrupt で停止
    await conn.close()           # ← 「再起動」相当

    conn2 = await aiosqlite.connect(db)
    saver2 = AsyncSqliteSaver(conn2)
    g_b = graph.build_graph(saver2)
    r4 = await g_b.ainvoke(Command(resume={"approved": True}), cfg3)
    assert len(r4.get("applied", [])) == 2, r4
    await conn2.close()
    print("[4] 再起動跨ぎ resume OK: applied=2件")

    print("\nALL SMOKE TESTS PASSED ✅")


if __name__ == "__main__":
    asyncio.run(main())
