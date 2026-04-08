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
└── ollama_server/  — Ollama (LLM) + Open WebUI
```

## Docker Networks

2つの外部ネットワークを手動作成する必要がある:

| ネットワーク | 接続サービス |
|---|---|
| `proxy_net` | Nginx Proxy Manager, Portfolio, Open WebUI |
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

## Infrastructure Commands

**初回セットアップ:**
```bash
docker network create proxy_net
docker network create ollama_net
```

**起動順序 (初回): proxy → ollama_server → portfolio**
```bash
cd proxy          && cp .env.example .env && docker compose up -d
cd ollama_server  && cp .env.example .env && docker compose up -d
cd portfolio      && docker compose up -d
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
