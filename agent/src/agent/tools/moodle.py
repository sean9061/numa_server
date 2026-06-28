"""Moodle 連携 (Phase 1.5) — 読み取り専用。

この学校 Moodle はサイト全体が **Google SSO ゲートウェイ**の内側にあり、httpx 等では突破不可。
そこで **Playwright(永続ブラウザプロファイル)で Google セッションを維持**し、毎クロール
自動でゲートウェイを通過して iCal エクスポートを取得→VEVENTをパースする(`moodle_auth.py`)。

初回のみ `scripts/moodle_login.py` で人間が Google にログイン(MFA含む)。以降は自動。
Google セッションが切れると `NeedsLogin` を検知し `session_expired()`=True →
実行サマリ(Discord)に「再ログインが必要」と出す。

返すアイテムは gmail/gcal と同じ共通 dict 形 ({source, link, title, due, course}) で、
graph.crawl_node から他ソースと同列に reconcile/integrate へ渡る。"""
from __future__ import annotations

import datetime as dt
import logging
import re

from ..config import settings
from . import moodle_auth

log = logging.getLogger("agent.tools.moodle")

_JST = dt.timezone(dt.timedelta(hours=9))


# 直近の取得で再ログインが必要(Googleセッション失効)と判明したか。
# crawl_node が読み出して実行サマリ(Discord)に警告を出すために使う。
_session_expired = False


def session_expired() -> bool:
    return _session_expired


def _enabled() -> bool:
    return bool(settings.moodle_enabled and settings.moodle_ical_url)


# --- iCal(RFC 5545) パース ---------------------------------------------------
def _unfold(text: str) -> list[str]:
    """行折り返し(継続行は先頭が空白)を畳んで論理行のリストにする。"""
    lines: list[str] = []
    for raw in text.replace("\r\n", "\n").split("\n"):
        if raw[:1] in (" ", "\t") and lines:
            lines[-1] += raw[1:]
        else:
            lines.append(raw)
    return lines


def _unescape(v: str) -> str:
    return (
        v.replace("\\n", " ").replace("\\N", " ")
        .replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\")
    ).strip()


_DT_RE = re.compile(r"(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?(Z)?")


def _ics_date(value: str) -> str | None:
    """DTSTART 値(`20260703T144900Z` / `20260704` / TZID付きローカル)から
    YYYY-MM-DD を取り出す。末尾Z(UTC)なら JST に補正してから日付を取る。"""
    m = _DT_RE.search(value or "")
    if not m:
        return None
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    hh, mm, ss = (int(x) if x else 0 for x in (m.group(4), m.group(5), m.group(6)))
    try:
        if m.group(7):  # Z = UTC → JST に補正
            local = dt.datetime(y, mo, d, hh, mm, ss, tzinfo=dt.timezone.utc).astimezone(_JST)
            return local.date().isoformat()
        return dt.date(y, mo, d).isoformat()
    except ValueError:
        return None


def _excluded(title: str) -> bool:
    """「開始」マーカー等(設定 moodle_exclude_suffixes で終わるもの)はタスクでないので除外。"""
    t = title.rstrip().rstrip("　").rstrip()
    for suf in settings.moodle_exclude_suffixes.split(","):
        suf = suf.strip()
        if suf and t.endswith(suf):
            return True
    return False


def _parse_ics(text: str) -> list[dict]:
    """iCal 本文から VEVENT を抽出し共通 dict 形に正規化する。

    過去の締切・開始マーカーは除外し、今日から moodle_lookahead_days 日先までの締切のみ残す
    (先の課題はまだ授業を受けていないので取り込まない)。
    """
    today = dt.date.today()
    today_s = today.isoformat()
    horizon = (today + dt.timedelta(days=settings.moodle_lookahead_days)).isoformat()
    out: list[dict] = []
    cur: dict[str, str] = {}
    in_event = False
    for line in _unfold(text):
        if line == "BEGIN:VEVENT":
            in_event, cur = True, {}
            continue
        if line == "END:VEVENT":
            in_event = False
            item = _event_to_item(cur)
            due = item["due"] if item else None
            if (item and not _excluded(item["title"])
                    and (due is None or today_s <= due <= horizon)):
                out.append(item)
            continue
        if not in_event or ":" not in line:
            continue
        name, value = line.split(":", 1)
        key = name.split(";", 1)[0].upper()  # パラメータ(;TZID=..)は捨てて素のキー
        cur[key] = value
    log.info("Moodle: VEVENT %d件(将来の締切のみ)", len(out))
    return out


def _event_to_item(ev: dict[str, str]) -> dict | None:
    title = _unescape(ev.get("SUMMARY", ""))
    if not title:
        return None
    uid = ev.get("UID", "") or re.sub(r"\W+", "-", f"{title}").strip("-")[:80]
    uid = uid.split("@", 1)[0]  # ドメイン部は冗長なので落とす
    due = _ics_date(ev.get("DTSTART", ""))
    return {
        "source": f"moodle:{uid}",
        "link": (ev.get("URL", "") or "").strip(),
        "title": title,
        "due": due,
        "course": _unescape(ev.get("CATEGORIES", "")),
    }


def fetch_ical(url: str | None = None) -> list[dict]:
    """Playwright で iCal 本文を取得してパースする(probe と本体で共用)。"""
    text = moodle_auth.fetch_ical_text(url or settings.moodle_ical_url)
    return _parse_ics(text)


def fetch_assignments() -> list[dict]:
    """Moodle カレンダーの iCal から今後の課題締切を取得する。無効時/失敗時は空リスト。

    Google セッション失効時は session_expired() が True になる(crawl_node が拾って
    Discord に「再ログインが必要」と通知)。
    """
    global _session_expired
    _session_expired = False
    if not _enabled():
        return []
    try:
        items = fetch_ical()
    except moodle_auth.NeedsLogin as e:
        _session_expired = True
        log.warning("Moodle: 再ログインが必要 — scripts/moodle_login.py を実行 (%s)", e)
        return []
    except Exception:
        log.exception("Moodle: 取得に失敗 (返信案/クロールは継続)")
        return []
    log.info("Moodle: 課題 %d件取得", len(items))
    return items
