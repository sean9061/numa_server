"""Ollama 上のローカルLLMへの接続。ollama_net 経由で http://ollama:11434 を使う。"""
from __future__ import annotations

from langchain_ollama import ChatOllama

from .config import settings


def make_llm(**kwargs) -> ChatOllama:
    """エージェントの推論/tool-calling 用 ChatOllama を生成する。

    qwen3.6:35b-a3b (MoE) を既定とし、tool-calling に最適。
    重い場合は AGENT_MODEL を gemma4:12b 等に切り替える。
    """
    params = {
        "base_url": settings.ollama_base_url,
        "model": settings.agent_model,
        "temperature": 0,
        "num_ctx": settings.llm_num_ctx,
        "keep_alive": settings.ollama_keep_alive,  # 既定"0"=毎回再ロード(SSM warm slotバグ回避)
    }
    params.update(kwargs)
    return ChatOllama(**params)
