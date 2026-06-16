"""アプリ設定。環境変数(.env / compose env_file)から読み込み、起動時に必須項目を検証する。"""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    # --- Ollama ---
    ollama_base_url: str = "http://ollama:11434"
    agent_model: str = "qwen3.6:35b-a3b-q4_K_M"
    llm_num_ctx: int = 16384   # context長。小さいとクロール時にプロンプトが溢れ出力が壊れる
    # 各リクエストごとにモデルを再ロードさせる("0")。qwen3.6(ハイブリッドSSM+MoE)は
    # Ollama 0.30.7 で warm slot の2回目推論時に recurrent状態を partial seq removal できず
    # llama-serverがクラッシュする(実機で確認)。keep_alive=0 で毎回まっさらなslotにして回避。
    # ※ Ollama更新でSSM対応が改善したら "5m" 等に戻すとwarmで高速化できる。
    ollama_keep_alive: str = "0"

    # --- Discord (Phase 0 で必須) ---
    discord_bot_token: str
    discord_channel_id: int
    # 司書(会話で方針をCRUD・段階B)。要 Message Content Intent (Developer Portal)。
    librarian_enabled: bool = True

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

    # --- Moodle (Phase 1) ---
    moodle_base_url: str = ""
    moodle_ws_token: str = ""


settings = Settings()  # 必須項目が欠けていれば import 時に ValidationError で即落ちる
