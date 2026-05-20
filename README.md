# Luma IQ

AI SaaS для экспертов, маркетологов и продюсеров. Сервис помогает собрать стратегию проекта, проработать ЦА, УТП, продуктовую линейку и создавать контент на основе контекста проекта.

## Текущее состояние

- Production frontend: `https://www.lumaiq.ru`
- Production API: `https://api.lumaiq.ru`
- Backend: Hetzner VPS, PM2 process `lumaiq-backend`
- Frontend deploy: Vercel after push to `main`
- Backend deploy: SSH to `/app`, pull `main`, migrate, build, restart PM2

## Stack

- Frontend: React 18, TypeScript, Vite, CSS Modules, Zustand
- Backend: Node.js, Express, TypeScript
- DB: PostgreSQL
- ORM: Prisma 7
- Auth: JWT access/refresh
- AI: OpenAI + Anthropic
- Process manager: PM2

## Main Modules

- Strategy: About Expert, Positioning, Audience, UTP, Social profiles
- Product Builder: Main Product, Mini Product, Lead Magnet
- Content: Posts, Reels, Articles, Video Scripts, Chatbot Chains, Content Plan
- AI Dialog: project-aware AI marketing assistant
- Admin: users, manual access, subscriptions/payments, AI usage analytics
- AI Economy: usage tracking, model pricing, cost accounting
- AI Orchestration Foundation: prompt registry, project context builder, workflow runs/steps/artifacts

## Backend AI

Legacy endpoint remains active:

```text
POST /api/v1/ai/chat
```

New workflow foundation:

```text
GET  /api/v1/ai/workflows/prompts
POST /api/v1/ai/workflows/:workflow/start
POST /api/v1/ai/workflows/:workflow/step
```

Current workflow prompt configs:

- `posts.topic.generate`
- `posts.post.write`
- `reels.hooks.generate`
- `reels.script.write`
- `articles.topic.generate`
- `articles.article.write`

## Local Start

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

```bash
cd frontend
npm install
npm run dev
```

Local URLs:

- Frontend: `http://localhost:5174`
- Backend API: `http://localhost:3001/api/v1`

## Checks

```bash
cd backend && npm run build
cd frontend && npm run build
```

Production health:

```bash
curl -s -i https://api.lumaiq.ru/api/v1/health
```

## Docs

- `CLAUDE.md` — current project context for AI/code assistants
- `docs/architecture.md` — current architecture
- `docs/PROMPT_STRATEGY.md` — AI roles and prompt strategy
- `docs/PROMPTS_AUDIT.md` — prompt/orchestration audit
- `docs/ROADMAP.md` — current roadmap
