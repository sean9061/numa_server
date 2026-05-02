# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow

**コミットはユーザーがテストを行い、明示的に許可した後にのみ行うこと。** 実装完了後はコミットせずに待機する。

## Repository Structure

自宅サーバーのモノレポ。Docker Compose + Nginx Proxy Manager で管理。

```
numa_server/
├── proxy/          — Nginx Proxy Manager + MariaDB (ports 80/443/81)
├── portfolio/      — Next.js 16 ポートフォリオ (see portfolio/CLAUDE.md)
├── ollama_server/  — Ollama (LLM) + Open WebUI
└── dashboard/      — サーバー監視ダッシュボード (Node.js + WebSocket)
```

## Docker Networks

2つの外部ネットワークを手動作成する必要がある:

| ネットワーク | 接続サービス |
|---|---|
| `proxy_net` | Nginx Proxy Manager, Portfolio, Open WebUI, Dashboard |
| `ollama_net` | Nginx Proxy Manager, Ollama, Open WebUI |

**ネットワーク名は変更禁止。** 全サービスの `compose.yaml` に影響する。

## Services

### `proxy/` — Nginx Proxy Manager
- ホストポート: 80 (HTTP), 443 (HTTPS), 81 (管理UI・LAN内のみ)
- DBパスワードは `proxy/.env` で管理
- `proxy_net` + `ollama_net` に接続 (両方のサービスへトラフィックをルーティング)

### `ollama_server/` — Ollama + Open WebUI
- **Ollama**: GPU (GTX 1660 Super) 使用、`ollama_net` のみ接続、ホストポート非公開
- **Open WebUI**: `ollama_net` (Ollamaへ) + `proxy_net` (NPMから) に接続
- ドメイン: `chat.s3an.dev` (WebUI) / `ollama.s3an.dev` (API・Bearer認証)
- シークレットは `ollama_server/.env` で管理

### `portfolio/` — Next.js 16
- ホストポート非公開 (本番) / 3000 (開発: `compose.override.yaml` が自動適用)
- `proxy_net` のみ接続 (`ollama_net` へは到達不可 — 意図的な分離)
- ドメイン: `s3an.dev`

### `dashboard/` — サーバー監視ダッシュボード
- Node.js (Express + WebSocket) + vanilla JS フロントエンド
- `proxy_net` のみ接続、ホストポート非公開
- **2パネル構成:**
  - **SERVER:** CPU / GPU / RAM / Network / Disk（ドーナツ内訳 + I/Oラインチャート）/ Load / Power（CPU+GPU+DRAM合計・内訳）
  - **SERVICES:** カードグリッド表示（CPU/MEM/Disk棒グラフ）・start/stop/restart操作・ログドロワー・ポートフォリオのみWebアクセス数(req/min・1hr合計)表示
- メトリクス収集: `/proc/*`、`nvidia-smi`、Intel RAPL（CPU+DRAM電力）、`dockerode`
- WebSocket でリアルタイム配信 (metrics: 2秒、docker/container_stats: 5秒)
- メトリクス履歴は `dashboard/data/` に永続化（最大1時間分）
- シークレット: `dashboard/.env` (`DASHBOARD_PASSWORD`, `JWT_SECRET`, `PORTFOLIO_LOG`)
  - `PORTFOLIO_LOG`: NPMログファイル名の一部（例: `proxy-host-2`）を指定してポートフォリオのアクセスログのみ集計。未設定時は全NPMアクセスログを合算
- コンテナ操作API: `POST /api/containers/:name/{start,stop,restart}`（認証済みのみ）
- **コード変更後は要リビルド:** `docker compose build && docker compose up -d`
- フロント変更時は `public/index.html` の `app.js?v=N` の `N` をインクリメントしてキャッシュバスト
- `SERVICE_LINKS` (app.js) にコンテナ名→URLのマッピングをハードコード

## Infrastructure Commands

**初回セットアップ:**
```bash
docker network create proxy_net
docker network create ollama_net
```

**起動順序 (初回): proxy → ollama_server → portfolio → dashboard**
```bash
cd proxy          && cp .env.example .env && docker compose up -d
cd ollama_server  && cp .env.example .env && docker compose up -d
cd portfolio      && docker compose up -d
cd dashboard      && cp .env.example .env && docker compose up -d
```

**Portfolio 開発 (ローカル):**
```bash
cd portfolio
npm run dev      # localhost:3000
npm run build
npm run lint
```

**Ollama モデル管理:**
```bash
docker exec -it ollama ollama pull <model>
docker exec -it ollama ollama list
```

## Adding a New Service

1. ディレクトリを作成し `compose.yaml` を追加
2. `proxy_net` に接続 (外部公開が必要なサービス)
3. ホストポートは公開せず、NPMでルーティング
4. NPM管理UI (http://localhost:81) で Proxy Host を追加
5. `README.md` のサービス一覧・ポート表に追記
