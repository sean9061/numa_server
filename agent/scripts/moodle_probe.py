"""Moodle iCal エクスポートURL の診断スクリプト (Phase 1.5)。

MOODLE_ICAL_URL を取得・パースして課題締切が正しく拾えるか確認する。
本番有効化(MOODLE_ENABLED=true)の前にこれで確認する。失敗時は生 .ics を
`data/moodle.ics` にダンプし、それを見て tools/moodle.py の _parse_ics を調整する。

実行(docker):
  docker compose run --rm -v "$PWD/scripts:/app/scripts" agent \
    python /app/scripts/moodle_probe.py
"""
import sys

from agent.config import settings
from agent.tools import moodle


def main() -> int:
    url = settings.moodle_ical_url
    if not url:
        print("✗ MOODLE_ICAL_URL が未設定。Moodle→カレンダー→エクスポートでURLを取得して .env に設定してください。")
        return 1
    if not settings.moodle_cookie:
        print("✗ MOODLE_COOKIE が未設定。ブラウザのCookieヘッダ文字列を .env に設定してください。")
        return 1
    print(f"→ iCal取得: {url[:80]}…  (Cookie {len(settings.moodle_cookie)}文字)")

    try:
        with moodle.make_client() as client:
            r = client.get(url)
            r.raise_for_status()
            raw = r.text
    except Exception as e:
        print(f"✗ 取得失敗: {e}")
        return 1

    if "BEGIN:VCALENDAR" not in raw:
        _dump(raw)
        host = "accounts.google.com" if "accounts.google.com" in raw else "?"
        print(f"✗ iCal ではないレスポンス(リダイレクト先らしき: {host})。data/moodle.ics にダンプしました。")
        print("  → MOODLE_COOKIE が失効/不足しています。ブラウザで再ログインしCookieを取り直してください。")
        return 1

    items = moodle._parse_ics(raw)
    print(f"\n  パース結果: {len(items)} 件(将来の締切のみ)")
    for it in items:
        print(f"   - [{it['due'] or '締切?'}] {it['title']}"
              + (f"  ({it['course']})" if it.get("course") else "")
              + f"  <{it['source']}>")
    if not items:
        _dump(raw)
        print("\n  0件。data/moodle.ics に生データをダンプしました。VEVENT の有無/形式を確認してください。")
        return 1
    print("\n✓ 診断OK。MOODLE_ENABLED=true で本番クロールに組み込めます。")
    return 0


def _dump(text: str) -> None:
    path = f"{settings.data_dir}/moodle.ics"
    try:
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)
    except Exception as e:
        print(f"  (ダンプ失敗 {path}: {e})")


if __name__ == "__main__":
    sys.exit(main())
