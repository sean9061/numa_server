# エージェント・メモリ & 自然言語コントロールプレーン（設計）

> ステータス: **段階A 実装・実データ検証済み（コミット 9967d76）/ 段階B 実装・smoke検証済み（本番反映は要 Message Content Intent）/ 段階C 未着手**。本書が設計の真実の源。
> 関連: `ROADMAP.md`（全体）, issue #59。既存の `src/agent/memory.py` がこの層の実体（directive層＋example層を統括）。
>
> **段階A の実装済み範囲**: `memory.py` に directive層（`add_directive`/`deactivate_directive`/`list_directives`/`directives`/`directives_block`）と `context()` を追加。`reconcile_node`・`compose_node` が起動時に `directives_block(domain)` を**常時注入**。初期方針は `scripts/seed_directives.py` で投入（固定id・冪等）。空なら無効果＝後方互換。smoke `[11]` で検証。

## 1. 目的・背景
- **解きたい問題**: タスク提案に低重要度・見当違いのものが多い。これを機能ごとに個別対策すると分散・重複する。
- **方針**: 機能ごとのRAGではなく、**エージェントの全動作（タスク抽出・返信案・将来の家電制御等）が共通して参照し、対話で育てる単一の「振る舞いメモリ層」**を持つ。
- **フィードバックの与え方**: 👎リアクションやNotion差分ではなく、**自然言語の対話**でエージェントに覚えさせる（チャネルは当面 Discord、後で拡張可）。
- 既存バックログ「自然言語対話インターフェース」「汎用Memory（RAG）」は**本基盤に統合**する。

## 2. 全体像
```
[あなた] --自然言語-- Discord会話
                         │ (覚えて/忘れて/何覚えてる?)
                         ▼
                   司書(librarian) LLM ──→ ┌───────────────────┐
                                           │  Agent Memory Store │
   各グラフnode ── memory.context(domain,q) │  ├ directive層(常時) │
   (reconcile / compose / 将来 home …) ◀──  │  └ example層(RAG)    │
                                           └───────────────────┘
```
- **書き手**: 自然言語コントロールプレーン（司書）。会話を構造化メモリに変換。
- **読み手**: 全動作。決定前に `memory.context()` で関連知識を引きプロンプト先頭に注入。
- 判断ロジックは各nodeのまま。**知識だけを共通層から供給**する＝「全動作に紐づく」。

## 3. メモリの二層モデル（最重要の設計判断）
対話で与える内容は性質が異なる。混ぜると失敗するので層を分ける。

| 層 | kind | 例 | 取得方式 |
|---|---|---|---|
| **指示・方針** | `directive` / `preference` | 「メルマガ由来はタスク化しない」「重要度はこう測れ」「敬語は固め」 | **常時注入**（ルールは確実に効かせる） |
| **事例・事実** | `example` / `fact` | 「この案件はこう対応した」「Aさんは契約担当」 | **近傍検索(RAG)**（関連時だけ） |

- ルールをRAG（似た時だけ発火）に入れると「肝心な時に出てこない」事故になる → **指示は常時、事例はRAG**。
- 対話で覚えさせる内容は **大半が directive/preference**。`example` は今の `memory.py` が担当中（過去返信）。

## 4. データモデル
```
MemoryItem {
  id:       str
  kind:     "directive" | "preference" | "fact" | "example"
  domain:   "global" | "task" | "draft" | "home" | ...   # 全動作共通のスコープ
  text:     str        # 自然言語の一文（人間可読）
  priority: int        # 常時注入の順序・予算配分用
  active:   bool       # supersede で false にして無効化（追記でなく差し替え）
  examples_of: str?    # 任意: 由来となった具体ケースへの参照
  origin:   str        # どの会話で覚えたか（監査用）
  ts:       ISO8601
  # example/fact のみ: embedding（Chroma側に保持）
}
```
`domain="global"` は全動作に効く横断ルール。`domain="task"` 等はその動作だけ。Phase 3 家電は `home` で同じ仕組みに乗る。

### 保存先のハイブリッド（重要）
- **directive/preference → `data/directives.json`**（人間可読・直接編集可・件数少なく常時全件ロードが安い・優先度管理しやすい。Claude Code の `MEMORY.md` 方式と同じ思想）。
- **example/fact → Chroma `data/chroma`**（RAG必須・件数が増える。現 `memory.py` を流用）。
- 両者を `memory.py` が単一APIで統括する。

## 5. コンテキスト組み立て `memory.context(domain, query)`
1. `global` + `domain` の `active` な directive/preference を **priority 順に予算内**（例: 最大15件 / N トークン）で取得 → 常時ブロック。
2. `example`/`fact` を query で **top-k recall**（cosine距離閾値で無関係を除外。現 `memory.recall` ）。
3. 両者を整形した1つの文字列を返す。各nodeは `System(base_prompt + context)` するだけ。

- **予算超過時の降格**: あふれた directive は RAG 対象に降格（常時→関連時のみ）。
- **昇格**: 頻繁に関連する example/directive を常時枠へ昇格（将来）。

## 6. 自然言語コントロールプレーン（司書）
入力 = Discord会話メッセージ。LLMの「司書」ステップが処理:
1. **意図分類**: 覚えさせる指示 / 質問・雑談 / 忘却 / 一覧 のどれか。
2. **覚える場合**: `kind`/`domain`/`text` に構造化 → 既存と類似検索して**重複・矛盾を検出**。
3. **矛盾・重複時**: 旧itemを `active=false` で**差し替え（supersede）**、または例外を追加する案を提示。
4. **復唱確認（HITL）**: 「task領域に『採用・求人系メール由来は提案しない』を覚えます。よろしいですか?」→ Discordボタン/返信で承認。ローカルLLMの誤解釈を人間が止める。
- **対話でフルCRUD**: 覚える / 一覧（「何覚えてる?」）/ 忘れる（「あれ忘れて」）/ 編集。

## 7. 矛盾・陳腐化・キュレーション
- **supersede方式**（追記でなく無効化＋新規）で履歴を壊さず更新。
- **例外の表現**: 「採用は無視。ただし内定先Xは拾う」→ 例外directive＋優先度、で表現。
- **コンパクション**（似たdirectiveの統合）は将来。件数増大対策。

## 8. 硬い設定への振り分け（deterministic routing）
- **構造化できるfeedbackは曖昧なプロンプトルールでなく確実な設定へ**:
  - 「送信元Xは常に除外」→ deny-list（`seen` 系/設定）
  - 「Gmailクエリを変えて」→ `.env` の `GMAIL_QUERY`
- **曖昧・判断的なものだけメモリ(directive)へ**。
- 司書がどちらに振り分けるか判定（初期は手動・提示のみでも可）。

## 9. 各動作の消費（配線方針）
- `reconcile_node`（タスク抽出）: `context("task", 候補テキスト)` を System に付与。**重要度スコア(1–5)＋しきい値**もここで directive として表現し低スコアを捨てる。
- `compose_node`（返信案）: 現状の memory 使用を整理し、文体ルール=directive、過去返信=example として `context("draft", …)` に統一。
- 将来 `home`（家電）: `context("home", …)`。
- **共通ヘルパは1つ**。新動作は1行追加で乗る。

## 10. 既存資産との関係
- `memory.py`: **example層の `recall`/`remember` として存続**。directive層と `context()` を追加して統括役に拡張。
- `seen.py`: 「処理済み由来の除外（重複防止）」は別関心。**残す**。硬いdeny-list的ルールはこちら側に寄せられる。
- `config.py`: `MEMORY_ENABLED` 等は層別フラグへ拡張を検討。

## 11. 段階計画
- **A 土台** ✅ 実装済み(未コミット): directiveストア(`data/directives.json`) + `context()`/`directives_block()` + `reconcile`/`compose` への常時注入。初期ルールは `scripts/seed_directives.py` で手動seed。→ 「常時ルールが効くか」を先に確認。**残: 実データでのゴミタスク削減効果の検証**（seed投入＋本番クロールで before/after）。
- **B 対話（Discord）** ✅ 実装・本番反映済み: `librarian.respond()`（**基本は通常チャット**、指示時のみ remember/forget/list）＋ `discordbot.on_message`＋ `_ConfirmView`（確認HITL）。**短期会話セッション**（channel単位・`SESSION_IDLE_MIN`=5分 無応答でリセット・プロセス内のみ）で多ターンの文脈を保持。司書はエージェント本体と同一プロセスのため directive 更新は `_dir_cache` 共有で**再起動なしに次回クロールへ反映**。`LIBRARIAN_ENABLED`(既定true)。**要 Message Content Intent**。
- **C 運用**: supersede・矛盾解消・予算/昇格降格・deterministic routing・コンパクション。

## 12. リスク・未解決
- **常時ルールの予算と無視問題**: 件数が増えるとコンテキストを食い、ローカルLLMが一部を無視/矛盾。予算・優先度・降格が要。
- **NL→構造化の誤り**: ローカルLLMで不安定 → 確認HITLで緩和。
- **矛盾解消の自動化難度**: supersede判定の精度。
- **効果測定**: 「ゴミ率」前後比較をどう計測するか（手動ラベル? 削除率?）未設計。

## 13. 次に決めること（未決定の論点）
- directive の予算（件数/トークン）初期値。
- 確認HITLの粒度（毎回 / まとめて）。
- 重要度スコアのルール化を directive でやるか、コード固定でやるか。
- `domain` 語彙の確定（global/task/draft/home/…）。
