# Архитектура Luma IQ

Обновлено: 2026-07-10

## Production

```text
Browser
  -> Frontend: Vercel / https://www.lumaiq.ru
     -> Public B2C portal
     -> B2B SaaS app routes
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
| `/files` | Project material text extraction and file/link ingestion |
| `/b2c/psychologist/chat` | Public B2C AI psychologist chat |
| `/b2c/consents` | Public/B2C consent logging |

## Route Architecture

### Public B2C

```text
/                                   public family-focused homepage
/articles, /articles/[slug]         SEO articles
/categories, /categories/[slug]     SEO categories
/problems, /problems/[slug]         SEO problem pages
/experts, /experts/[slug]           expert templates
/programs, /programs/[slug]         program templates
/webinars, /webinars/[slug]         webinar templates
/tests, /tests/[slug]               test/diagnostic templates
/diagnostics/ai-psychologist        short B2C quiz
/diagnostics/ai-psychologist/chat   B2C AI psychologist chat workspace
/client                             early B2C client cabinet
/contacts                           public contacts
/legal/*                            public legal pages
```

### Existing B2B SaaS

```text
/auth        B2B login/register
/app         B2B application shell / dashboard
/admin       B2B/admin operations
```

Do not redirect `/` to auth. Root is the public B2C portal.
Do not route the public header CTA to B2B auth. Public CTA is B2C diagnostic/chat only.

## B2C State And Return Logic

B2C completion is currently detected client-side through localStorage:

- `lumaiq.b2c.psychology.profile`
- `lumaiq.b2c.psychology.messages`
- `lumaiq.b2c.user`

Helper:

- `frontend/src/hooks/useB2CDiagnosticState.ts`

Behavior:

- no completed diagnostic -> CTA points to `/diagnostics/ai-psychologist`;
- completed diagnostic + contact + messages -> CTA points to `/diagnostics/ai-psychologist/chat`;
- completed user opening the quiz route is redirected to chat.

This is an MVP persistence layer. Future B2C account work should move profile/history to backend storage.

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

### B2C AI Psychologist Flow

```text
Short quiz
  -> local B2C profile and contact
  -> personalized opening message
  -> /diagnostics/ai-psychologist/chat
  -> POST /api/v1/b2c/psychologist/chat
  -> b2c-psychologist.prompt.ts
  -> separate OpenAI B2C key/model
```

Important:

- B2C AI psychologist is separate from B2B `/api/v1/ai/chat` and workflow API.
- B2C should use `OPENAI_B2C_PSYCHOLOGY_API_KEY`.
- Do not send phone/email into the AI context unless there is a deliberate future product/legal decision.
- AI outputs render through markdown normalization in the chat UI.

## User Limits And Billing Architecture

The user-facing limits model is intentionally simple:

- AI balance;
- project count;
- current plan;
- reset date;
- user-readable usage history.

User-facing UI/API should not expose internal technical accounting fields such as:

- credits;
- tokens;
- OpenAI/Anthropic cost;
- request count;
- content units;
- heavy generations;
- youtube script limits;
- longread limits.

Those fields can remain in admin analytics, logs and cost accounting.

Charging rules:

- charge AI balance only after a successful AI action returns a result;
- do not charge on page open, navigation, manual save, viewing existing material, refresh or failed generation;
- strategy, products and content all use the shared AI balance from the user's point of view;
- projects remain a separate limit.

Relevant files:

- `backend/src/services/billing.service.ts`
- `backend/src/services/access-policy.service.ts`
- `backend/src/services/ai-generation.service.ts`
- `frontend/src/api/billing.api.ts`
- `frontend/src/components/UsageLimits/*`

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
- `backend/src/controllers/files.controller.ts` — text extraction from uploaded files and public document links

## File Ingestion Architecture

File ingestion supports local upload and public document links.

Supported local formats:

- TXT/MD;
- PDF with text layer;
- DOC/DOCX;
- CSV;
- XLS/XLSX.

Supported URL imports:

- public Google Docs links;
- public Google Sheets links;
- public Google Drive file links.

Implementation notes:

- file parsing is deterministic extraction, not AI generation;
- extraction must not charge AI balance;
- PDF files without text layer should return a clear user-facing message;
- Google Drive OAuth and private file picker are not implemented yet and should be treated as a separate product task.

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
