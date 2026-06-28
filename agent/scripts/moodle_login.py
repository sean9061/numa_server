"""Moodle 初回ログイン (Phase 1.5)。

Google SSO に**人間が一度だけ**ログインし、その Google セッションを永続プロファイル
(`data/moodle_profile`)に保存する。以降はエージェントが headless で自動更新する。

サーバー(ヘッドレス)上で実行し、VNC でブラウザを操作する。ログインも本番クロールも
同じサーバーIPになるため Google に怪しまれにくい。

実行(VNCポートを公開して起動):
  cd agent
  docker compose run --rm -p 5900:5900 -v "$PWD/scripts:/app/scripts" \
    agent python /app/scripts/moodle_login.py

→ コンソールに出る案内に従い、VNCビューアで <サーバーのTailscale IP>:5900 に接続
  (パスワードは起動時に表示)。開いた Chromium で Google にログイン(MFAもここで)。
  Moodle のダッシュボードが表示されたら自動で保存して終了する(最大15分待機)。
"""
import os
import subprocess
import sys
import time

from agent.config import settings
from agent.tools import moodle_auth

VNC_PORT = 5900
VNC_PASSWORD = "numamoodle"  # 一時的・VNCはTailscale経由のみ想定。終了後はポートも閉じる。
LOGIN_TIMEOUT_SEC = 15 * 60


def main() -> int:
    if not settings.moodle_ical_url:
        print("✗ MOODLE_ICAL_URL が未設定です。先に .env に設定してください。")
        return 1
    os.makedirs(settings.data_dir, exist_ok=True)

    # 1) 仮想ディスプレイ + VNC を起動
    with moodle_auth.virtual_display(size="1280x900x24"):
        vnc = subprocess.Popen(
            ["x11vnc", "-display", ":99", "-forever", "-shared",
             "-passwd", VNC_PASSWORD, "-rfbport", str(VNC_PORT), "-quiet", "-noxdamage"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        try:
            print("=" * 60)
            print(f"VNCビューアで  <サーバーのTailscale IP>:{VNC_PORT}  に接続してください")
            print(f"VNCパスワード: {VNC_PASSWORD}")
            print("開いた Chromium で Google にログイン(MFAもここで突破)。")
            print("Moodleのダッシュボードが出たら自動保存して終了します。")
            print("=" * 60)
            return _drive_login()
        finally:
            vnc.terminate()


def _drive_login() -> int:
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            moodle_auth.profile_dir(), headless=False, args=moodle_auth._launch_args(),
            viewport={"width": 1280, "height": 900},
        )
        try:
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
            page.goto(moodle_auth._MOODLE_ROOT, wait_until="domcontentloaded", timeout=45000)
            print("→ ログイン待機中... (最大15分)")
            deadline = time.time() + LOGIN_TIMEOUT_SEC
            stable = 0
            while time.time() < deadline:
                # ゲートウェイ通過の証跡(auth_tkt)が出たらログイン成功とみなす(URLだけより確実)
                has_gw = any(c.get("name") == "auth_tkt" for c in ctx.cookies())
                stable = stable + 2 if has_gw else 0
                if stable >= 6:  # auth_tkt が6秒以上安定=成功
                    print("✓ ログイン成功(ゲートウェイCookie取得)。プロファイルを保存して終了します。")
                    return 0
                time.sleep(2)
            print("✗ タイムアウト。ログインが完了しませんでした。")
            return 1
        finally:
            ctx.close()  # 永続プロファイルはここで保存される


if __name__ == "__main__":
    sys.exit(main())
