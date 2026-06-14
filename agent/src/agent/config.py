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

    # --- Google (Phase 1) ---
    google_oauth_client_json: str = "/app/data/google_client.json"
    google_token_json: str = "/app/data/google_token.json"
    gmail_query: str = "is:unread (is:important OR is:starred)"
    gmail_max_results: int = 15
    calendar_lookahead_days: int = 14

    # --- Notion (Phase 1) ---
    notion_api_token: str = ""
    notion_tasks_db_id: str = ""
    notion_due_prop: str = "Due"        # 締切を入れる date プロパティ名 (無ければスキップ)
    notion_source_prop: str = ""        # 由来IDを入れる rich_text プロパティ名 (任意・重複防止に使う)

    # --- Moodle (Phase 1) ---
    moodle_base_url: str = ""
    moodle_ws_token: str = ""


settings = Settings()  # 必須項目が欠けていれば import 時に ValidationError で即落ちる
