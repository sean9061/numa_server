"""アプリ設定。環境変数(.env / compose env_file)から読み込み、起動時に必須項目を検証する。"""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    # --- Ollama ---
    ollama_base_url: str = "http://ollama:11434"
    agent_model: str = "qwen3.6:35b-a3b-q4_K_M"
    llm_num_ctx: int = 16384   # context長。小さいとクロール時にプロンプトが溢れ出力が壊れる

    # --- Discord (Phase 0 で必須) ---
    discord_bot_token: str
    discord_channel_id: int

    # --- 動作設定 ---
    data_dir: str = "/app/data"
    crawl_interval_min: int = 30
    max_proposals_per_run: int = 10
    run_on_start: bool = True
    # タスク追加は低リスクなので既定で承認不要(直接Notionへ挿入し結果のみ通知)。
    # true にすると従来通り Discord ボタンでの承認を挟む。
    require_approval: bool = False

    # --- Google (Phase 1) ---
    google_oauth_client_json: str = "/app/data/google_client.json"
    google_token_json: str = "/app/data/google_token.json"
    gmail_query: str = "is:unread (is:important OR is:starred)"
    gmail_max_results: int = 15
    gmail_body_max_chars: int = 4000   # 返信生成に渡すメール本文の上限
    calendar_lookahead_days: int = 14

    # --- メール返信案 (Phase 2a, 読み取り専用) ---
    draft_enabled: bool = False        # 返信案フローの有効化 (Discordに案を提示するだけ)
    draft_max_per_run: int = 5         # 1回で生成する返信案の上限
    # 日程提案用の空き時間計算 (カレンダーから決定論的に算出)
    avail_days: int = 14               # 何日先まで空き枠を探すか
    avail_day_start: int = 9           # 営業時間の開始(時)
    avail_day_end: int = 21            # 営業時間の終了(時)
    avail_weekdays_only: bool = True   # 平日のみ提案するか
    avail_min_minutes: int = 60        # 空き枠とみなす最小の連続時間(分)
    avail_max_slots: int = 12          # LLMに渡す空き枠の最大数

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

    # --- Moodle (Phase 1) ---
    moodle_base_url: str = ""
    moodle_ws_token: str = ""


settings = Settings()  # 必須項目が欠けていれば import 時に ValidationError で即落ちる
