"""Google OAuth 手動(コピペ)認可。ローカルサーバーへの戻りリダイレクトが届かない環境用。

2ステップ:
  1) python scripts/google_auth_manual.py url
       認可URLを表示し、PKCE verifier を data/.oauth_verifier に保存する。
       表示URLをブラウザで開いて許可 → http://localhost:8765/?...&code=... にリダイレクトされる。
       (ページが「動作していません」でもOK。アドレスバーのURLをコピーする)
  2) python scripts/google_auth_manual.py token "<コピーしたURL もしくは code 値>"
       コードをトークンに交換し data/google_token.json を保存する。
"""
import sys
from urllib.parse import parse_qs, urlparse

from google_auth_oauthlib.flow import Flow

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar.readonly",
]
CLIENT = "data/google_client.json"
REDIRECT = "http://localhost:8765/"
VERIFIER = "data/.oauth_verifier"
TOKEN_OUT = "data/google_token.json"


def cmd_url() -> None:
    flow = Flow.from_client_secrets_file(
        CLIENT, SCOPES, redirect_uri=REDIRECT, autogenerate_code_verifier=True
    )
    auth_url, _ = flow.authorization_url(access_type="offline", prompt="consent")
    with open(VERIFIER, "w") as f:
        f.write(flow.code_verifier or "")
    print(auth_url)


def cmd_token(arg: str) -> None:
    code = parse_qs(urlparse(arg).query)["code"][0] if arg.startswith("http") else arg
    with open(VERIFIER) as f:
        verifier = f.read().strip() or None
    flow = Flow.from_client_secrets_file(CLIENT, SCOPES, redirect_uri=REDIRECT)
    flow.code_verifier = verifier
    flow.fetch_token(code=code)
    with open(TOKEN_OUT, "w") as f:
        f.write(flow.credentials.to_json())
    print(f"✅ トークンを保存しました: {TOKEN_OUT}")


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "url":
        cmd_url()
    elif len(sys.argv) >= 3 and sys.argv[1] == "token":
        cmd_token(sys.argv[2])
    else:
        print("usage: google_auth_manual.py url | token <url-or-code>")
        sys.exit(1)
