"""カレンダー予定から空き時間帯を決定論的に計算する (返信の日程提案用)。

LLMに「空いている日時」を推測させると不正確になりやすいため、ここで予定(busy)を
差し引いた実在の空き枠だけを算出し、LLMにはその中から選ばせる(=確実性を担保)。
営業時間・平日のみ等は設定で調整可能。
"""
from __future__ import annotations

import datetime as dt
import logging

from .config import settings

log = logging.getLogger("agent.availability")

_JST = dt.timezone(dt.timedelta(hours=9))
_WD = ("月", "火", "水", "木", "金", "土", "日")


def _to_busy_interval(start: str, end: str) -> tuple[dt.datetime, dt.datetime] | None:
    """予定の start/end (ISO日時 or all-day日付) を JST の (開始, 終了) に変換する。"""
    if start and "T" in start:  # 時刻あり
        try:
            s = dt.datetime.fromisoformat(start.replace("Z", "+00:00"))
            e = dt.datetime.fromisoformat(end.replace("Z", "+00:00")) if end and "T" in end else None
        except ValueError:
            return None
        s = (s if s.tzinfo else s.replace(tzinfo=_JST)).astimezone(_JST)
        e = (e.astimezone(_JST) if e else s + dt.timedelta(hours=1))
        return (s, e)
    if start:  # 終日予定 (date のみ)。Google の end は翌日(排他的)
        try:
            sd = dt.date.fromisoformat(start[:10])
            ed = dt.date.fromisoformat(end[:10]) if end else sd + dt.timedelta(days=1)
        except ValueError:
            return None
        return (dt.datetime.combine(sd, dt.time(), _JST), dt.datetime.combine(ed, dt.time(), _JST))
    return None


def free_slots(events: list[dict], now: dt.datetime | None = None) -> list[dict]:
    """events(各 start/end を持つ)から、今後の空き時間帯を計算して返す。

    返り値: [{"start": ISO, "end": ISO, "label": "6月17日(水) 10:00〜12:00"}, ...]
    営業時間(既定 平日9:00〜21:00)内で、予定と重複しない min 分以上の連続空きを列挙する。
    """
    now = now or dt.datetime.now(_JST)
    # busy とみなすのは「時刻付き」かつ transparency!=transparent の予定のみ。
    # 終日(all-day)予定は「学期/期間/記念日」等の情報マーカーが多く Google でも既定 free 扱いなので除外する
    # (これを busy にすると長期の終日予定が窓を丸ごと潰してしまう)。
    busy = sorted(
        iv
        for iv in (
            _to_busy_interval(e.get("start", ""), e.get("end", ""))
            for e in events
            if "T" in (e.get("start") or "") and e.get("transparency", "opaque") != "transparent"
        )
        if iv
    )

    slots: list[dict] = []
    for offset in range(settings.avail_days + 1):
        day = (now + dt.timedelta(days=offset)).date()
        if settings.avail_weekdays_only and day.weekday() >= 5:
            continue
        win_start = dt.datetime.combine(day, dt.time(settings.avail_day_start), _JST)
        win_end = dt.datetime.combine(day, dt.time(settings.avail_day_end), _JST)
        win_start = max(win_start, now)  # 過去の時間帯は提案しない
        if win_start >= win_end:
            continue

        cursor = win_start
        for bs, be in busy:
            if be <= win_start or bs >= win_end:
                continue
            if bs > cursor:
                _add_slot(slots, cursor, min(bs, win_end))
            cursor = max(cursor, be)
            if cursor >= win_end:
                break
        if cursor < win_end:
            _add_slot(slots, cursor, win_end)
        if len(slots) >= settings.avail_max_slots:
            break
    return slots[: settings.avail_max_slots]


def _add_slot(slots: list[dict], start: dt.datetime, end: dt.datetime) -> None:
    if (end - start).total_seconds() < settings.avail_min_minutes * 60:
        return
    label = f"{start.month}月{start.day}日({_WD[start.weekday()]}) {start:%H:%M}〜{end:%H:%M}"
    slots.append({"start": start.isoformat(), "end": end.isoformat(), "label": label})
