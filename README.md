# Numa Server

自宅サーバーのインフラ構成。Docker Compose と Nginx Proxy Manager で管理。

---

## 構成概要 (Architecture Overview)

```
Internet
   │
   ▼ Port 80/443
┌─────────────────────────────┐
│   Nginx Proxy Manager       │  ← リバースプロキシ・SSL終端
│   (proxy/compose.yaml)      │
│   Admin UI: Port 81         │
└────────────┬────────────────┘
             │ proxy_net (Docker外部ネットワーク)
             ▼
┌─────────────────────────────┐
│   Portfolio (Next.js)       │  ← ポートフォリオサイト
│   Internal: Port 3000       │
│   (portfolio/compose.yaml)  │
└─────────────────────────────┘
```

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
- `proxy_net` (外部): 他サービスへのトラフィックルーティング

### 2. Portfolio (`portfolio/`)

| 項目 | 内容 |
|------|------|
| フレームワーク | Next.js 16 (App Router) + React 19 + TypeScript |
| ビルド方式 | Multi-stage Docker build → standalone output |
| ベースイメージ | `node:20-alpine` |
| 実行ユーザー | `nextjs` (UID: 1001, 非rootユーザー) |
| 内部ポート | 3000 (本番環境ではホストに非公開) |
| ネットワーク | `proxy_net` |

---

## ネットワーク構成 (Network)

| ネットワーク | 種別 | 接続サービス | 用途 |
|---|---|---|---|
| `proxy_net` | 外部 (手動作成) | Nginx Proxy Manager, Portfolio | サービス間通信・プロキシルーティング |
| `default` | 内部ブリッジ (自動) | Nginx app ↔ MariaDB | DBアクセス専用 |

**ポート一覧:**

| サービス | コンテナポート | ホストポート | プロトコル | 用途 |
|---|---|---|---|---|
| Nginx Proxy Manager | 80 | 80 | HTTP | 公開Webトラフィック |
| Nginx Proxy Manager | 443 | 443 | HTTPS | 暗号化トラフィック |
| Nginx Proxy Manager | 81 | 81 | HTTP | 管理パネル |
| MariaDB | 3306 | 非公開 | MySQL | DB内部通信 |
| Portfolio | 3000 | 非公開 (本番) / 3000 (開発) | HTTP | Next.jsアプリ |

---

## ディレクトリ構成 (Directory Structure)

```
numa_server/
├── proxy/                    # Nginx Proxy Manager
│   ├── compose.yaml
│   ├── .env                  # DBパスワード (gitignore推奨)
│   ├── .env.example
│   ├── data/                 # Nginx設定・ログ・SSL証明書
│   ├── letsencrypt/          # Let's Encrypt証明書
│   └── mysql/                # MariaDBデータ
├── portfolio/                # Next.jsポートフォリオ
│   ├── compose.yaml          # 本番設定
│   ├── compose.override.yaml # 開発用 (Port 3000をホスト公開)
│   ├── Dockerfile            # Multi-stageビルド
│   ├── next.config.ts        # standalone output設定
│   ├── data/config.ts        # サイトコンテンツ (単一の設定ファイル)
│   ├── app/                  # Next.js App Router
│   ├── components/           # Reactコンポーネント
│   └── public/               # 静的アセット (画像・3Dモデル・動画)
├── architecture.svg          # 構成図
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
| フロントエンド | Next.js 16, React 19, TypeScript |
| スタイリング | Tailwind CSS v4 |
| 3Dグラフィクス | Three.js, React Three Fiber |
| アニメーション | Framer Motion |
| ランタイム | Node.js 20 (Alpine) |

---

## 初期セットアップ (Initial Setup)

```bash
# 1. 共有Dockerネットワークを作成 (初回のみ)
docker network create proxy_net

# 2. プロキシを起動 (最初に起動必須)
cd proxy
cp .env.example .env   # パスワードを編集すること
docker compose up -d

# 3. 管理UIでProxy Hostを設定
# http://localhost:81

# 4. ポートフォリオを起動
cd ../portfolio
docker compose up -d
```

---

## 開発環境 (Development)

```bash
# ローカル開発 (Docker不使用)
cd portfolio
npm run dev      # localhost:3000

# Docker開発 (compose.override.yaml が自動適用されPort 3000を公開)
cd portfolio
docker compose up -d
```

**Portfolioのコマンド:**
```bash
npm run dev      # 開発サーバー起動
npm run build    # 本番ビルド
npm run start    # 本番サーバー起動
npm run lint     # ESLint実行
```

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
5. このREADMEのサービス一覧・ポート表に追記

---

## トラフィックフロー (Traffic Flow)

```
外部リクエスト (example.com)
         │
         ▼ Port 80/443
  Nginx Proxy Manager
  (ドメイン名でルーティング判定)
         │
         ▼ proxy_net
  対象サービスコンテナ (例: portfolio:3000)
         │
         ▼
  アプリケーション処理・レスポンス
```
