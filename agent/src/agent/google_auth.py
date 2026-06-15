"""Google OAuth 認証ヘルパー。Gmail / Calendar は読み取り専用スコープのみ。

トークン(リフレッシュトークン入り)は ./data/google_token.json に保存され、
初回認可は scripts/google_auth.py で一度だけ手動実行する。
"""
from __future__ import annotations

import os

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials

from .config import settings

# ★ 読み取り専用のみ。送信/下書き(compose)など書込系スコープは意図的に含めない。
#   ※ Gmailの下書き作成スコープ(gmail.compose)は「送信」権限も不可分に含むため採用しない。
#     返信は下書きを作らず Discord に「返信案」を提示し、ユーザーが手動でGmailに貼り付ける。
GOOGLE_SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar.readonly",
]


def get_credentials() -> Credentials:
    path = settings.google_token_json
    if not os.path.exists(path):
        raise RuntimeError(
            f"Google トークンが見つかりません: {path}. "
            "scripts/google_auth_manual.py で初回認可を実行してください。"
        )
    # ★ scopes を明示せず、トークンに実際に付与されたスコープで読み込む。
    #   こうしないと、コード側のスコープ一覧を増やした瞬間に既存トークンの更新が
    #   invalid_scope で失敗する(gmail.compose 追加前のトークンは readonly のみ等)。
    #   compose を使うには gmail.compose 込みで再認可すること。
    creds = Credentials.from_authorized_user_file(path)
    if not creds.valid:
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            with open(path, "w") as f:
                f.write(creds.to_json())
        else:
            raise RuntimeError("Google トークンが無効です。再認可してください。")
    return creds
