"""アプリ設定。環境変数(.env / compose env_file)から読み込み、起動時に必須項目を検証する。"""
from __future__ import annotations

from typing import Any

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    # --- Ollama ---
    ollama_base_url: str = "http://ollama:11434"
    agent_model: str = "qwen3.6:35b-a3b-q4_K_M"
    llm_num_ctx: int = 16384   # context長。小さいとクロール時にプロンプトが溢れ出力が壊れる
    # keep_alive: モデルをVRAMに保持する時間。warm slot 再利用で高速化できるが、一部の
    # ハイブリッドSSMモデル(qwen3.6 等)は Ollama 0.30.7 で warm slot の2回目推論時に
    # recurrent状態を partial seq removal できず llama-server がクラッシュする(実機で確認)。
    # → どのモデルでも動く汎用設計のため、keep_alive は llm.resolve_keep_alive() が
    #   モデル名から自動判定する: ollama_no_warm_models に一致するモデルは "0"(毎回再ロード)、
    #   それ以外はこの warm 既定値を使う。OLLAMA_KEEP_ALIVE を .env で明示すると自動判定より優先。
    ollama_keep_alive: str = "5m"
    # warm slot 再利用でクラッシュする既知モデル名のパターン(部分一致・小文字・カンマ区切り)。
    # 該当モデルは自動で keep_alive="0" に落とす。新しい問題モデルが出たらここに追記するだけ。
    # Ollama 側で SSM warm 対応が改善したら空("")にすれば全モデル warm 化できる。
    ollama_no_warm_models: str = "qwen3.6"

    # --- Discord (Phase 0 で必須) ---
    discord_bot_token: str
    discord_channel_id: int
    # 司書(会話で方針をCRUD・段階B)。要 Message Content Intent (Developer Portal)。
    librarian_enabled: bool = True
    # 短期会話セッション: この分数 無応答だと文脈をリセット(プロセス内のみ・再起動で消える)。
    session_idle_min: int = 5
    session_max_messages: int = 12  # セッションで保持する発話数(user+assistant 合算)

    # --- 動作設定 ---
    data_dir: str = "/app/data"
    # クロールの実行タイミング。CRAWL_HOURS を設定すると「時刻指定(cron)」になり、
    # 指定した各時刻(時)の CRAWL_MINUTE 分に実行する(例 "3,12,18" = 深夜3時+昼12時+夜18時)。
    # 無駄な電力を避けるため日中数回+夜間1回など疎な運用にできる。
    # 空("")のときは従来どおり crawl_interval_min の固定インターバルで動く(後方互換)。
    crawl_hours: str = "1,5,9,12,15,18,21"  # 1日7回(夜間2回+日中5回)。空ならインターバル方式
    crawl_minute: int = 0      # 各時刻の何分に実行するか (cron 方式時のみ有効)
    crawl_interval_min: int = 30
    max_proposals_per_run: int = 10
    # --- マネージャ・オーケストレータ (#62 段階2) ---
    # true: 1クロールを「計画→逐次実行→統合」に再構成(コンテキスト分割)。false: 従来の一括reconcile。
    orchestrator_enabled: bool = False
    orchestrator_max_subtasks: int = 20   # マネージャが書き出すサブタスクの上限
    orchestrator_batch_size: int = 3      # inspect_email 1呼び出しで精査するメール件数(満溢回避)
    # --- Web リサーチ (#62 段階3, SearXNG 自ホスト経由) ---
    # true で web_research サブタスクが実検索(SearXNG)→要約を行う。false なら従来どおりスキップ。
    web_research_enabled: bool = False
    searxng_url: str = "http://searxng:8080"  # 内部専用 SearXNG (ollama_net)
    web_search_max_results: int = 5           # 1検索で採用する結果数
    web_fetch_max_chars: int = 3000           # ページ取得時に要約へ渡す本文の上限(満溢回避)
    run_on_start: bool = True
    # タスク追加は低リスクなので既定で承認不要(直接Notionへ挿入し結果のみ通知)。
    # true にすると従来通り Discord ボタンでの承認を挟む。
    require_approval: bool = False

    # --- 実行履歴 (#64: いつ何を見て何をしたかの記録) ---
    # 各クロール/返信案サイクルの後に Discord へ簡潔なサマリを出す(提案なし/エラーも含め毎回)。
    # 自動起動が「何を見て何をしたか」を可視化する。記録(runs.jsonl)は本設定に関わらず常に残す。
    run_summary_enabled: bool = True
    # サマリの送信先チャンネルID。0(未設定)なら通常の通知チャンネル(discord_channel_id)に送る。
    # 承認ボタン付きの提案/追加通知は従来チャンネルのまま、サマリだけ別チャンネルに分けられる。
    run_summary_channel_id: int = 0
    # 『最近何やった?』(司書 action=runs)で表示する直近の実行数。
    runs_history_limit: int = 15

    @field_validator("run_summary_channel_id", mode="before")
    @classmethod
    def _blank_channel_to_zero(cls, v: Any) -> Any:
        # .env で RUN_SUMMARY_CHANNEL_ID= と空指定された場合に int 解析で落ちないよう 0 扱いにする
        return 0 if v in ("", None) else v

    # --- Google (Phase 1) ---
    google_oauth_client_json: str = "/app/data/google_client.json"
    google_token_json: str = "/app/data/google_token.json"
    # 追加でクロールするメールボックスのトークン(カンマ区切り・任意)。Gmail のみ合算する
    # (Calendar は主アカウントのみ)。各アカウントは scripts/google_auth_manual.py で個別に
    # 認可し別ファイルへ保存する。例: /app/data/google_token_2.json,/app/data/google_token_3.json
    gmail_extra_tokens: str = ""
    gmail_query: str = "is:unread (is:important OR is:starred)"
    gmail_max_results: int = 15
    gmail_body_max_chars: int = 4000   # 返信生成に渡すメール本文の上限
    calendar_lookahead_days: int = 14

    # --- メール返信案 (Phase 2a, 読み取り専用) ---
    draft_enabled: bool = False        # 返信案フローの有効化 (Discordに案を提示するだけ)
    draft_max_per_run: int = 5         # 1回で生成する返信案(出力)の上限
    # 1回にLLMへ渡す候補メール(入力)の上限。本文を丸ごと渡すため、多すぎると
    # プロンプトが num_ctx を超えモデルランナーが落ちる(実機で確認)。本文長は維持し件数で制御。
    draft_max_candidates: int = 4
    # 日程提案用の空き時間計算 (カレンダーから決定論的に算出)
    avail_days: int = 14               # 何日先まで空き枠を探すか
    avail_day_start: int = 9           # 営業時間の開始(時)
    avail_day_end: int = 21            # 営業時間の終了(時)
    avail_weekdays_only: bool = True   # 平日のみ提案するか
    avail_min_minutes: int = 60        # 空き枠とみなす最小の連続時間(分)
    avail_max_slots: int = 12          # LLMに渡す空き枠の最大数

    # --- エージェント・メモリ層 (docs/agent-memory.md) ---
    # directive層(常時注入のルール)は常時ON・埋め込み不要(空なら無効果)。
    memory_directive_budget: int = 15     # 常時注入する方針の最大件数(global+domain合算)
    # example層(RAG)。依存が重いので既定 false。directiveとは独立。
    memory_enabled: bool = False          # 過去事例の文脈化(RAG/埋め込み)を有効化する
    embed_model: str = "nomic-embed-text" # Ollama の埋め込みモデル
    memory_top_k: int = 3                 # 1クエリあたり recall する類似事例数
    memory_max_distance: float = 0.6      # cosine距離の上限(超える事例は無関係として除外)

    # --- Notion (Phase 1) ---
    notion_api_token: str = ""
    notion_tasks_db_id: str = ""
    notion_due_prop: str = "Due"        # 締切を入れる date プロパティ名 (無ければスキップ)
    notion_source_prop: str = ""        # 由来ID/リンクを入れる rich_text プロパティ名 (任意・重複防止に使う)
    # 新規タスクにデフォルトで付与するステータスと挿入者タグ (DBに該当プロパティが無ければスキップ)
    notion_status_prop: str = "Status"      # status / select 型のプロパティ名
    notion_default_status: str = "未着手"    # 上記に設定する値 (status型は既存オプションに一致時のみ)
    notion_tag_prop: str = "Tags"           # multi_select / select 型のプロパティ名
    notion_agent_tag: str = "Agent"         # 挿入者を示すタグ値

    # --- Moodle (Phase 1.5 — Google SSO自動ログイン(Playwright)・読取専用) ---
    # サイト全体が Google SSO ゲートウェイの内側にあり、トークン系・Cookie注入では維持不可
    # (Cookieは約2時間で失効)。Playwright の永続プロファイルで Google セッションを保持し、
    # 毎クロール自動でゲートウェイ通過→iCal取得する。初回のみ scripts/moodle_login.py で人手ログイン。
    moodle_enabled: bool = False
    moodle_ical_url: str = ""            # カレンダー→エクスポート→「カレンダーのURLを取得」で得るURL
    # 今日から何日先までの締切を取り込むか。先の課題はまだ授業を受けていないので近い分だけ。
    moodle_lookahead_days: int = 7
    # この語で終わるイベントは除外する(カンマ区切り)。既定: 「開始」マーカー(=受験/提出が
    # 可能になった通知でありタスクではない)を落とし、提出期限・「終了」等の締切系だけ残す。
    moodle_exclude_suffixes: str = "開始"


settings = Settings()  # 必須項目が欠けていれば import 時に ValidationError で即落ちる
