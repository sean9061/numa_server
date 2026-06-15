"""Google Calendar 読み取り。今後N日分の予定を取得する(突合用・読み取り専用)。"""
from __future__ import annotations

import datetime as dt
import logging

from googleapiclient.discovery import build

from ..config import settings
from ..google_auth import get_credentials

log = logging.getLogger("agent.tools.gcal")


def fetch_upcoming() -> list[dict]:
    """primary カレンダーの今後 calendar_lookahead_days 日分の予定を返す。"""
    creds = get_credentials()
    service = build("calendar", "v3", credentials=creds, cache_discovery=False)

    now = dt.datetime.now(dt.timezone.utc)
    time_max = now + dt.timedelta(days=settings.calendar_lookahead_days)

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
        out.append(
            {
                "source": f"calendar:{ev.get('id', '')}",
                "link": ev.get("htmlLink", ""),
                "summary": ev.get("summary", "(無題の予定)"),
                "start": start.get("dateTime") or start.get("date", ""),
                "location": ev.get("location", ""),
            }
        )
    log.info("Calendar: %d件取得", len(out))
    return out
