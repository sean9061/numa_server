"""オフライン・スモークテスト (Phase 1)。

外部依存(Discord/Ollama/Google/Notion)無しで以下を検証する:
  1. 全モジュールが import でき、langgraph 1.x / 構造化出力スキーマが揃っている
  2. 既定(承認不要)で crawl/reconcile→apply が直接 Notion書込(モック)する
  3. REQUIRE_APPROVAL=true で review の interrupt→承認/却下が動く
  4. AsyncSqliteSaver で再起動を跨いだ resume ができる
  5-6. seen(由来ID記憶)の永続化・scope分離・reconcile除外
  7-8. メール返信案フロー (読み取り専用の生成 / 提示済みsource除外)
  9.   空き時間計算 (カレンダーから決定論的に空き枠を算出)
  10.  RAG/Memory example層 (無効時の縮退 / 返信案フローへの配線: recall→payload, 生成後 remember)
  11.  Memory directive層 (追加/領域分離/優先度/予算/永続/無効化 / reconcileへの常時注入)

実行: docker run --rm -e DISCORD_BOT_TOKEN=x -e DISCORD_CHANNEL_ID=1 \
        -e DATA_DIR=/tmp -v $PWD/scripts:/app/scripts numa-agent python /app/scripts/smoke.py
"""
import asyncio
import os
import tempfile


async def main() -> None:
    # 1. import チェック
    from agent import checkpoint, discordbot, draft_graph, graph, llm, runtime, scheduler, seen  # noqa: F401
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

    real_reconcile_node = graph.reconcile_node  # test 6 用に実関数を退避
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

    # 5. seen: 由来IDの記憶と永続化 (再提案防止)・scope分離
    from agent import seen as seen_mod
    settings.data_dir = tempfile.mkdtemp()
    seen_mod._caches.clear()
    assert not seen_mod.is_seen("gmail:zzz")
    seen_mod.mark([{"source": "gmail:zzz", "title": "X"}, {"source": "calendar:e1", "title": "Y"}], "applied")
    assert seen_mod.is_seen("gmail:zzz") and seen_mod.is_seen("calendar:e1")
    assert not seen_mod.is_seen("gmail:other")
    assert not seen_mod.is_seen(None)
    # scope="draft" は task と独立 (taskで記憶してもdraftには出ない)
    assert not seen_mod.is_seen("gmail:zzz", scope="draft")
    seen_mod._caches.clear()  # ディスクから再読込 (再起動相当)
    assert seen_mod.is_seen("gmail:zzz"), "seen が永続化されていない"
    print("[5] seen 記憶/永続化/scope分離 OK")

    # 6. reconcile が記憶済み source を除外する (実nodeを使用、LLMはスタブ)
    from agent.graph import Proposal as P
    settings.data_dir = tempfile.mkdtemp()
    seen_mod._caches.clear()
    seen_mod.mark([{"source": "gmail:seen1", "title": "既出"}], "rejected")

    async def fake_gen(payload, extra_system=""):
        return [
            P(title="新規タスクA", reason="r", source="gmail:new1"),
            P(title="既出タスク", reason="r", source="gmail:seen1"),  # 記憶済み→除外される
        ]

    graph._generate_proposals = fake_gen
    out = await real_reconcile_node({"emails": [], "events": [], "existing_tasks": []})
    titles = [p["title"] for p in out["proposals"]]
    assert titles == ["新規タスクA"], titles
    print("[6] reconcile: 記憶済みsource除外 OK")

    # 7. メール返信案フロー (Phase 2a, 読み取り専用): gather→compose
    from agent import draft_graph
    from agent.tools import gcal as gcal_tool, gmail as gmail_tool
    settings.data_dir = tempfile.mkdtemp()
    seen_mod._caches.clear()
    settings.draft_enabled = True
    captured_payload: dict = {}

    def fake_candidates():
        return [
            {"source": "gmail:r1", "from": "taro@example.com", "subject": "日程のご相談",
             "body": "来週どこか30分お時間いただけますか?", "link": "https://mail/r1"},
            {"source": "gmail:n1", "from": "news@promo.example", "subject": "セール中", "body": "広告です"},
        ]

    def fake_events():
        return [{"source": "calendar:c1", "summary": "会議", "start": "2026-06-16T10:00:00+09:00",
                 "end": "2026-06-16T11:00:00+09:00"}]

    async def fake_gen_suggest(payload, extra_system=""):
        captured_payload.update(payload)  # カレンダーが渡っているか検証用
        return [{"source": "gmail:r1", "body": "6/17(水)14:00はいかがでしょうか。", "reason": "日程調整の返信が必要"}]

    gmail_tool.fetch_reply_candidates = fake_candidates
    gcal_tool.fetch_upcoming = fake_events
    draft_graph._generate_suggestions = fake_gen_suggest

    dg = draft_graph.build_draft_graph(MemorySaver())
    rd = await dg.ainvoke({}, {"configurable": {"thread_id": "draftcase"}})
    sugg = rd.get("suggestions", [])
    assert len(sugg) == 1 and sugg[0]["to"] == "taro@example.com", sugg
    assert sugg[0]["subject"] == "日程のご相談" and sugg[0]["body"], sugg
    assert "__interrupt__" not in rd, "返信案は承認不要(interruptしない)"
    assert "free_slots" in captured_payload and "now" in captured_payload, captured_payload  # 空き枠が渡る
    print("[7] 返信案: 生成(読み取り専用・空き枠文脈付き) OK")

    # 8. 提示済み(記憶済み)メールは gather で除外される
    seen_mod.mark([{"source": "gmail:r1"}], "suggested", "draft")
    rd2 = await dg.ainvoke({}, {"configurable": {"thread_id": "draftcase2"}})
    assert rd2.get("suggestions", []) == [], rd2  # r1 は記憶済み→候補から除外
    print("[8] 返信案: 提示済みsource除外 OK")

    # 8b. gather が候補数を draft_max_candidates で絞る (本文丸ごと渡す→num_ctx超過防止)
    settings.data_dir = tempfile.mkdtemp()
    seen_mod._caches.clear()
    gmail_tool.fetch_reply_candidates = lambda: [
        {"source": f"gmail:c{i}", "from": "a@b", "subject": "s", "body": "x"} for i in range(5)
    ]
    gcal_tool.fetch_upcoming = lambda: []
    settings.draft_max_candidates = 2
    out_g = await draft_graph.gather_node({})
    assert len(out_g["candidates"]) == 2, out_g  # 5件→上限2件に制限
    settings.draft_max_candidates = 4
    print("[8b] 返信案: 候補数の上限制限 OK")

    # 9. 空き時間計算 (決定論): 予定を差し引いた実在の空き枠だけを返す
    import datetime as _dt
    from agent import availability
    JST = _dt.timezone(_dt.timedelta(hours=9))
    settings.avail_weekdays_only = False  # 曜日に依存せず検証
    now = _dt.datetime(2026, 6, 15, 9, 0, tzinfo=JST)
    wd = availability._WD[now.weekday()]
    slots = availability.free_slots([{"start": "2026-06-15T10:00:00+09:00", "end": "2026-06-15T12:00:00+09:00"}], now=now)
    labels = [s["label"] for s in slots]
    assert any(f"6月15日({wd}) 09:00〜10:00" == l for l in labels), labels  # 予定前の空き
    assert any("12:00〜21:00" in l for l in labels), labels                # 予定後の空き
    # 終日予定は busy 扱いしない(長期の終日予定で窓が潰れるのを防ぐ)→ その日も空きが出る
    slots2 = availability.free_slots([{"start": "2026-06-16", "end": "2026-06-17"}], now=now)
    assert any("6月16日" in s["label"] for s in slots2), slots2
    # transparency=transparent の時刻付き予定も busy 扱いしない
    slots3 = availability.free_slots(
        [{"start": "2026-06-15T10:00:00+09:00", "end": "2026-06-15T12:00:00+09:00", "transparency": "transparent"}],
        now=now,
    )
    assert any(f"6月15日({wd}) 09:00〜21:00" == s["label"] for s in slots3), slots3  # 透明予定は無視され丸ごと空き
    print("[9] 空き時間計算(決定論・終日/透明は除外) OK")

    # 10. RAG/Memory (Phase 2b)
    from agent import memory as memory_mod
    # 無効時は安全に縮退 (chromadb/Ollama 不要で動くこと)
    settings.memory_enabled = False
    assert memory_mod.recall("なんでも") == []
    memory_mod.remember([{"id": "x", "text": "y", "metadata": {}}])  # no-op (例外なし)
    print("[10] memory: 無効時は recall=[]/remember=no-op OK")

    # 返信案フローへのRAG配線: past_examples がプロンプトに乗り、生成後に remember される
    settings.data_dir = tempfile.mkdtemp()
    seen_mod._caches.clear()
    recalled_for: list[str] = []
    remembered: list[dict] = []

    def fake_recall(query, namespace="draft", k=None):
        recalled_for.append(query)
        return [{"text": "件名: 過去の相談\n返信案:\n平素よりお世話になっております。", "metadata": {}, "distance": 0.1}]

    def fake_remember(items, namespace="draft"):
        remembered.extend(items)

    captured2: dict = {}

    def fake_candidates2():
        return [{"source": "gmail:m1", "from": "hanako@example.com", "subject": "打合せ",
                 "body": "来週ご都合いかがですか", "link": "https://mail/m1"}]

    async def fake_gen2(payload, extra_system=""):
        captured2.update(payload)
        return [{"source": "gmail:m1", "body": "来週水曜はいかがでしょうか。", "reason": "日程調整"}]

    memory_mod.recall = fake_recall
    memory_mod.remember = fake_remember
    gmail_tool.fetch_reply_candidates = fake_candidates2
    gcal_tool.fetch_upcoming = lambda: []
    draft_graph._generate_suggestions = fake_gen2

    dg2 = draft_graph.build_draft_graph(MemorySaver())
    rd3 = await dg2.ainvoke({}, {"configurable": {"thread_id": "ragcase"}})
    assert rd3.get("suggestions") and rd3["suggestions"][0]["source"] == "gmail:m1", rd3
    assert captured2["emails"][0].get("past_examples"), captured2["emails"][0]  # 過去事例が文脈に乗る
    assert recalled_for, "recall が呼ばれていない"
    assert remembered and remembered[0]["id"] == "gmail:m1", remembered  # 生成案を由来IDで記憶
    print("[10] memory: 返信案フローへのRAG配線(recall→payload / 生成後remember) OK")

    # 11. directive層 (常時注入のルール) + reconcileへの配線
    settings.data_dir = tempfile.mkdtemp()
    memory_mod._dir_cache = None
    settings.memory_directive_budget = 15
    assert memory_mod.directives_block("task") == ""  # 空なら無効果(後方互換)
    d_task = memory_mod.add_directive("メルマガ由来は出さない", domain="task", priority=50)
    memory_mod.add_directive("本名は伏せる", domain="global", priority=90)
    memory_mod.add_directive("敬語は固め", domain="draft", priority=10)
    block = memory_mod.directives_block("task")
    assert "メルマガ由来は出さない" in block and "本名は伏せる" in block, block
    assert "敬語は固め" not in block, block                            # 他領域(draft)は混ざらない
    assert block.index("本名は伏せる") < block.index("メルマガ由来は出さない"), block  # 優先度降順
    assert block.count("- (") == 2, block                             # global+task の2件
    memory_mod._dir_cache = None                                      # 永続化(ディスクから再読込)
    assert "メルマガ由来は出さない" in memory_mod.directives_block("task")
    settings.memory_directive_budget = 1                              # 予算で件数制限
    assert memory_mod.directives_block("task").count("- (") == 1
    settings.memory_directive_budget = 15
    assert memory_mod.deactivate_directive(d_task) is True            # 無効化(supersede)
    assert "メルマガ由来は出さない" not in memory_mod.directives_block("task")
    assert memory_mod.deactivate_directive(d_task) is False           # 二重無効化はFalse
    print("[11] directive: 追加/領域分離/優先度/予算/永続/無効化 OK")

    # reconcile が task方針を _generate_proposals に常時注入する
    memory_mod.add_directive("通知メールは無視", domain="task", priority=100, id="t-test")
    captured_sys: dict = {}

    async def fake_gen3(payload, extra_system=""):
        captured_sys["extra"] = extra_system
        return []

    graph._generate_proposals = fake_gen3
    await real_reconcile_node({"emails": [], "events": [], "existing_tasks": []})
    assert "通知メールは無視" in captured_sys.get("extra", ""), captured_sys
    print("[11] directive: reconcileが方針を常時注入 OK")

    # 12. run_cycle: クロール→返信案を逐次実行 (モデルへの並行リクエスト回避)
    from agent.runtime import AgentRuntime
    order: list[str] = []

    class _FakeGraph:
        async def ainvoke(self, *a, **k):
            order.append("crawl")
            return {"applied": []}

    class _FakeDraftGraph:
        async def ainvoke(self, *a, **k):
            order.append("draft")
            return {"suggestions": []}

    class _FakeNotifier:
        async def send_proposal(self, *a, **k): ...
        async def send_applied(self, *a, **k): ...
        async def send_suggestions(self, *a, **k): ...
        async def send_text(self, *a, **k): ...

    rt = AgentRuntime(_FakeGraph(), _FakeNotifier(), _FakeDraftGraph())
    await rt.run_cycle()
    assert order == ["crawl", "draft"], order  # 並行でなく crawl→draft の順
    # draft_graph 未設定なら crawl のみ (draftはスキップ)
    order.clear()
    await AgentRuntime(_FakeGraph(), _FakeNotifier(), None).run_cycle()
    assert order == ["crawl"], order
    print("[12] run_cycle: クロール→返信案を逐次実行 OK")

    # 13. アシスタント(段階B): 既定は通常チャット、指示時のみメモリ操作 (LLMはスタブ)
    from agent import librarian
    settings.data_dir = tempfile.mkdtemp()
    memory_mod._dir_cache = None
    canned = {"text": ""}
    captured = {"msgs": None}

    async def fake_invoke(messages):
        captured["msgs"] = messages
        return canned["text"]

    librarian._invoke = fake_invoke

    # 通常の会話 → action=none で reply をそのまま返す(メモリ操作しない)
    canned["text"] = '{"action":"none","reply":"こんにちは!何かお手伝いできますか?"}'
    r0 = await librarian.respond("やあ")
    assert r0["action"] == "none" and "こんにちは" in r0["reply"], r0
    # JSONでない生テキスト → そのままチャット応答として扱う(普通に会話)
    canned["text"] = "了解です。今日は晴れですね。"
    rt = await librarian.respond("天気は?")
    assert rt["action"] == "none" and rt["reply"] == "了解です。今日は晴れですね。", rt
    # remember: domain正規化(不正→global)・空text除外・reply同梱
    canned["text"] = (
        '{"reply":"了解、覚えますね","action":"remember","directives":['
        '{"text":"採用系メールからタスクを作らない","domain":"task"},'
        '{"text":"私は就活中の情報系学生","domain":"へんなdomain"},'
        '{"text":"   "}]}'
    )
    r = await librarian.respond("採用メールからタスク作らないで。あと私は就活中の情報系学生")
    assert r["action"] == "remember" and len(r["directives"]) == 2, r
    assert r["directives"][1]["domain"] == "global" and r["reply"], r  # 不正domain→global
    # forget: 実在idのみ対象化
    did = memory_mod.add_directive("採用系は不要", domain="task")
    canned["text"] = f'{{"reply":"消しますね","action":"forget","targets":["{did}","存在しないid"]}}'
    r2 = await librarian.respond("採用のやつ忘れて")
    assert r2["action"] == "forget" and r2["targets"] == [did], r2
    # list
    canned["text"] = '{"action":"list","reply":"今の方針はこちら"}'
    assert (await librarian.respond("何覚えてる?"))["action"] == "list"
    # remember だが実体なし → none(普通の会話)に落とす
    canned["text"] = '{"action":"remember","directives":[],"reply":"はい"}'
    assert (await librarian.respond("覚えて"))["action"] == "none"
    print("[13] アシスタント: 既定チャット/指示時のみメモリ操作 OK")

    # 13b. 短期会話メモリ: 履歴がプロンプトに含まれる(多ターン)
    canned["text"] = '{"action":"none","reply":"3つ目はCです"}'
    await librarian.respond("3つ目は?", history=[("user", "候補を3つ"), ("assistant", "A,B,C")])
    msgs = captured["msgs"]
    assert len(msgs) == 4, msgs  # system + 履歴2 + 今回
    assert msgs[1].content == "候補を3つ" and msgs[2].content == "A,B,C", msgs
    assert msgs[-1].content == "3つ目は?", msgs
    print("[13b] 短期会話メモリ: 履歴がプロンプトに含まれる OK")

    print("\nALL SMOKE TESTS PASSED ✅")


if __name__ == "__main__":
    asyncio.run(main())
