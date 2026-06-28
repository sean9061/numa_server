"""Moodle SSO 自動ログイン (Phase 1.5)。

学校 Moodle はサイトごと Google SSO ゲートウェイの内側にあり、httpx 等では突破不可。
そこで **永続ブラウザプロファイル**(Playwright/Chromium)で Google セッションを保持し、
毎クロール自動でゲートウェイを通過して新しいセッションを得る。

- 初回のみ `scripts/moodle_login.py` で人間が Google にログイン(MFA含む)→
  プロファイル(`data/moodle_profile`)に永続化。
- 以降は本モジュールが headed(Xvfb仮想ディスプレイ上)で自動通過し iCal を取得。
  ※ 完全 headless は Google のbot検知に弱いため、仮想ディスプレイ上で headed 起動する。
- Google セッションが切れたら `NeedsLogin` を送出 → 上位が Discord で再ログインを促す。

sync Playwright を使うため、呼び出しは必ず別スレッド(asyncio.to_thread 経由)から行うこと。
"""
from __future__ import annotations

import logging
import os
import ssl
import subprocess
import time
from contextlib import contextmanager
from urllib.parse import urlparse

import httpx

from ..config import settings

log = logging.getLogger("agent.tools.moodle_auth")

# Moodle のルート(ゲートウェイ通過判定用)。iCal URL からホストを流用。
_MOODLE_ROOT = "https://service.cloud.teu.ac.jp/moodle_epyc/my/"


class NeedsLogin(RuntimeError):
    """Google セッションが無効。scripts/moodle_login.py での再ログインが必要。"""


def profile_dir() -> str:
    return os.path.join(settings.data_dir, "moodle_profile")


@contextmanager
def virtual_display(display: str = ":99", size: str = "1280x900x24"):
    """Xvfb 仮想ディスプレイを起動し DISPLAY を設定する(headed起動をheadless環境で行う)。"""
    proc = subprocess.Popen(
        ["Xvfb", display, "-screen", "0", size, "-nolisten", "tcp"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    prev = os.environ.get("DISPLAY")
    os.environ["DISPLAY"] = display
    time.sleep(1.5)  # Xvfb 起動待ち
    try:
        yield display
    finally:
        if prev is not None:
            os.environ["DISPLAY"] = prev
        else:
            os.environ.pop("DISPLAY", None)
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()


def _launch_args() -> list[str]:
    # コンテナ(root/no-sandbox)で動かすための定番フラグ + 自動化痕跡の軽減。
    return [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
    ]


def _ssl_context() -> ssl.SSLContext:
    """学校サーバは弱い finite-field DHE(1024bit) も提供し DH_KEY_TOO_SMALL で弾かれる。
    DHE を除外し ECDHE を選ばせる(証明書検証は維持)。Playwright の APIRequest は Node の
    TLS で弱DHを拒否するため、iCal 取得はこの httpx 経路で行う。"""
    ctx = ssl.create_default_context()
    ctx.set_ciphers("DEFAULT:!DHE")
    return ctx


def _harvest_cookies(ical_url: str) -> str:
    """永続プロファイルでブラウザを起動しゲートウェイを通過、iCalホスト向け Cookie を採取。

    Google セッションが無効(ログイン画面に飛ぶ)なら NeedsLogin を送出。
    """
    from playwright.sync_api import sync_playwright

    if not os.path.isdir(profile_dir()):
        raise NeedsLogin("プロファイル未作成。scripts/moodle_login.py で初回ログインが必要")

    host = urlparse(ical_url).hostname or ""
    with virtual_display(), sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            profile_dir(), headless=False, args=_launch_args(),
            viewport={"width": 1280, "height": 900},
        )
        try:
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
            page.goto(_MOODLE_ROOT, wait_until="domcontentloaded", timeout=45000)
            try:
                page.wait_for_load_state("networkidle", timeout=15000)
            except Exception:
                pass
            if "accounts.google.com" in page.url or "login.service" in page.url:
                raise NeedsLogin(f"ログイン画面にリダイレクト(url={page.url[:80]})")
            cookies = ctx.cookies()
        finally:
            ctx.close()

    def _applies(c: dict) -> bool:
        d = (c.get("domain") or "").lstrip(".")
        return bool(d) and (host == d or host.endswith("." + d))

    header = "; ".join(f"{c['name']}={c['value']}" for c in cookies if _applies(c))
    if "auth_tkt" not in header:  # ゲートウェイ通過の証跡が無ければ失効扱い
        raise NeedsLogin("ゲートウェイ Cookie を採取できず(セッション失効の可能性)")
    return header


def fetch_ical_text(ical_url: str) -> str:
    """永続プロファイルでゲートウェイを通過し iCal 本文を返す。

    手順: Chromium でゲートウェイ通過 → Cookie 採取 → その Cookie で httpx(!DHE) から iCal 取得。
    Google セッションが無効なら NeedsLogin を送出。
    """
    cookie_header = _harvest_cookies(ical_url)
    with httpx.Client(
        timeout=httpx.Timeout(30.0), follow_redirects=True, verify=_ssl_context(),
        headers={"Cookie": cookie_header, "User-Agent": "Mozilla/5.0 (compatible; numa-agent/1.0)"},
    ) as client:
        r = client.get(ical_url)
        r.raise_for_status()
        if "BEGIN:VCALENDAR" not in r.text:
            raise NeedsLogin("iCalでないレスポンス(セッション失効の可能性)")
        return r.text
