# Numa Server

Home server infrastructure managed with Docker Compose and Nginx Proxy Manager.

## ディレクトリ構成

- `proxy/`: Nginx Proxy Manager (ポート80/443/81)
- `portfolio/`: メインのポートフォリオサイト (Next.js)

## デプロイ手順 (Deployment Order)

初回構築時は、以下の順番でコマンドを実行してください。

### 1. Dockerネットワークの作成

全てのコンテナが通信するための共有ネットワークを作成します。

```bash
docker network create proxy_net
```

### 2. プロキシサーバーの起動

まずNginx Proxy Managerを立ち上げます。これによりポート80/443がリッスンされます。

```bash
cd proxy
docker compose up -d
```

- 管理画面: http://localhost:81
- 初期設定後に各サービスのProxy Host設定を行ってください。

### 3. 各サービスの起動

**Portfolio:**

```bash
cd portfolio
docker compose up -d
```

## 開発環境 (Development)

Portfolioをローカルで開発する場合（Proxy経由ではなく直接アクセスしたい場合）：

```bash
cd portfolio
# compose.override.yaml が読み込まれ、ポート3000がホストに公開されます
docker compose up -d
```

- アクセス: http://localhost:3000
