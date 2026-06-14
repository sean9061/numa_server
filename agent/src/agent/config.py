"""アプリ設定。環境変数(.env / compose env_file)から読み込み、起動時に必須項目を検証する。"""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    # --- Ollama ---
    ollama_base_url: str = "http://ollama:11434"
    agent_model: str = "qwen3.6:35b-a3b-q4_K_M"

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

    # --- Notion (Phase 1) ---
    notion_api_token: str = ""
    notion_tasks_db_id: str = ""

    # --- Moodle (Phase 1) ---
    moodle_base_url: str = ""
    moodle_ws_token: str = ""


settings = Settings()  # 必須項目が欠けていれば import 時に ValidationError で即落ちる
