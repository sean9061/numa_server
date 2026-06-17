# LLM Agent ロードマップ

Ollama + LangGraph によるローカルLLM自律エージェント (`agent/`) の方針・進捗・今後の計画。
進捗トラッキング: [#59](https://github.com/sean9061/numa_server/issues/59)（このファイルが真実の源、issueはチェックリスト）。

## 概要（なぜ）
自宅サーバー上にローカルLLMを頭脳とする自律エージェントを構築する。最終目標は4領域：
(1) タスク管理クロール (2) メール返信下書き (3) 課題の自動実行 (4) 家電制御。
難易度・リスクが大きく異なるため、共通基盤を作った上で段階的に実装する。

## 確定した設計判断
| 項目 | 決定 |
|---|---|
| 実行環境 | Python + LangGraph |
| 通知・承認 | Discord ボット（ボタンで承認/却下 = human-in-the-loop） |
| メール・カレンダー | Google（Gmail 読取 + `drafts.create` / Calendar 読取・OAuthはreadonlyのみ） |
| タスク保存先 | Notion（新データソースAPI対応） |
| 学生ポータル | Moodle（Phase 1.5） |
| 推論モデル | `qwen3.6:35b-a3b-q4_K_M`（tool-calling向き、`num_ctx=16384`） |
| 管理UI | Discord のみ（Web UIは将来の任意フェーズ） |

## アーキテクチャ要点
- `agent` コンテナは `ollama_net` 接続（Ollama到達 + 外部API egress）。ホストポート非公開。
- グラフ: `START → crawl → reconcile →(提案あり) review(interrupt) → END`。承認はDiscordボタン→`Command(resume=...)`。
- 状態は `AsyncSqliteSaver`(`data/checkpoints.sqlite`) に thread_id 単位で永続化（再起動耐性）。
- 主要ファイル: `src/agent/{graph,draft_graph,runtime,discordbot,scheduler,llm,checkpoint,config,seen,availability,memory}.py`, `src/agent/tools/{gmail,gcal,notion}.py`。

## フェーズ進捗
- [x] **Phase 0 — 共通基盤**: Discord HITL往復 / SQLite checkpoint / Ollama接続・tool-calling実証。
- [x] **Phase 1 — タスク管理クロールMVP**: Gmail(重要/未読)+Calendar→LLM突合→Notion反映。タスク追加は低リスクのため**既定で承認不要（直接挿入し結果をDiscord通知）**、`REQUIRE_APPROVAL=true`で従来の承認フローに戻せる。締切(due)はメール本文の日付 or カレンダー予定開始日で補完。提案/通知・Notionの双方に**由来（メール/予定）のリンクと出典ラベル**を表示。Notion挿入時は**デフォルトでステータス(`NOTION_DEFAULT_STATUS`)と挿入者タグ(`NOTION_AGENT_TAG`)**を付与。**実データ動作確認済み**。
- [ ] **Phase 1.5 — Moodle連携**: 課題・締切をクロール対象に追加（Web Services REST、無効ならPlaywrightスクレイピング）。
- [x] **Phase 2 — メール返信案 + RAG**:
  - [x] **2a メール返信案**: 返信が必要なメールをLLMが判別→日本語の返信案を生成→**Discordに案を提示**（Gmailへの書込は一切なし＝完全読み取り専用）。ユーザーは案をGmailへ手動で貼り付けて送る。`draft_graph.py`（gather→compose）+ `DRAFT_ENABLED` で有効化。提示済みの由来IDは scope="draft" で記憶し再提示を防止。**追加スコープ・再認可は不要**。
    - 日程調整: `availability.py` でカレンダー予定を差し引いた**空き時間帯を決定論的に算出**してLLMに渡し（実在しない日時を提案させない＝確実）、相手が希望する候補数をLLMが読み取りその数だけ提案（柔軟）。営業時間/平日のみ等は `AVAIL_*` で調整。
    - ※ Gmail下書き作成スコープ(`gmail.compose`)は「送信」権限も不可分に含む（Google仕様で分離不可）ため不採用。「送信は構造的に不可」を厳守するため、書込せず案の提示のみとした（ユーザー判断）。
  - [x] **2b RAG/Memory**: `nomic-embed-text`(Ollama) + Chroma `data/chroma` で**過去の返信判断を文脈化**し返信案の文体・一貫性を向上。`memory.py`（`recall`/`remember`、cosine距離・`MEMORY_MAX_DISTANCE`で無関係事例を除外）。`compose` で各候補メールに類似の過去返信例を付与→生成後に由来IDで upsert 記憶。**`MEMORY_ENABLED=false`（既定）なら `recall=[]`/`remember`=no-op で 2a と完全同一挙動**（依存・モデルが重いため任意）。chromadb/埋め込みは遅延importで包み、失敗時も返信案フローは止めない。**オフラインsmoke検証済み（[10]）。実データ（Ollama埋め込み＋Chroma永続化）の品質確認は要 `nomic-embed-text` pull後**。
- [ ] **Phase 3 — 家電制御**: SwitchBot API（ライト/エアコン）、カレンダー連動の通知/アラーム。Alexaは公式ローカルAPIが無く要調査。
- [ ] **Phase 4 — 課題の自動実行**（最高リスク・最後）: 素材収集→実行可能性判定→実行 or ユーザー呼出。**使い捨てサンドボックスコンテナ限定**（本番サーバー上で直接実行しない）。

## 基盤フェーズ（エージェント・メモリ & 自然言語コントロールプレーン）
全動作が共通参照し**対話で育てる**単一の振る舞いメモリ層。二層構成（指示=directive常時注入 / 事例=example RAG）＋ドメインタグ（global/task/draft/home…）。**タスク提案のゴミ（低重要度・見当違い）削減の本命**。バックログ「自然言語対話IF」「汎用Memory」を統合。設計の真実の源: [`docs/agent-memory.md`](docs/agent-memory.md)。
- [x] **段階A — 土台**（実装済み・未コミット）: `memory.py` に directive層（`directives_block`/`add_directive`/`deactivate_directive`/`list_directives`）と `context()` を追加。`reconcile`/`compose` が `directives_block(domain)` を**常時注入**（空なら無効果＝後方互換）。初期方針は `scripts/seed_directives.py` で投入（冪等）。example層(現memory.py)は同モジュールに統合。smoke `[11]` 検証済み。**残: 実データでゴミタスク削減効果を検証**（seed投入→本番クロールで before/after）。
- [x] **段階B — Discord対話（自然言語アシスタント）**（実装・本番反映済み）: `librarian.respond()`は**基本は通常のチャットAI**として応答し、ユーザーが明示的に指示したときだけ方針を覚える/忘れる/一覧（`_ConfirmView`で確認HITL）。**短期会話セッション**（5分アイドルでリセット・プロセス内）で多ターン文脈を保持。司書はエージェント本体と同一プロセスのため directive 更新は再起動なしに次回クロールへ反映。`LIBRARIAN_ENABLED`/`SESSION_IDLE_MIN`。**要 Message Content Intent**。矛盾の自動supersedeは段階Cへ。これにより改善バックログ「自然言語対話インターフェース」も実現。
- [x] **段階C — 運用**（実装・本番反映済み）: ①**矛盾の自動supersede**（覚える時に重複/矛盾する古い方針を司書が検出→確認後に置換）②**使用追跡＋予算降格**（`directives()`が use_count/last_used を記録し優先度→最近使用順で予算内を選択、超過分はRAG有効時に example層へ降格）③**deterministic routing**（「送信元Xは無視」等は曖昧な方針でなく `data/denylist.json` に入れ、crawl/draft が From で除外）④**コンパクション**（「方針を整理して」で司書が統合セット＋全置換supersedeを提案）。smoke `[14]`。

## ワークフロー改修（[#62](https://github.com/sean9061/numa_server/issues/62)）
電力削減・コンテキスト満溢対策・Webリサーチを段階的に実装。各段階で動作確認してから次へ。
- [x] **段階1 — スケジュールのcron化**: 固定インターバルをやめ `CRAWL_HOURS` で**時刻指定**実行（既定 `1,5,9,12,15,18,21` ＝**1日7回**: 夜間2回＋日中5回）。`crawl_minute`併用。空なら従来 `CRAWL_INTERVAL_MIN` にフォールバック（後方互換）。疎な運用で無駄な電力を抑える。**実機(Docker)でスケジューラ反映を確認済み**。
- [x] **段階2 — マネージャ・オーケストレータ＋コンテキスト分割**: 1クロールを「計画→逐次実行→統合」に再構成。マネージャLLMがサブタスク（`inspect_email`/`check_calendar`/`web_research`）を書き出し→**1件ずつ逐次**にサブセッション実行（`inspect_email` は `ORCHESTRATOR_BATCH_SIZE` 件ずつ再分割し各呼び出しを `num_ctx` 内に収める）→ `scratchpad` の所見を `integrate` で統合して `Proposal` 化。`ORCHESTRATOR_ENABLED`。reconcile後処理は `finalize_proposals` に切り出し simple path と共用。plan解釈不能時は一括reconcileにフォールバック。`web_research` は段階3で実装（段階2はスキップ）。**実機dry-run（Notion書込なし）で plan→execute→integrate を確認済み**。
- [x] **段階3 — Webリサーチ（SearXNG自ホスト）**: `searxng/`（`compose.yaml`＋`settings.yml`）を `ollama_net` 内に追加（ホストポート非公開・内部専用・NPM非経由）。`tools/web.py`（`search_web`/`fetch_url`、httpx）→ `web_research` サブタスクが検索→上位本文取得→LLM要約→ `research` メモとして `integrate` の参考情報に。`WEB_RESEARCH_ENABLED`（既定false）。**Google エンジンは無効化**し DuckDuckGo/Brave/Startpage 等を使用（Googleは自ホストSearXNGをブロックするため）。内部専用・単一クライアントのため limiter/bot検知はoff（Valkey不要）。

## 改善バックログ（任意）
- [ ] チャット（Discord/Slack等）のクロール対応（要望にあったが対象未定）。
- [x] 却下/由来ID(source)の記憶による再提案防止: 反映済み(applied)・却下済み(rejected)の由来IDを `data/seen_sources.json` に永続記録し、reconcile で除外。Notionタスクを削除/完了しても、また却下しても、同じメール/予定から再提案されない。再提案させたい場合は `seen_sources.json` の該当エントリを消す。
- [ ] Web管理UI（実行履歴・タスク・Memory・承認キューの閲覧/操作）。
- [ ] 提案の**個別**承認（現状は一括承認/却下）。
- [ ] `feat/llm-agent` の push / PR。

## セキュリティ方針
- **メールは完全読み取り専用**: Gmail OAuthスコープは `gmail.readonly` のみ。送信・下書き作成・書込系API(`messages.send`/`drafts.*`)は一切実装しない。返信は「案」をDiscordに提示するだけで、Gmailへの書込はしない（送信は構造的に不可）。※`gmail.compose`(下書き作成)は送信権限を不可分に含むため不採用。
- **タスク追加(Notion書込)は低リスクのため承認不要**（既定）。メール下書き等の送信前操作・高リスク操作は引き続き **Discord承認必須**（`interrupt` 経由、Phase 2以降）。`REQUIRE_APPROVAL=true` でタスク追加にも承認を挟める。
- `agent` コンテナは Docker socket / ホストFS を非マウント。シークレットは `.env`(chmod 600) と `data/` のトークンのみ。

## セットアップ参照
- 設定: `.env`（`.env.example` 参照）。`NOTION_DUE_PROP` はNotionの日付列名に合わせる。
- Google認可（ヘッドレス向け手動方式）: `scripts/google_auth_manual.py url` → ブラウザ承認 → リダイレクト先URLを `scripts/google_auth_manual.py token "<URL>"` に渡す。OAuthアプリは Production(公開) 推奨（テストだとトークン約7日で失効）。
- Notion: 内部コネクション(=旧インテグレーション)を作成しタスクDB（の親ページ）に接続。DB IDはURLの32桁。
- RAG/Memory(Phase 2b): `MEMORY_ENABLED=true` で有効化。埋め込みモデルの取得が必要: `docker exec -it ollama ollama pull nomic-embed-text`。ストアは `data/chroma`。
- オフライン検証: `scripts/smoke.py`。
