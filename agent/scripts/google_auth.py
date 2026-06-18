"""Google OAuth 初回認可スクリプト(一度だけ手動実行)。

ブラウザが使えるマシンで実行し、生成された token.json を agent/data/ に置く。
ヘッドレスなサーバーで実行する場合は SSH ポートフォワードを使う:
    ssh -L 8765:localhost:8765 <server>
そのうえでサーバー側で本スクリプトを実行 → 手元のブラウザで http://localhost:8765 を開く。

使い方:
    python scripts/google_auth.py [client_json] [token_out]
    既定: data/google_client.json -> data/google_token.json
"""
import sys

from google_auth_oauthlib.flow import InstalledAppFlow

# agent/google_auth.py の GOOGLE_SCOPES と一致させること(読み取り専用のみ)
SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar.readonly",
]


def main() -> None:
    client_json = sys.argv[1] if len(sys.argv) > 1 else "data/google_client.json"
    token_out = sys.argv[2] if len(sys.argv) > 2 else "data/google_token.json"

    flow = InstalledAppFlow.from_client_secrets_file(client_json, SCOPES)
    creds = flow.run_local_server(port=8765, open_browser=False)
    with open(token_out, "w") as f:
        f.write(creds.to_json())
    print(f"✅ トークンを保存しました: {token_out}")


if __name__ == "__main__":
    main()
