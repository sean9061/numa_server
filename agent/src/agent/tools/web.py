"""Web 検索・取得 (#62 段階3)。自ホスト SearXNG(内部専用) 経由・読み取り専用。

- search_web(query): SearXNG の JSON API で検索し title/url/content(抜粋) を返す。
- fetch_url(url)   : ページを取得し HTML を素朴にテキスト化して返す(ベストエフォート)。

外部への直接アクセスは agent → SearXNG(http://searxng:8080) と、fetch_url 時の対象URLのみ。
SearXNG が上流エンジン(DuckDuckGo 等)へ問い合わせる。Google は SearXNG 側で無効化済み。
"""
from __future__ import annotations

import logging
import re

import httpx

from ..config import settings

log = logging.getLogger("agent.tools.web")

_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
_SCRIPT = re.compile(r"<(script|style|noscript)[^>]*>.*?</\1>", re.DOTALL | re.IGNORECASE)
_TAG = re.compile(r"<[^>]+>")
_WS = re.compile(r"\s+")


def search_web(query: str, max_results: int | None = None) -> list[dict]:
    """SearXNG(JSON) で検索し [{title, url, content}] を返す。失敗時は空リスト。"""
    if not query.strip():
        return []
    limit = max_results or settings.web_search_max_results
    try:
        resp = httpx.get(
            f"{settings.searxng_url}/search",
            params={"q": query, "format": "json"},
            timeout=15,
        )
        resp.raise_for_status()
        results = resp.json().get("results", [])
    except Exception:
        log.exception("search_web 失敗 query=%s", query)
        return []
    out: list[dict] = []
    for r in results[:limit]:
        out.append(
            {
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "content": r.get("content", ""),  # SearXNG が付ける抜粋
            }
        )
    log.info("search_web: '%s' → %d件", query, len(out))
    return out


def fetch_url(url: str, max_chars: int | None = None) -> str:
    """URL を取得し HTML を素朴にテキスト化して返す(ベストエフォート)。失敗時は空文字。"""
    cap = max_chars or settings.web_fetch_max_chars
    try:
        resp = httpx.get(url, timeout=15, follow_redirects=True, headers={"User-Agent": _UA})
        resp.raise_for_status()
        html = resp.text
    except Exception:
        log.warning("fetch_url 失敗 url=%s", url)
        return ""
    text = _SCRIPT.sub(" ", html)
    text = _TAG.sub(" ", text)
    text = _WS.sub(" ", text).strip()
    return text[:cap]
