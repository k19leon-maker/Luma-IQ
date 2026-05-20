# Luma IQ — актуальный контекст проекта

Обновлено: 2026-05-20

## Что это

Luma IQ — vertical AI SaaS для экспертов, маркетологов и продюсеров. Сервис помогает пользователю вести проект от базового описания эксперта и позиционирования до ЦА, УТП, продуктовой линейки, лидмагнитов, контента, воронок и AI-диалога.

Главная продуктовая идея: Luma IQ должен ощущаться не как GPT wrapper, а как context-aware AI marketing operating system.

## Production

- Frontend: Vercel
- Frontend domain: `https://www.lumaiq.ru`
- Backend: Hetzner VPS `128.140.111.43`
- API domain: `https://api.lumaiq.ru`
- Server path: `/app/backend`
- PM2 process: `lumaiq-backend`
- GitHub branch: `main`

Backend deploy:

```bash
ssh root@128.140.111.43 "cd /app && git fetch origin main && git reset --hard origin/main && cd backend && npm install && npx prisma migrate deploy && npx prisma generate && npm run build && pm2 restart lumaiq-backend --update-env && pm2 save"
```

Frontend deploys automatically through Vercel after push to `main`.

## Stack

- Frontend: React 18, TypeScript, Vite, CSS Modules
- Backend: Node.js, Express, TypeScript
- DB: PostgreSQL
- ORM: Prisma 7
- Auth: JWT access/refresh
- State: Zustand + localStorage
- AI providers: OpenAI + Anthropic
- Process manager: PM2

Redis/Bull are not active production dependencies right now.

## Main Product Areas

### Strategy

- `/strategy/about` or equivalent About Expert flow: project-scoped expert profile.
- `/strategy/positioning`: starting positioning vector.
- `/strategy/audience`: 13-step ЦА/JTBD flow.
- `/strategy/utp`: offer/UTP.
- `/strategy/social`: social profile packaging.

Important: the service supports many niches. Do not hardcode psychology.

### Product Builder

- `/products/main`
- `/products/mini`
- `/products/lead-magnet`

Product sections use project context, audience, UTP and product/leadmagnet logic.

### Content

- `/posts`: Posts Engine MVP with improved strategic prompts.
- `/reels`: Reels Engine MVP: goal, platform, tone, trigger intensity, 30 hooks, hook selection, facture, script.
- `/articles`: Articles Engine MVP: article type, platform, tone, depth, CTA, 20 topics, facture, article with SEO/meta/FAQ/scoring.
- `/video-scripts`
- `/chatbot-chains`: Telegram chain prompt for direct-response posts.
- `/content-plan`

### AI Dialog

- `/ai-dialog`
- Project-aware AI marketing assistant.
- Uses backend context builder in `backend/src/utils/buildAiDialogContext.ts`.

### Admin

- `/admin`
- Admin only.
- Manual user creation, manual PRO/access, payments, activity, AI usage analytics.
- Payment sources: `MANUAL`, `TRIBUTE`, `YOOKASSA`.

## AI Model Logic

Current intended model split:

- AI dialog: `gpt-5.4`
- Positioning / audience / UTP: `gpt-5.5`
- Main product / mini product / lead magnet: `gpt-5.5`
- Posts / Reels / scripts / content: `gpt-5.4`
- Anthropic is supported for reasoning/heavier tasks and user-selected provider flows.

AI provider calls live in `backend/src/services/ai.service.ts`.

## AI Economy

Implemented foundation:

- `billing_periods`
- `credit_ledger`
- `ai_generations`
- `ai_usage_events`
- `ai_model_pricing`
- `feature_pricing`
- `feature_usage_daily`

Services:

- `billing-period.service.ts`
- `credit-ledger.service.ts`
- `feature-pricing.service.ts`
- `ai-cost.service.ts`
- `access-policy.service.ts`
- `ai-generation.service.ts`

Token usage is captured from OpenAI/Anthropic responses and stored in `ai_generations`.

## AI Orchestration Foundation

Implemented first backend foundation, not yet fully wired to every frontend screen.

New DB tables:

- `ai_workflow_runs`
- `ai_workflow_steps`
- `ai_artifacts`

`ai_generations` links to:

- `workflowRunId`
- `workflowStepId`

New backend services:

- `backend/src/services/project-context.service.ts`
- `backend/src/services/ai-workflow.service.ts`
- `backend/src/services/ai-validation.service.ts`

Prompt registry:

- `backend/src/prompts/registry/types.ts`
- `backend/src/prompts/registry/helpers.ts`
- `backend/src/prompts/registry/content-workflows.ts`
- `backend/src/prompts/registry/index.ts`

New API:

```text
GET  /api/v1/ai/workflows/prompts
POST /api/v1/ai/workflows/:workflow/start
POST /api/v1/ai/workflows/:workflow/step
```

Registered workflow prompts:

- `posts.topic.generate.v1`
- `posts.post.write.v1`
- `reels.hooks.generate.v1`
- `reels.script.write.v1`
- `articles.topic.generate.v1`
- `articles.article.write.v1`

Important: old `/api/v1/ai/chat` remains active. Frontend migration to workflow API should be gradual.

## Prompt Strategy

Canonical doc: `docs/PROMPT_STRATEGY.md`.

Current prompt layers:

- Global behavior prompt: `backend/src/config/system-prompt.ts`
- Legacy dynamic prompts: `backend/src/prompts/dynamic.prompts.ts`
- Workflow prompt registry: `backend/src/prompts/registry/*`

Frontend should not assemble new strategic prompts for new workflows. Frontend should send:

```ts
{
  workflow,
  step,
  projectId,
  inputs
}
```

Backend handles:

- prompt selection;
- context selection;
- model routing;
- validation;
- usage tracking;
- artifact saving.

## Project Context

Current context sources:

- `Project.strategyData`
- About Expert data inside `strategyData`
- `Project.utpData`
- `AudienceAvatar`
- `JTBDSession`
- `Product`
- `GeneratedText`
- content plan and project materials where available

New `project-context.service.ts` supports:

- selective injection;
- priority blocks;
- lightweight summaries;
- token budgeting.

Do not pass the whole project blindly into every AI call.

## Important DB Entities

Core:

- `User`
- `Project`
- `JTBDSession`
- `AudienceAvatar`
- `Product`
- `GeneratedText`
- `ContentPlanItem`
- `Subscription`
- `Payment`
- `UserEvent`

AI:

- `AIRequestLog`
- `AIGeneration`
- `AIUsageEvent`
- `AIModelPricing`
- `FeaturePricing`
- `BillingPeriod`
- `CreditLedgerEntry`
- `FeatureUsageDaily`
- `AIWorkflowRun`
- `AIWorkflowStep`
- `AIArtifact`

## Access And Payments

Current mode: pilot/manual access.

- Production registration can be disabled through env.
- Users can be created manually by admin.
- PRO/access can be granted manually.
- Tribute/manual payments are the practical payment path for pilot.
- YooKassa exists but should remain disabled unless explicitly enabled and retested.

## Checks

Before finishing backend changes:

```bash
cd backend && npm run build
cd backend && npx prisma validate
```

Before finishing frontend changes:

```bash
cd frontend && npm run type-check
cd frontend && npm run build
```

Production health:

```bash
curl -s -i https://api.lumaiq.ru/api/v1/health
```

## Current Next Engineering Step

Migrate frontend content sections gradually to workflow API:

1. Reels hooks/script
2. Articles topic/article
3. Posts topic/post

Each migration should create `AIWorkflowRun`, `AIWorkflowStep`, `AIArtifact` and still save final user-visible content through the existing content/localStorage flow until UI persistence is redesigned.
