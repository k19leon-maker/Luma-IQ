# Luma IQ — актуальный контекст проекта

Обновлено: 2026-06-09

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
ssh root@128.140.111.43 "cd /app && git pull --ff-only origin main && cd backend && npm install && npx prisma migrate deploy && npx prisma generate && npm run build && pm2 restart lumaiq-backend --update-env && pm2 save"
```

Frontend deploy:

```bash
npx vercel --prod --yes
```

Git push to `main` may also trigger Vercel depending on current project integration, but the reliable manual production deploy is the CLI command above from the repo root.
Latest production deployment verified through Vercel CLI:

- commit: `f9de7c9`
- Vercel deployment: `dpl_HREBfaRrxkdwyy3uNBFPQAMbFZUJ`
- aliases: `https://www.lumaiq.ru`, `https://lumaiq.ru`

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
- `/threads`: Threads ИИ. Generates and saves a 7-day Threads plan plus posts/threads from project strategy. Uses workflow API and stores results as `GeneratedText.type = THREADS`.
- `/content-plan`: universal content planning section. Threads ИИ is separate and should not overwrite content-plan items.

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
- Posts / Reels / scripts / Threads / content: `gpt-5.4`
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

Implemented backend foundation. Some screens still use legacy `/ai/chat`; newer/specialized flows use workflow API.

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

- `ai.dialog.message.v1`
- `posts.topic.generate.v1`
- `posts.post.write.v1`
- `reels.hooks.generate.v1`
- `reels.script.write.v1`
- `articles.topic.generate.v1`
- `articles.article.write.v1`
- `chatbot.chain.generate.v1`
- `video.topic.generate.v1`
- `video.script.write.v1`
- `product.main.generate.v1`
- `product.mini.generate.v1`
- `leadmagnet.generate.v1`
- `positioning.analysis.generate.v1`
- `positioning.models.generate.v1`
- `positioning.variants.generate.v1`
- `positioning.gap-analysis.generate.v1`
- `positioning.final.generate.v1`
- `positioning.score.generate.v1`
- `positioning.assets.generate.v1`
- `strategy.audience.generate.v1`
- `strategy.utp.generate.v1`
- `strategy.social.generate.v1`
- `strategy.positioning.generate.v1`
- `threads.plan.generate.v1`
- `threads.post.regenerate.v1`

Important: old `/api/v1/ai/chat` remains active for legacy flows. New production AI features should use workflow API unless there is a deliberate compatibility reason.

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

Content persistence:

- `GeneratedText.type` includes `POST`, `REEL`, `ARTICLE`, `VIDEO_SCRIPT`, `CHATBOT_CHAIN`, `THREADS`, `OTHER`.
- Threads ИИ saves JSON in `GeneratedText.content`, with `metadata.kind = "threads_plan"` and `metadata.contentType = "threads"`.
- Threads results should not be saved into universal content-plan unless a separate product decision explicitly connects those features.

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

Backend-side workflow foundation and Threads ИИ are live. Next useful engineering work:

1. Continue migrating legacy content UI calls from `/ai/chat` to workflow API where still needed.
2. Replace remaining localStorage-first content persistence with DB-first persistence.
3. Connect frontend limit widgets to real backend usage balances instead of tariff defaults.
4. Add workflow/artifact observability in admin.
