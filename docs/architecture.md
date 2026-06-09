# Архитектура Luma IQ

Обновлено: 2026-06-09

## Production

```text
Browser
  -> Frontend: Vercel / https://www.lumaiq.ru
  -> Backend API: Hetzner VPS / https://api.lumaiq.ru
  -> PostgreSQL
  -> OpenAI / Anthropic
```

Backend process:

- path: `/app/backend`
- PM2 process: `lumaiq-backend`
- branch: `main`

Deploy backend:

```bash
ssh root@128.140.111.43 "cd /app && git pull --ff-only origin main && cd backend && npm install && npx prisma migrate deploy && npx prisma generate && npm run build && pm2 restart lumaiq-backend --update-env && pm2 save"
```

Deploy frontend:

```bash
npx vercel --prod --yes
```

## API Groups

All production APIs use `/api/v1`.

| Path | Purpose |
|---|---|
| `/auth` | Registration, login, refresh |
| `/projects` | Project CRUD and strategy data |
| `/ai/chat` | Legacy AI generation endpoint |
| `/ai/workflows/*` | New AI orchestration foundation |
| `/jtbd` | JTBD sessions |
| `/content` | Generated content persistence |
| `/content-plan` | Content plan items |
| `/products` | Product entities |
| `/payments` | Manual/Tribute/YooKassa payment layer |
| `/admin` | Admin dashboard/users/access/analytics |
| `/strategy/export-pdf` | Strategy export |
| `/files` | Project materials/files views |

## AI Architecture

Current state is hybrid:

- Existing screens still use `/api/v1/ai/chat`.
- Workflow API is live and used by newer/specialized flows, including Threads ИИ.
- New production AI features should use workflow API rather than assembling prompts in frontend.

### Legacy AI Flow

```text
Frontend prompt assembly
  -> POST /api/v1/ai/chat
  -> ai.controller.ts
  -> dynamic.prompts.ts / buildAiDialogContext.ts
  -> ai.service.ts
  -> OpenAI or Anthropic
  -> ai_generation accounting
```

### New Workflow Flow

```text
Frontend sends workflow, step, projectId, inputs
  -> POST /api/v1/ai/workflows/:workflow/start|step
  -> ai-workflow.controller.ts
  -> promptRegistry
  -> project-context.service.ts
  -> ai-workflow.service.ts
  -> ai.service.ts
  -> ai-validation.service.ts
  -> ai_artifacts + ai_workflow_steps + ai_generations
```

New endpoints:

```text
GET  /api/v1/ai/workflows/prompts
POST /api/v1/ai/workflows/:workflow/start
POST /api/v1/ai/workflows/:workflow/step
```

Prompt configs currently registered:

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

## Core Backend Files

- `backend/src/services/ai.service.ts` — provider calls, OpenAI/Anthropic
- `backend/src/services/ai-generation.service.ts` — accounting wrapper
- `backend/src/services/ai-workflow.service.ts` — deterministic workflow step runner
- `backend/src/services/project-context.service.ts` — selective project context builder
- `backend/src/services/ai-validation.service.ts` — MVP validation/repair support
- `backend/src/prompts/dynamic.prompts.ts` — legacy section system prompts
- `backend/src/prompts/registry/*` — versioned workflow prompt registry
- `backend/src/controllers/ai.controller.ts` — legacy `/ai/chat`
- `backend/src/controllers/ai-workflow.controller.ts` — workflow API

## Database Highlights

Main product entities:

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

AI economy:

- `AIGeneration`
- `AIUsageEvent`
- `AIModelPricing`
- `FeaturePricing`
- `BillingPeriod`
- `CreditLedgerEntry`
- `FeatureUsageDaily`

AI orchestration:

- `AIWorkflowRun`
- `AIWorkflowStep`
- `AIArtifact`

`AIGeneration` now optionally links to `workflowRunId` and `workflowStepId`.

Generated content types:

- `POST`
- `REEL`
- `ARTICLE`
- `VIDEO_SCRIPT`
- `CHATBOT_CHAIN`
- `THREADS`
- `OTHER`

Threads ИИ stores generated 7-day plans in `GeneratedText` with `type = THREADS`. The JSON result lives in `content`; `metadata` stores `kind`, `contentType`, source snapshot, settings and workflow/artifact/generation ids.

## Important Principles

- Do not build autonomous agents or AGI behavior.
- Keep workflows deterministic and observable.
- Do not assemble new production prompts in frontend.
- Do not pass the whole project context by default.
- Use selective context injection through `project-context.service.ts`.
- Treat AI outputs as artifacts, not only text blobs.
- Keep existing screens working while gradually migrating them to workflow API.
- Do not save specialized Threads results into universal content-plan without an explicit product decision.
