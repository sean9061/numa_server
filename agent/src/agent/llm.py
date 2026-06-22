"""Ollama 上のローカルLLMへの接続。ollama_net 経由で http://ollama:11434 を使う。"""
from __future__ import annotations

from langchain_ollama import ChatOllama

from .config import settings


def resolve_keep_alive() -> str:
    """AGENT_MODEL に応じた keep_alive を返す(モデル非依存の汎用設計)。

    warm slot 再利用でクラッシュする既知モデル(ollama_no_warm_models, 既定は qwen3.6 等の
    ハイブリッドSSM)に名前が一致したら "0"(毎回まっさらなslotで再ロード)に落とし、
    それ以外のモデルは warm(ollama_keep_alive)で高速化する。
    OLLAMA_KEEP_ALIVE を .env / 環境変数で明示した場合は自動判定を無効化しその値を使う(完全手動)。
    """
    if "ollama_keep_alive" in settings.model_fields_set:
        return settings.ollama_keep_alive  # ユーザーが明示 → 最優先
    model = settings.agent_model.lower()
    patterns = [p.strip().lower() for p in settings.ollama_no_warm_models.split(",") if p.strip()]
    if any(p in model for p in patterns):
        return "0"  # warm slot で落ちる既知モデル → 毎回再ロード
    return settings.ollama_keep_alive


def make_llm(**kwargs) -> ChatOllama:
    """エージェントの推論/tool-calling 用 ChatOllama を生成する。

    AGENT_MODEL でどのローカルモデルにも差し替え可能(qwen3.6 / gemma4 / 他)。
    keep_alive はモデルに応じて resolve_keep_alive() が自動で決める。
    """
    params = {
        "base_url": settings.ollama_base_url,
        "model": settings.agent_model,
        "temperature": 0,
        "num_ctx": settings.llm_num_ctx,
        "keep_alive": resolve_keep_alive(),  # モデル名から自動判定(SSM系は"0", 他はwarm)
    }
    params.update(kwargs)
    return ChatOllama(**params)
