"""Gmail 読み取り (返信案の生成用に本文も取得する)。

- fetch_recent()          : 重要/未読メールのメタデータ(本文はスニペットのみ)
- fetch_reply_candidates(): 返信案の生成用に本文・件名込みで取得

※ 完全な読み取り専用。送信・下書き作成(messages.send / drafts.*)は **一切実装しない**。
   返信は「案」をDiscordに提示するだけで、Gmailへの書込はしない。
"""
from __future__ import annotations

import base64
import logging

from googleapiclient.discovery import build

from ..config import settings
from ..google_auth import get_credentials

log = logging.getLogger("agent.tools.gmail")


def _service():
    creds = get_credentials()
    return build("gmail", "v1", credentials=creds, cache_discovery=False)


def _decode_part(data: str) -> str:
    return base64.urlsafe_b64decode(data.encode()).decode("utf-8", errors="replace")


def _extract_body(payload: dict) -> str:
    """MIMEツリーから text/plain を優先抽出。無ければ text/html を素朴に剥がす。"""
    stack = [payload]
    html_fallback = ""
    while stack:
        part = stack.pop()
        mime = part.get("mimeType", "")
        body = part.get("body", {})
        data = body.get("data")
        if mime == "text/plain" and data:
            return _decode_part(data)
        if mime == "text/html" and data and not html_fallback:
            import re as _re
            html_fallback = _re.sub(r"<[^>]+>", " ", _decode_part(data))
        stack.extend(part.get("parts", []))
    return html_fallback.strip()


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
                "link": f"https://mail.google.com/mail/u/0/#all/{ref['id']}",
                "from": _header(headers, "From"),
                "subject": _header(headers, "Subject"),
                "date": _header(headers, "Date"),
                "snippet": msg.get("snippet", ""),
            }
        )
    log.info("Gmail: %d件取得", len(out))
    return out


def fetch_reply_candidates() -> list[dict]:
    """返信下書き用に、本文・スレッドID・Message-ID 込みでメールを取得する。"""
    service = _service()
    listing = (
        service.users()
        .messages()
        .list(userId="me", q=settings.gmail_query, maxResults=settings.gmail_max_results)
        .execute()
    )
    out: list[dict] = []
    for ref in listing.get("messages", []):
        msg = service.users().messages().get(userId="me", id=ref["id"], format="full").execute()
        payload = msg.get("payload", {})
        headers = payload.get("headers", [])
        body = _extract_body(payload)
        out.append(
            {
                "source": f"gmail:{ref['id']}",
                "link": f"https://mail.google.com/mail/u/0/#all/{ref['id']}",
                "from": _header(headers, "From"),
                "subject": _header(headers, "Subject"),
                "date": _header(headers, "Date"),
                "body": body[: settings.gmail_body_max_chars],
            }
        )
    log.info("Gmail: 返信候補 %d件取得", len(out))
    return out
