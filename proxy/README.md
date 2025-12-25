# Proxy Service (Nginx Proxy Manager)

Nginx Proxy Managerのコンテナ操作コマンドです。

## 起動・停止

```bash
# フォアグラウンドで起動（ログを見る場合）
docker compose up

# バックグラウンドで起動（推奨）
docker compose up -d

# 停止
docker compose down
```

## ログ確認

```bash
# ログを表示
docker compose logs -f

# 特定のコンテナのログ
docker compose logs -f app
```

## アクセス情報

- **管理画面**: http://localhost:81
- **HTTP**: http://localhost:80
- **HTTPS**: http://localhost:443
