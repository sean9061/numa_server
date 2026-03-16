# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow

**コミットはユーザーがテストを行い、明示的に許可した後にのみ行うこと。** 実装完了後はコミットせずに待機する。

## Commands

```bash
npm run dev      # Start development server at localhost:3000
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

**Docker (production):**
```bash
docker compose up          # Run with compose.override.yaml (exposes port 3000)
docker compose -f docker-compose.yaml up  # Production mode (no port exposure)
```

## Architecture

This is a **Next.js 16 portfolio site** using the App Router with React 19, TypeScript, Tailwind CSS v4, and Three.js/React Three Fiber for 3D model rendering.

### Layout

`app/page.tsx` renders a **Bento-grid layout** of card components. All content cards use `BentoCard` (`components/ui/bento-card.tsx`) as a base wrapper — it handles entry animations (Framer Motion fade+slide with staggered delay) and dark mode styling.

### Content Configuration

**All site content lives in `data/config.ts`** as a single `siteConfig` export. This includes personal info, projects, tech stack items, activities, hobbies, and social links. Editing portfolio content means editing this file first.

### Key Components

| Component | Notes |
|-----------|-------|
| `profile-card.tsx` | Hero card — reads from `siteConfig` |
| `tech-stack-card.tsx` | Circular orbit layout with hover physics; uses `react-icons/si` for brand icons |
| `interests-card.tsx` | Expand-on-hover layout using Framer Motion `layout` animations |
| `project-card.tsx` | Supports GLTF 3D models, YouTube embeds, or static images as media |
| `ui/gltf-viewer.tsx` | Three.js 3D model viewer via React Three Fiber; models go in `/public/models/` |

### 3D Models

GLTF models are served from `/public/models/`. `GLTFViewer` uses `OrbitControls` (auto-rotating), `Stage` environment lighting, and `ContactShadows`. Wrap in `<Suspense>` — the component handles its own fallback internally.

### Deployment

`next.config.ts` sets `output: "standalone"` for Docker. The Dockerfile is a multi-stage build producing a minimal production image. The app connects to an external Docker network `proxy_net` (shared reverse proxy) — do not change this network name without coordinating with the proxy setup.
