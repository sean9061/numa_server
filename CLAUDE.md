# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow

**コミットはユーザーがテストを行い、明示的に許可した後にのみ行うこと。** 実装完了後はコミットせずに待機する。

## Repository Structure

This is a home server mono-repo managed with Docker Compose and Nginx Proxy Manager.

- `proxy/` — Nginx Proxy Manager (ports 80/443/81)
- `portfolio/` — Next.js 16 portfolio site (see `portfolio/CLAUDE.md` for details)

All services share an external Docker network named `proxy_net`. Do not change this network name without coordinating across all service configs.

## Infrastructure Commands

**Initial setup (first-time only):**
```bash
docker network create proxy_net
```

**Start proxy (must come first):**
```bash
cd proxy && docker compose up -d
```

**Start portfolio:**
```bash
cd portfolio && docker compose up -d          # Production (no host port exposure)
cd portfolio && docker compose up -d          # Dev: compose.override.yaml auto-exposes port 3000
```

**Portfolio development (local, no Docker):**
```bash
cd portfolio
npm run dev      # localhost:3000
npm run build
npm run lint
```

## Deployment Order

When setting up from scratch: create `proxy_net` → start `proxy/` → start each service. The proxy admin UI is at `http://localhost:81` where Proxy Host entries route external traffic to internal containers.
