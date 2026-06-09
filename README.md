# Luma IQ

AI SaaS для экспертов, маркетологов и продюсеров. Сервис помогает собрать стратегию проекта, проработать ЦА, УТП, продуктовую линейку и создавать контент на основе контекста проекта.

## Текущее состояние

- Production frontend: `https://www.lumaiq.ru`
- Production API: `https://api.lumaiq.ru`
- Backend: Hetzner VPS, PM2 process `lumaiq-backend`
- Frontend deploy: Vercel production deploy from repo root with `npx vercel --prod --yes`
- Backend deploy: SSH to `/app`, pull `main`, migrate, generate Prisma client, build, restart PM2

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
- Content: Posts, Reels, Articles, Video Scripts, Chatbot Chains, Threads ИИ, Content Plan
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

- `ai.dialog.message`
- `posts.topic.generate`
- `posts.post.write`
- `reels.hooks.generate`
- `reels.script.write`
- `articles.topic.generate`
- `articles.article.write`
- `chatbot.chain.generate`
- `video.topic.generate`
- `video.script.write`
- `product.main.generate`
- `product.mini.generate`
- `leadmagnet.generate`
- `positioning.analysis.generate`
- `positioning.models.generate`
- `positioning.variants.generate`
- `positioning.gap-analysis.generate`
- `positioning.final.generate`
- `positioning.score.generate`
- `positioning.assets.generate`
- `strategy.audience.generate`
- `strategy.utp.generate`
- `strategy.social.generate`
- `strategy.positioning.generate`
- `threads.plan.generate`
- `threads.post.regenerate`

## Threads ИИ

`/threads` is a specialized content section for Threads.

- Generates a fixed 7-day plan plus ready posts/threads.
- Uses active project strategy, audience/JTBD, UTP, products and previous content context.
- Uses backend workflow API, not frontend prompt assembly.
- Full plan generation and single-post regeneration are counted through the shared AI economy as feature `threads`.
- Saved separately as `GeneratedText.type = THREADS`; it does not overwrite universal Content Plan items.

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
