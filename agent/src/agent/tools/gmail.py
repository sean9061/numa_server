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
from ..google_auth import get_credentials, token_paths

log = logging.getLogger("agent.tools.gmail")


def _account_email(service) -> str | None:
    """このサービス(トークン)が指すメールアドレス。失敗時は None(リンクは既定アカウント表記)。"""
    try:
        return service.users().getProfile(userId="me").execute().get("emailAddress")
    except Exception:
        log.warning("Gmail: getProfile に失敗(リンクは既定アカウント表記になります)")
        return None


def _link(msg_id: str, account: str | None) -> str:
    """メールへのディープリンク。複数アカウント時はメールアドレスでアカウントを固定する
    (単一なら従来どおり /u/0/)。"""
    return f"https://mail.google.com/mail/u/{account or '0'}/#all/{msg_id}"


def _iter_services():
    """クロール対象アカウントごとに (service, account_email) を返す。

    複数アカウント時のみ account_email を解決(リンクを正しいアカウントへ向けるため)。
    1つのトークンが壊れていても他アカウントのクロールは続行する。
    """
    paths = token_paths()
    multi = len(paths) > 1
    for path in paths:
        try:
            creds = get_credentials(path)
        except Exception:
            log.exception("Gmail: トークン読込に失敗 path=%s (このアカウントをスキップ)", path)
            continue
        service = build("gmail", "v1", credentials=creds, cache_discovery=False)
        yield service, (_account_email(service) if multi else None)


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
    """検索クエリに合致する最近のメールを全クロール対象アカウントから返す(同期)。"""
    out: list[dict] = []
    for service, account in _iter_services():
        listing = (
            service.users()
            .messages()
            .list(userId="me", q=settings.gmail_query, maxResults=settings.gmail_max_results)
            .execute()
        )
        n0 = len(out)
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
            item = {
                "source": f"gmail:{ref['id']}",
                "link": _link(ref["id"], account),
                "from": _header(headers, "From"),
                "subject": _header(headers, "Subject"),
                "date": _header(headers, "Date"),
                "snippet": msg.get("snippet", ""),
            }
            if account:
                item["account"] = account
            out.append(item)
        log.info("Gmail[%s]: %d件取得", account or "primary", len(out) - n0)
    log.info("Gmail: 合計 %d件取得", len(out))
    return out


def fetch_reply_candidates() -> list[dict]:
    """返信案用に、本文込みのメールを全クロール対象アカウントから取得する。"""
    out: list[dict] = []
    for service, account in _iter_services():
        listing = (
            service.users()
            .messages()
            .list(userId="me", q=settings.gmail_query, maxResults=settings.gmail_max_results)
            .execute()
        )
        n0 = len(out)
        for ref in listing.get("messages", []):
            msg = service.users().messages().get(userId="me", id=ref["id"], format="full").execute()
            payload = msg.get("payload", {})
            headers = payload.get("headers", [])
            body = _extract_body(payload)
            item = {
                "source": f"gmail:{ref['id']}",
                "link": _link(ref["id"], account),
                "from": _header(headers, "From"),
                "subject": _header(headers, "Subject"),
                "date": _header(headers, "Date"),
                "body": body[: settings.gmail_body_max_chars],
            }
            if account:
                item["account"] = account
            out.append(item)
        log.info("Gmail[%s]: 返信候補 %d件取得", account or "primary", len(out) - n0)
    log.info("Gmail: 返信候補 合計 %d件取得", len(out))
    return out
