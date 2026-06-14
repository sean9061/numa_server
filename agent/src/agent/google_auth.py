"""Google OAuth 認証ヘルパー。Gmail / Calendar は読み取り専用スコープのみ。

トークン(リフレッシュトークン入り)は ./data/google_token.json に保存され、
初回認可は scripts/google_auth.py で一度だけ手動実行する。
"""
from __future__ import annotations

import os

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials

from .config import settings

# ★ 読み取り専用のみ。送信や書込スコープは意図的に含めない(メール誤送信を構造的に防止)。
GOOGLE_SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar.readonly",
]


def get_credentials() -> Credentials:
    path = settings.google_token_json
    if not os.path.exists(path):
        raise RuntimeError(
            f"Google トークンが見つかりません: {path}. "
            "scripts/google_auth.py で初回認可を実行してください。"
        )
    creds = Credentials.from_authorized_user_file(path, GOOGLE_SCOPES)
    if not creds.valid:
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            with open(path, "w") as f:
                f.write(creds.to_json())
        else:
            raise RuntimeError("Google トークンが無効です。再認可してください。")
    return creds
