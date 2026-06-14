"""Gmail 読み取り。重要/未読メールのメタデータを取得する(本文全文は取らずスニペットのみ)。

※ 読み取り専用。送信系API(messages.send / drafts)はこのモジュールに一切実装しない。
"""
from __future__ import annotations

import logging

from googleapiclient.discovery import build

from ..config import settings
from ..google_auth import get_credentials

log = logging.getLogger("agent.tools.gmail")


def _header(headers: list[dict], name: str) -> str:
    for h in headers:
        if h.get("name", "").lower() == name.lower():
            return h.get("value", "")
    return ""


def fetch_recent() -> list[dict]:
    """設定された検索クエリに合致する最近のメールを返す(同期・to_thread から呼ぶ想定)。"""
    creds = get_credentials()
    service = build("gmail", "v1", credentials=creds, cache_discovery=False)

    listing = (
        service.users()
        .messages()
        .list(userId="me", q=settings.gmail_query, maxResults=settings.gmail_max_results)
        .execute()
    )
    out: list[dict] = []
    for ref in listing.get("messages", []):
        msg = (
            service.users()
            .messages()
            .get(
                userId="me",
                id=ref["id"],
                format="metadata",
                metadataHeaders=["From", "Subject", "Date"],
            )
            .execute()
        )
        headers = msg.get("payload", {}).get("headers", [])
        out.append(
            {
                "source": f"gmail:{ref['id']}",
                "from": _header(headers, "From"),
                "subject": _header(headers, "Subject"),
                "date": _header(headers, "Date"),
                "snippet": msg.get("snippet", ""),
            }
        )
    log.info("Gmail: %d件取得", len(out))
    return out
