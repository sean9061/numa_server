"""Google Calendar 読み取り。今後N日分の予定を取得する(突合用・読み取り専用)。"""
from __future__ import annotations

import datetime as dt
import logging

from googleapiclient.discovery import build

from ..config import settings
from ..google_auth import get_credentials

log = logging.getLogger("agent.tools.gcal")


def fetch_upcoming(days: int | None = None, detailed: bool = False) -> list[dict]:
    """primary カレンダーの今後 N 日分の予定を返す。

    days 未指定なら calendar_lookahead_days(既定14)。チャットの空き時間照会で
    範囲がそれより先のときは days を広げて呼ぶ。
    detailed=True で説明・参加者・主催者・会議URLも拾う(チャットQ&A用。
    crawl/draft では渡さず文脈肥大を避けるため既定 False)。
    """
    creds = get_credentials()
    service = build("calendar", "v3", credentials=creds, cache_discovery=False)

    now = dt.datetime.now(dt.timezone.utc)
    time_max = now + dt.timedelta(days=days or settings.calendar_lookahead_days)

    events = (
        service.events()
        .list(
            calendarId="primary",
            timeMin=now.isoformat(),
            timeMax=time_max.isoformat(),
            singleEvents=True,
            orderBy="startTime",
            maxResults=50,
        )
        .execute()
    )
    out: list[dict] = []
    for ev in events.get("items", []):
        start = ev.get("start", {})
        end = ev.get("end", {})
        item = {
            "source": f"calendar:{ev.get('id', '')}",
            "link": ev.get("htmlLink", ""),
            "summary": ev.get("summary", "(無題の予定)"),
            "start": start.get("dateTime") or start.get("date", ""),
            "end": end.get("dateTime") or end.get("date", ""),
            "transparency": ev.get("transparency", "opaque"),  # transparent=予定なし(free)扱い
            "location": ev.get("location", ""),
        }
        if detailed:
            # チャットのQ&A用に詳細も拾う(crawl/draft では渡さず文脈肥大を避けるため detailed のみ)。
            item["description"] = (ev.get("description") or "").strip()[:500]
            item["attendees"] = [
                (a.get("displayName") or a.get("email") or "").strip()
                for a in ev.get("attendees", [])
                if (a.get("displayName") or a.get("email"))
            ]
            item["organizer"] = (
                (ev.get("organizer") or {}).get("displayName")
                or (ev.get("organizer") or {}).get("email")
                or ""
            )
            item["conference_url"] = ev.get("hangoutLink", "") or _conference_url(ev)
        out.append(item)
    log.info("Calendar: %d件取得%s", len(out), "(詳細)" if detailed else "")
    return out


def _conference_url(ev: dict) -> str:
    """conferenceData の entryPoints から video 会議URLを取り出す(無ければ空)。"""
    for ep in (ev.get("conferenceData", {}) or {}).get("entryPoints", []) or []:
        if ep.get("entryPointType") == "video" and ep.get("uri"):
            return ep["uri"]
    return ""
