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
- 主要ファイル: `src/agent/{graph,runtime,discordbot,scheduler,llm,checkpoint,config}.py`, `src/agent/tools/{gmail,gcal,notion}.py`。

## フェーズ進捗
- [x] **Phase 0 — 共通基盤**: Discord HITL往復 / SQLite checkpoint / Ollama接続・tool-calling実証。
- [x] **Phase 1 — タスク管理クロールMVP**: Gmail(重要/未読)+Calendar→LLM突合→Discord承認→Notion反映。締切(due)はメール本文の日付 or カレンダー予定開始日で補完。**実データ動作確認済み**。
- [ ] **Phase 1.5 — Moodle連携**: 課題・締切をクロール対象に追加（Web Services REST、無効ならPlaywrightスクレイピング）。
- [ ] **Phase 2 — メール返信下書き + RAG**: `gmail.create_draft()`（送信は絶対しない）。Memory/RAG（`nomic-embed-text` + Chroma `data/chroma`）でカレンダー・過去判断を文脈化。※`gmail.compose` スコープ追加＝再認可が必要。
- [ ] **Phase 3 — 家電制御**: SwitchBot API（ライト/エアコン）、カレンダー連動の通知/アラーム。Alexaは公式ローカルAPIが無く要調査。
- [ ] **Phase 4 — 課題の自動実行**（最高リスク・最後）: 素材収集→実行可能性判定→実行 or ユーザー呼出。**使い捨てサンドボックスコンテナ限定**（本番サーバー上で直接実行しない）。

## 改善バックログ（任意）
- [ ] チャット（Discord/Slack等）のクロール対応（要望にあったが対象未定）。
- [ ] Web管理UI（実行履歴・タスク・Memory・承認キューの閲覧/操作）。
- [ ] 提案の**個別**承認（現状は一括承認/却下）。
- [ ] `feat/llm-agent` の push / PR。

## セキュリティ方針
- **メール送信は構造的に不可**: `drafts.create` のみ実装、OAuthスコープは `gmail.readonly`(+将来 `gmail.compose`)に限定し `gmail.send` を付与しない。
- 全ての外部書込・送信前操作は **Discord承認必須**（`interrupt` 経由）。
- `agent` コンテナは Docker socket / ホストFS を非マウント。シークレットは `.env`(chmod 600) と `data/` のトークンのみ。

## セットアップ参照
- 設定: `.env`（`.env.example` 参照）。`NOTION_DUE_PROP` はNotionの日付列名に合わせる。
- Google認可（ヘッドレス向け手動方式）: `scripts/google_auth_manual.py url` → ブラウザ承認 → リダイレクト先URLを `scripts/google_auth_manual.py token "<URL>"` に渡す。OAuthアプリは Production(公開) 推奨（テストだとトークン約7日で失効）。
- Notion: 内部コネクション(=旧インテグレーション)を作成しタスクDB（の親ページ）に接続。DB IDはURLの32桁。
- オフライン検証: `scripts/smoke.py`。
