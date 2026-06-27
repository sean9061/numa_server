"""Moodle 取得の診断スクリプト (Phase 1.5)。

永続プロファイル(初回ログイン済み)で iCal を取得・パースし、課題締切が拾えるか確認する。
本番有効化(MOODLE_ENABLED=true)の前にこれで確認する。

実行(docker):
  docker compose run --rm -v "$PWD/scripts:/app/scripts" agent \
    python /app/scripts/moodle_probe.py
"""
import os
import sys

from agent.config import settings
from agent.tools import moodle, moodle_auth


def main() -> int:
    if not settings.moodle_ical_url:
        print("✗ MOODLE_ICAL_URL が未設定です。.env に設定してください。")
        return 1
    if not os.path.isdir(moodle_auth.profile_dir()):
        print("✗ プロファイル未作成。先に scripts/moodle_login.py で初回ログインしてください。")
        return 1
    print("→ Playwright でゲートウェイ通過 → iCal取得 ...")

    try:
        items = moodle.fetch_ical()
    except moodle_auth.NeedsLogin as e:
        print(f"✗ 再ログインが必要です: {e}")
        print("  → scripts/moodle_login.py を実行してください。")
        return 1
    except Exception as e:
        print(f"✗ 取得失敗: {e}")
        return 1

    print(f"\n  パース結果: {len(items)} 件(将来の締切のみ・「開始」除外後)")
    for it in items:
        print(f"   - [{it['due'] or '締切?'}] {it['title']}"
              + (f"  ({it['course']})" if it.get("course") else "")
              + f"  <{it['source']}>")
    if not items:
        print("\n  0件。期間内に締切が無いか、フィルタが強すぎる可能性。")
        return 1
    print("\n✓ 診断OK。MOODLE_ENABLED=true で本番クロールに組み込めます。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
