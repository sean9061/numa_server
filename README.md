# Numa Server

自宅サーバーのインフラ構成。Docker Compose と Nginx Proxy Manager で管理。

---

## 構成概要 (Architecture Overview)

```
Internet
   │
   ▼ Port 80/443
┌──────────────────────────────────────────────────────┐
│   Nginx Proxy Manager                                │  ← リバースプロキシ・SSL終端
│   Admin UI: Port 81 (LAN内のみ)                     │
└──┬──────────────┬──────────────┬──────────┬──────────┘
   │ proxy_net    │ proxy_net    │ proxy_net│ ollama_net
   ▼              ▼              ▼          ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────────┐
│Portfolio │ │Open WebUI│ │Dashboard │ │ Ollama (API only)  │
│s3an.dev  │ │chat.s3an │ │dash.s3an │ │ ollama.s3an.dev    │
│:3000     │ │:8080     │ │:3000     │ │ :11434             │
└──────────┘ └────┬─────┘ └──────────┘ └────────────────────┘
                  │ ollama_net (内部)              ↑
                  └────────────────────────────────┘
  ※ Portfolio・Dashboard は Ollama に到達不可 (ネットワーク分離)
```

---

## ハードウェア構成

| 項目 | 内容 |
| --- | --- |
| サーバー名 | numa_01 |
| OS | Ubuntu 22.04 LTS |
| CPU | Intel Core i5 12400F |
| GPU | NVIDIA GTX 1660 Super |
| メモリ | 16GB DDR5 |
| マザーボード | MAG Z790 TOMAHAWK MAX WIFI |
| ストレージ (OS) | SATA SSD 512GB |
| ストレージ (Data) | HDD 500GB x4 |
| 電源 | 650W Bronze |

---

## サービス構成 (Services)

### 1. Nginx Proxy Manager (`proxy/`)

| 項目 | 内容 |
|------|------|
| イメージ | `jc21/nginx-proxy-manager:latest` |
| 役割 | リバースプロキシ、SSL/TLS終端、ドメインルーティング |
| ホストポート | 80 (HTTP), 443 (HTTPS), 81 (管理UI) |
| DB | MariaDB (`jc21/mariadb-aria:latest`) — 内部ポート3306のみ |
| データ永続化 | `./data`, `./letsencrypt`, `./mysql` |
| 環境変数 | `proxy/.env` (DBパスワード等) |

**内部ネットワーク構成:**
- `default` ブリッジ: `app` コンテナ ↔ `db` コンテナ間の通信専用
- `proxy_net` + `ollama_net` (外部): 各サービスへのトラフィックルーティング

---

### 2. Open WebUI (`ollama_server/`)

| 項目 | 内容 |
|------|------|
| イメージ | `ghcr.io/open-webui/open-webui:latest` |
| 役割 | Ollama用Web UI (チャット・モデル管理) |
| エンドポイント | `https://chat.s3an.dev` |
| 認証 | Open WebUI内蔵の認証機能 |
| データ永続化 | `./webui-data` (ユーザー・履歴・設定) |
| ネットワーク | `proxy_net` (NPMから) + `ollama_net` (Ollamaへ) |

---

### 3. Ollama (`ollama_server/`)

| 項目 | 内容 |
|------|------|
| イメージ | `ollama/ollama:latest` |
| 役割 | Local LLM サーバー (OpenAI互換API) |
| エンドポイント | `https://ollama.s3an.dev` (外部) / `ollama:11434` (内部) |
| GPU | NVIDIA GTX 1660 Super (VRAM 6GB) |
| 推奨モデル | `qwen2.5:7b`, `llama3.2:3b` (Q4量子化) |
| 認証 | Bearer Token (Nginx カスタム設定で制御) |
| データ永続化 | `./data` (モデルファイル) |
| ネットワーク | `ollama_net` (portfolio等から隔離) |

**セキュリティ構成:**
- HTTPS (Let's Encrypt) by Nginx Proxy Manager
- Bearer Token 認証 (`nginx-custom.conf` をNPMのAdvancedタブに設定)
- Port 11434 はホストに非公開 (`ollama_net` 経由のみ)
- `ollama_net` で分離 — Portfolio等の他コンテナからアクセス不可
- `no-new-privileges` — コンテナ内での権限昇格を禁止
- CORSオリジン: `https://ollama.s3an.dev` のみ許可

**クライアント別接続設定:**

| 用途 | 設定 |
|---|---|
| vibe-local / OpenAI互換ツール | Base URL: `https://ollama.s3an.dev/v1` / API Key: `<your-key>` |
| Discord Bot (サーバー内) | `http://ollama:11434` (ollama_net接続必須, 認証不要) |
| curl テスト | `curl -H "Authorization: Bearer <key>" https://ollama.s3an.dev/api/tags` |

---

### 4. Portfolio (`portfolio/`)

| 項目 | 内容 |
|------|------|
| フレームワーク | Next.js 16 (App Router) + React 19 + TypeScript |
| ビルド方式 | Multi-stage Docker build → standalone output |
| ベースイメージ | `node:20-alpine` |
| 実行ユーザー | `nextjs` (UID: 1001, 非rootユーザー) |
| エンドポイント | `https://s3an.dev` |
| 内部ポート | 3000 (本番環境ではホストに非公開) |
| ネットワーク | `proxy_net` |

---

### 5. Dashboard (`dashboard/`)

| 項目 | 内容 |
|------|------|
| イメージ | `numa-dashboard` (Node.js 20 Alpine, ローカルビルド) |
| 役割 | サーバーリアルタイム監視ダッシュボード |
| エンドポイント | `https://dash.s3an.dev` |
| 認証 | JWT + bcrypt パスワード認証 (httpOnly Cookie) |
| 監視項目 | CPU/GPU/RAM/VRAM・ネットワーク・ディスク・温度・電力・コンテナログ |
| ネットワーク | `proxy_net` |
| 環境変数 | `dashboard/.env` (パスワード・JWTシークレット) |

---

## ネットワーク構成 (Network)

| ネットワーク | 種別 | 接続サービス | 用途 |
|---|---|---|---|
| `proxy_net` | 外部 (手動作成) | Nginx Proxy Manager, Portfolio, Dashboard, Open WebUI | サービス間通信・プロキシルーティング |
| `ollama_net` | 外部 (手動作成) | Nginx Proxy Manager, Ollama, Open WebUI | Ollama専用経路 (Portfolio等から隔離) |
| `default` | 内部ブリッジ (自動) | Nginx app ↔ MariaDB | DBアクセス専用 |

**ポート一覧:**

| サービス | コンテナポート | ホストポート | プロトコル | 用途 |
|---|---|---|---|---|
| Nginx Proxy Manager | 80 | 80 | HTTP | 公開Webトラフィック |
| Nginx Proxy Manager | 443 | 443 | HTTPS | 暗号化トラフィック |
| Nginx Proxy Manager | 81 | 81 | HTTP | 管理パネル |
| MariaDB | 3306 | 非公開 | MySQL | DB内部通信 |
| Portfolio | 3000 | 非公開 (本番) | HTTP | Next.jsアプリ |
| Open WebUI | 8080 | 非公開 | HTTP | Web UI (proxy_net経由) |
| Ollama | 11434 | 非公開 | HTTP | LLM API (ollama_net経由) |
| Dashboard | 3000 | 非公開 (本番) | HTTP | 監視ダッシュボード (proxy_net経由) |

---

## ディレクトリ構成 (Directory Structure)

```
numa_server/
├── proxy/                    # Nginx Proxy Manager
│   ├── compose.yaml
│   ├── .env                  # DBパスワード (gitignore対象)
│   ├── .env.example
│   ├── data/                 # Nginx設定・ログ・SSL証明書
│   ├── letsencrypt/          # Let's Encrypt証明書
│   └── mysql/                # MariaDBデータ
├── portfolio/                # Next.jsポートフォリオ
│   ├── compose.yaml          # 本番設定
│   ├── compose.override.yaml # 開発用 (Port 3000をホスト公開, gitignore対象)
│   ├── Dockerfile
│   ├── next.config.ts        # standalone output設定
│   ├── data/config.ts        # サイトコンテンツ (単一の設定ファイル)
│   ├── app/                  # Next.js App Router
│   ├── components/           # Reactコンポーネント
│   └── public/               # 静的アセット (画像・3Dモデル・動画)
├── ollama_server/            # Ollama + Open WebUI
│   ├── compose.yaml
│   ├── nginx-custom.conf     # NPM Advanced タブ用 (ollama.s3an.dev / Bearer認証)
│   ├── nginx-webui.conf      # NPM Advanced タブ用 (chat.s3an.dev / WebSocket対応)
│   ├── .env                  # APIキー・シークレット (gitignore対象)
│   ├── .env.example
│   ├── data/                 # Ollamaモデルデータ (gitignore対象)
│   └── webui-data/           # Open WebUIデータ (gitignore対象)
├── dashboard/                # サーバー監視ダッシュボード
│   ├── compose.yaml          # 本番設定 (GPU passthrough, pid: host)
│   ├── Dockerfile
│   ├── .env                  # パスワード・JWTシークレット (gitignore対象)
│   ├── .env.example
│   ├── src/                  # Node.js バックエンド
│   │   ├── server.js         # Express + WebSocket サーバー
│   │   ├── auth.js           # JWT認証
│   │   ├── metrics.js        # システムメトリクス収集
│   │   └── docker-monitor.js # Dockerコンテナ監視
│   └── public/               # フロントエンド (HTML/CSS/JS)
├── CLAUDE.md                 # Claude Code向けガイド
└── README.md                 # このファイル
```

---

## 技術スタック (Tech Stack)

| 領域 | 技術 |
|------|------|
| コンテナ管理 | Docker, Docker Compose |
| リバースプロキシ | Nginx Proxy Manager |
| SSL/TLS | Let's Encrypt (Nginx Proxy Manager経由) |
| データベース | MariaDB (Nginx PM用) |
| LLM ランタイム | Ollama (GPU対応) |
| フロントエンド | Next.js 16, React 19, TypeScript |
| スタイリング | Tailwind CSS v4 |
| 3Dグラフィクス | Three.js, React Three Fiber |
| アニメーション | Framer Motion |
| 監視ダッシュボード | Node.js 20, Express, WebSocket, Chart.js |
| ランタイム | Node.js 20 (Alpine) |

---

## 初期セットアップ (Initial Setup)

```bash
# 1. 共有Dockerネットワークを作成 (初回のみ)
docker network create proxy_net
docker network create ollama_net

# 2. プロキシを起動 (最初に起動必須)
cd proxy
cp .env.example .env   # パスワードを編集すること
docker compose up -d

# 3. 管理UIでProxy Hostを設定
# http://localhost:81

# 4. 各サービスを起動
cd ../ollama_server && cp .env.example .env && docker compose up -d
cd ../portfolio    && docker compose up -d
cd ../dashboard    && cp .env.example .env && docker compose up -d --build
```

---

## 開発環境 (Development)

**Portfolio:**
```bash
cd portfolio
npm run dev      # localhost:3000 (Docker不使用)
docker compose up -d  # compose.override.yaml が自動適用されPort 3000を公開
```

**Dashboard:**
```bash
cd dashboard
cp .env.example .env  # DASHBOARD_PASSWORD と JWT_SECRET を設定
docker compose -f compose.dev.yaml up -d --build  # localhost:3000
```

---

## Ollama セットアップ (Ollama Setup)

### 1. ホスト側の前提条件 (初回のみ)

```bash
# NVIDIA Container Toolkit のインストール (Ubuntu)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
  | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
  | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
  | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt update && sudo apt install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

### 2. 起動

```bash
cd ollama_server
cp .env.example .env
openssl rand -hex 32   # → OLLAMA_API_KEY に設定
openssl rand -hex 32   # → WEBUI_SECRET_KEY に設定
docker compose up -d

# モデルのダウンロード (初回)
docker exec -it ollama ollama pull qwen2.5:7b
```

### 3. Nginx Proxy Manager の設定

管理UI (http://localhost:81) で Proxy Host を追加:

**① ollama.s3an.dev**

| 設定 | 値 |
|---|---|
| Forward Hostname / Port | `ollama` / `11434` |
| SSL | Let's Encrypt (Force SSL ON) |
| Advanced | `nginx-custom.conf` の内容を貼り付け (`YOUR_OLLAMA_API_KEY_HERE` を置換) |

**② chat.s3an.dev**

| 設定 | 値 |
|---|---|
| Forward Hostname / Port | `open-webui` / `8080` |
| SSL | Let's Encrypt (Force SSL ON) |
| WebSockets Support | ON |
| Advanced | `nginx-webui.conf` の内容を貼り付け |

---

## Dashboard セットアップ (Dashboard Setup)

### 1. 環境変数の設定

```bash
cd dashboard
cp .env.example .env
# DASHBOARD_PASSWORD: ログインパスワードを設定
# JWT_SECRET: openssl rand -hex 64 で生成した値を設定
```

### 2. 起動 (本番)

```bash
docker compose up -d --build
```

### 3. Nginx Proxy Manager の設定

**dash.s3an.dev**

| 設定 | 値 |
|---|---|
| Forward Hostname / Port | `dashboard` / `3000` |
| SSL | Let's Encrypt (Force SSL ON) |

---

## 新規サービス追加時の手順 (Adding a New Service)

1. サービス用のディレクトリを作成 (`service-name/`)
2. `compose.yaml` を作成し、`proxy_net` に接続する:
   ```yaml
   networks:
     proxy_net:
       external: true
   ```
3. ポートはホストに公開せず、`proxy_net` 経由でNginx Proxy Managerにルーティング
4. 管理UI (http://localhost:81) でProxy Hostエントリを追加
5. このREADMEのサービス一覧・ポート表・ディレクトリ構成に追記

---

## トラフィックフロー (Traffic Flow)

```
外部リクエスト
         │
         ▼ Port 80/443
  Nginx Proxy Manager
  (ドメイン名でルーティング判定)
         │
         ├─── s3an.dev ──────────▶ proxy_net ──▶ portfolio:3000
         │
         ├─── dash.s3an.dev ─────▶ proxy_net ──▶ dashboard:3000
         │                                        (JWT認証)
         ├─── chat.s3an.dev ─────▶ proxy_net ──▶ open-webui:8080 ─▶ ollama:11434
         │                                        (WebUI認証)        (ollama_net内部)
         └─── ollama.s3an.dev ───▶ ollama_net ─▶ ollama:11434
                                   (Bearer認証)
```
