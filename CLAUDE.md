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
├── dashboard/      — サーバー監視ダッシュボード (Node.js + WebSocket)
├── agent/          — ローカルLLM自律エージェント (Python + LangGraph, see agent/ROADMAP.md)
└── searxng/        — メタ検索 (agent の Web リサーチ用・内部専用)
```

## Docker Networks

2つの外部ネットワークを手動作成する必要がある:

| ネットワーク | 接続サービス |
|---|---|
| `proxy_net` | Nginx Proxy Manager, Portfolio, Open WebUI, Dashboard |
| `ollama_net` | Nginx Proxy Manager, Ollama, Open WebUI, Agent, SearXNG |

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
- **バックエンド:** Node.js (Express + WebSocket) — `dashboard/src/`
- **フロントエンド:** Vite + React + TypeScript — `dashboard/frontend/src/`
  - Recharts (チャート)、Zustand (状態管理)、Tailwind CSS v4
- `proxy_net` 接続。ホストは `127.0.0.1:8088` のみ公開
- **アクセスは Tailscale 限定** (docker.sock を握る管理ツールのためインターネット非公開)。`tailscale serve --https=443 http://127.0.0.1:8088` で `https://<your-machine>.<your-tailnet>.ts.net/` に配信。NPM の公開ホスト (旧 `dash.s3an.dev`) は無効化済み
- **3パネル構成:**
  - **SERVER:** CPU / GPU / RAM / Network / Disk（ドーナツ内訳 + I/Oラインチャート）/ Load / Power（CPU+GPU+DRAM合計・内訳）
  - **SERVICES:** ネットワークトポロジーのフロー図 (`FlowDiagram.tsx`) — NPM・各コンテナ・Ollama を接続線で表示。各ノードに CPU/MEM/Disk バーグラフ・start/stop/restart 操作・ログドロワー・Web アクセス数（portfolio のみ）を表示
  - **HOME:** SwitchBot 機器の監視 (#46)。`home.js` が SwitchBot Cloud API (v1.1) を `HOME_POLL_SECONDS` 間隔(既定90s)でポーリング→正規化→WS配信。deviceType を kind (climate/plug/light/lock/bot/keypad/generic) に分類し `tiles/home/` の対応タイルで描画(未知タイプは汎用タイルで自動表示)。**将来構想: 家の3Dマップ上に機器ステータスをオーバーレイ (#46 フェーズ2・素材待ち)**
- メトリクス収集: `/proc/*`、`nvidia-smi`、Intel RAPL（CPU+DRAM電力）、`dockerode`
- WebSocket でリアルタイム配信 (metrics: 2秒、docker/container_stats: 5秒)
- メトリクス履歴は `dashboard/data/` に2重に永続化:
  - **リングバッファ:** `metrics_history.json`（シャットダウン時 + 60秒毎に保存・最大1時間分）
  - **全履歴:** 日付別 JSONL ファイル `metrics_YYYY-MM-DD.jsonl`（毎エントリ追記・無制限）
- HOME(SwitchBot)履歴も同方式で `home_history.json`(リング) + `home_YYYY-MM-DD.jsonl`(全履歴) に永続化 (`home-history.js`)
- 認証: JWT クッキー (`COOKIE_NAME`) + `/auth` エンドポイント。未認証アクセスは `/login.html` にリダイレクト。ログイン試行は 15分に15回のレートリミット
- シークレット: `dashboard/.env` (`DASHBOARD_PASSWORD`, `JWT_SECRET`, `PORTFOLIO_LOG`, `SWITCHBOT_TOKEN`, `SWITCHBOT_SECRET`)
  - `PORTFOLIO_LOG`: NPMログファイル名の一部（例: `proxy-host-2`）を指定してポートフォリオのアクセスログのみ集計。未設定時は全NPMアクセスログを合算
  - `SWITCHBOT_TOKEN`/`SWITCHBOT_SECRET`: SwitchBot Cloud API 認証 (アプリ→プロフィール→設定→開発者向けオプション)。未設定なら HOME パネルは無効。Cloud API は **10,000 req/日**上限のため `HOME_POLL_SECONDS`(既定90s)で調整 (コスト = 機器数 × 86400 ÷ 間隔)
- REST API（認証済みのみ）:
  - `GET /api/history?from=<ms>&to=<ms>&buckets=<n>` — 全履歴から指定期間を bucket 集計して返す
  - `GET /api/metrics` — 現在のメトリクスを返す
  - `GET /api/home` — SwitchBot 現在状態 / `GET /api/home/history?from&to&buckets` — 家センサー履歴
  - `GET /api/containers` — コンテナ一覧
  - `POST /api/containers/:name/{start,stop,restart}` — コンテナ操作
- **コード変更後は要リビルド:** `docker compose build && docker compose up -d`
- `SERVICE_LINKS` (`frontend/src/constants.ts`) にコンテナ名→URLのマッピングをハードコード
- **ローカル開発 (フロントエンドのみ — Mac/Linux):**
  ```bash
  cd dashboard/frontend && npm run dev   # Vite dev server — localhost:5173
  ```

### `agent/` — ローカルLLM自律エージェント (Python + LangGraph)
- Gmail(読取専用)+Calendar+Moodle(課題締切)→LLM突合→Notion にタスク反映、メール返信案の提示(読取専用)を行う。**真実の源は `agent/ROADMAP.md`**、進捗は issue #59。
- `ollama_net` のみ接続 (Ollama 到達 + 外部API egress)。ホストポート非公開。Docker socket/ホストFSは非マウント。
- 通知・HITL承認は **Discord**。状態は `AsyncSqliteSaver`(`data/checkpoints.sqlite`)。
- クロールは `CRAWL_HOURS` の時刻指定(cron, 既定 1日7回)。`ORCHESTRATOR_ENABLED` で「計画→逐次実行→統合」のマネージャ・オーケストレータ、`WEB_RESEARCH_ENABLED` で SearXNG 経由の Web リサーチを有効化 (#62)。
- **Moodle(Phase 1.5)**: サイトが Google SSO ゲートウェイ内のため Playwright の永続プロファイル(`data/moodle_profile`)で自動ログインし iCal から課題締切を取得(`MOODLE_ENABLED`)。初回のみ `scripts/moodle_login.py`(VNC)で人手ログイン、以降は自動。失効時は Discord に再ログイン通知。イメージに Chromium 同梱。
- **LangGraph Studio (#72)**: `studio` サービス(agentと同イメージ)が `langgraph dev` を `127.0.0.1:2024` で常設(`restart: always`)。`tailscale serve --bg --https=8444 http://127.0.0.1:2024` で tailnet 限定配信し、`https://smith.langchain.com/studio/?baseUrl=https://<machine>.<tailnet>.ts.net:8444` でグラフ(task/orchestrator/draft)を可視化。`docker compose up -d` で agent と共に起動。グラフ定義は `src/agent/studio.py` + `langgraph.json`。
- シークレットは `agent/.env`(chmod 600) と `data/` のトークンのみ。**コード変更後は要リビルド:** `docker compose build && docker compose up -d`

### `searxng/` — メタ検索 (agent の Web リサーチ用)
- agent の `web_research` が叩く JSON 検索API。`ollama_net` のみ接続、**ホストポート非公開・NPM非経由＝内部専用** (agent からのみ到達)。
- `searxng/settings.yml` で JSON出力を有効化。**Google は自ホストインスタンスをブロックするため無効化**し DuckDuckGo/Brave/Startpage 等を使用。単一クライアントのため limiter/bot検知はoff (Valkey不要)。

## Infrastructure Commands

**初回セットアップ:**
```bash
docker network create proxy_net
docker network create ollama_net
```

**起動順序 (初回): proxy → ollama_server → portfolio → dashboard → searxng → agent**
```bash
cd proxy          && cp .env.example .env && docker compose up -d
cd ollama_server  && cp .env.example .env && docker compose up -d
cd portfolio      && docker compose up -d
cd dashboard      && cp .env.example .env && docker compose up -d
cd searxng        && docker compose up -d                          # agent の Web リサーチ用 (任意)
cd agent          && cp .env.example .env && docker compose up -d   # ROADMAP.md 参照 (Google/Notion 認可が必要)
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

## Dashboard — Data Flow & Architecture

### Backend pipeline
```
metrics.js (collect every 2s) → history.js (ring buffer, MAX_ENTRIES=1800)
                                         ↓
server.js → WS broadcast:
  { type: 'history', data: ring }    — on client connect (full history)
  { type: 'metrics', data: {...} }   — every 2s
  { type: 'docker',  data: [...] }   — every 5s
```
History persisted to `dashboard/data/metrics_history.json` every 60s and on shutdown.

### Frontend pipeline
```
WebSocket → useStore.ts → tiles → charts (Recharts)
```
- `setHistory(entries)` populates the store on connect; `setMetrics(d)` appends each tick
- `timeWindow` (pts: 60/300/900/1800) controls how many history entries are sliced for the ring buffer view
- **Extended history:** `setExtRange(ms)` fetches `GET /api/history` from the full JSONL store and stores it in `extHistory`/`extRangeMs`. `ms === -1` = all time; `ms > 0` = span in ms; `ms === null` = back to ring buffer
- **`useViewHistory()` hook** (`hooks/useViewHistory.ts`) — returns the correct slice: `extRangeMs != null` → `extHistory`, otherwise `history.slice(-timeWindow)`. All tiles must use this hook
- `downsample(arr, HIST_DISPLAY)` in `utils.ts` aggregates that slice to 60 chart points
  - If slice < 60 pts: left-pad with nulls; if > 60 pts: average-bucket aggregate
  - **Never** use `Math.min(timeWindow, HIST_DISPLAY)` — it breaks time range selection
- **`useSettings`** (`store/useSettings.ts`) — zoom sensitivity settings (wheelLevel, pinchLevel, 1–10) persisted to localStorage under key `numa-panzoom`

### Key constants (`frontend/src/constants.ts`)
- `HIST_DISPLAY = 60` — chart render points (always fixed)
- `MAX_HIST = 1800` — frontend store limit (mirrors backend ring size = 1h at 2s intervals)

### Adding a new tile
1. Create `frontend/src/components/tiles/XxxTile.tsx`
2. Call `useViewHistory()` to get the history slice (handles ring buffer and extended history), then `downsample(slice.map(e => e.<field>), HIST_DISPLAY)`
3. Wire into `frontend/src/components/panels/ServerPanel.tsx` layout + `constants.ts` `TILES` map

## Adding a New Service

1. ディレクトリを作成し `compose.yaml` を追加
2. `proxy_net` に接続 (外部公開が必要なサービス)
3. ホストポートは公開せず、NPMでルーティング
4. NPM管理UI (http://localhost:81) で Proxy Host を追加
5. `README.md` のサービス一覧・ポート表に追記
