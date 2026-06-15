"""オフライン・スモークテスト (Phase 1)。

外部依存(Discord/Ollama/Google/Notion)無しで以下を検証する:
  1. 全モジュールが import でき、langgraph 1.x / 構造化出力スキーマが揃っている
  2. 既定(承認不要)で crawl/reconcile→apply が直接 Notion書込(モック)する
  3. REQUIRE_APPROVAL=true で review の interrupt→承認/却下が動く
  4. AsyncSqliteSaver で再起動を跨いだ resume ができる

実行: docker run --rm -e DISCORD_BOT_TOKEN=x -e DISCORD_CHANNEL_ID=1 \
        -e DATA_DIR=/tmp -v $PWD/scripts:/app/scripts numa-agent python /app/scripts/smoke.py
"""
import asyncio
import os
import tempfile


async def main() -> None:
    # 1. import チェック
    from agent import checkpoint, discordbot, graph, llm, runtime, scheduler  # noqa: F401
    from agent.config import settings
    from agent.graph import Proposal, ProposalList, _norm, _resolve_source
    from agent.tools import notion
    from langgraph.checkpoint.memory import MemorySaver
    from langgraph.types import Command
    print("[1] imports OK")

    # スキーマと正規化ヘルパ
    pl = ProposalList(proposals=[Proposal(title="レポート提出", reason="メールより")])
    assert pl.proposals[0].due is None
    assert _norm(" レポート 提出 ") == _norm("レポート提出")
    # 由来解決ヘルパ
    idx = {"gmail:1": {"url": "https://mail/1", "label": "メール: 件名"}}
    rs = _resolve_source("gmail:1", idx)
    assert rs == {"source_url": "https://mail/1", "source_label": "メール: 件名"}, rs
    assert _resolve_source("calendar:x", idx) == {"source_url": None, "source_label": None}
    print("[1] スキーマ/正規化/由来解決 OK")

    # crawl/reconcile をスタブ化、notion.create_task をモック (新シグネチャを受ける)
    created: list[tuple] = []

    async def fake_crawl(state):
        return {"emails": [], "events": [], "existing_tasks": [{"title": "既存タスク"}]}

    async def fake_reconcile(state):
        return {"proposals": [
            {"title": "レポート提出", "due": "2026-06-20", "source": "gmail:1",
             "source_url": "https://mail/1", "source_label": "メール: レポート"},
            {"title": "ゼミ日程調整", "due": None, "source": "gmail:2"},
        ]}

    def fake_create_task(title, due=None, source=None, source_url=None, source_label=None):
        created.append((title, source_url))
        return "page-" + title

    graph.crawl_node = fake_crawl
    graph.reconcile_node = fake_reconcile
    notion.create_task = fake_create_task

    # 2. 既定(承認不要) → interrupt せず直接 apply
    settings.require_approval = False
    g = graph.build_graph(MemorySaver())
    r = await g.ainvoke({}, {"configurable": {"thread_id": "direct-case"}})
    assert "__interrupt__" not in r, f"承認不要なのに interrupt が出た: {r}"
    assert len(r.get("applied", [])) == 2, r
    assert [c[0] for c in created] == ["レポート提出", "ゼミ日程調整"], created
    assert created[0][1] == "https://mail/1", created  # 由来URLが create_task に渡る
    print(f"[2] 承認不要→直接Notion書込 OK: created={[c[0] for c in created]}")

    # 3. REQUIRE_APPROVAL=true → interrupt して承認待ち
    settings.require_approval = True
    created.clear()
    g = graph.build_graph(MemorySaver())
    cfg = {"configurable": {"thread_id": "approve-case"}}
    r = await g.ainvoke({}, cfg)
    assert "__interrupt__" in r, f"interrupt が出ていない: {r}"
    assert len(r["__interrupt__"][0].value["proposals"]) == 2
    r2 = await g.ainvoke(Command(resume={"approved": True}), cfg)
    assert len(r2.get("applied", [])) == 2 and len(created) == 2, (r2, created)
    print("[3] 承認必要→interrupt→承認→書込 OK")

    # 却下ケース (create_task が呼ばれないこと)
    created.clear()
    cfg2 = {"configurable": {"thread_id": "reject-case"}}
    await g.ainvoke({}, cfg2)
    r3 = await g.ainvoke(Command(resume={"approved": False}), cfg2)
    assert r3.get("applied", []) == [] and created == [], (r3, created)
    print("[3] 却下→書込なし OK")

    # 提案ゼロ → interrupt せず END
    async def empty_reconcile(state):
        return {"proposals": []}

    graph.reconcile_node = empty_reconcile
    g_e = graph.build_graph(MemorySaver())
    r_e = await g_e.ainvoke({}, {"configurable": {"thread_id": "empty"}})
    assert "__interrupt__" not in r_e and r_e.get("applied", []) == [], r_e
    print("[3] 提案ゼロ→END OK")
    graph.reconcile_node = fake_reconcile  # 戻す

    # 4. AsyncSqliteSaver で再起動跨ぎの resume
    import aiosqlite
    from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

    db = os.path.join(tempfile.gettempdir(), "smoke_ckpt.sqlite")
    if os.path.exists(db):
        os.remove(db)
    cfg3 = {"configurable": {"thread_id": "restart-case"}}
    created.clear()

    conn = await aiosqlite.connect(db)
    saver = AsyncSqliteSaver(conn)
    await saver.setup()
    await graph.build_graph(saver).ainvoke({}, cfg3)  # interrupt で停止
    await conn.close()                                # ← 「再起動」相当

    conn2 = await aiosqlite.connect(db)
    saver2 = AsyncSqliteSaver(conn2)
    r4 = await graph.build_graph(saver2).ainvoke(Command(resume={"approved": True}), cfg3)
    assert len(r4.get("applied", [])) == 2 and len(created) == 2, (r4, created)
    await conn2.close()
    print("[4] 再起動跨ぎ resume→書込 OK")

    print("\nALL SMOKE TESTS PASSED ✅")


if __name__ == "__main__":
    asyncio.run(main())
