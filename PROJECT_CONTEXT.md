# Luma IQ - единый контекст проекта

Обновлено: 2026-07-10

Этот файл - главный источник контекста по проекту Luma IQ для разработки, Codex/AI-ассистентов, быстрых аудитов и планирования задач.

## 1. Что такое Luma IQ

Luma IQ состоит из двух контуров.

1. Public B2C: семейное пространство для родителей, которые хотят сохранить отношения в семье. Включает публичный сайт, SEO-страницы, короткую диагностику и диалог с AI-психологом.
2. B2B AI SaaS: рабочий кабинет для экспертов, маркетологов и продюсеров. Включает проекты, стратегию, ЦА, УТП, продукты, контент, AI-диалог, workflow API, админку, подписки и аналитику.

Главный принцип: B2C-контур добавлен поверх существующего B2B-продукта. B2B SaaS нельзя ломать или переписывать без явной задачи.

## 2. Production

- Frontend: `https://www.lumaiq.ru`
- API: `https://api.lumaiq.ru`
- Backend: Hetzner VPS `128.140.111.43`
- Server path: `/app/backend`
- PM2 process: `lumaiq-backend`
- GitHub branch: `main`
- Latest verified deploy: `fe5f6e4`
- Latest Vercel deployment: `dpl_BveXUQKV7XbNt14HhHFrhLrWSMQe`

Backend deploy:

```bash
ssh root@128.140.111.43 "cd /app && git pull origin main && cd backend && npx prisma migrate deploy && npx prisma generate && npm run build && pm2 restart lumaiq-backend"
```

Frontend deploy:

```bash
npx vercel --prod --yes
```

Production health:

```bash
curl -s -i https://api.lumaiq.ru/api/v1/health
```

## 3. Stack

- Frontend: React 18, TypeScript, Vite, CSS Modules, Zustand
- Backend: Node.js, Express, TypeScript
- DB: PostgreSQL
- ORM: Prisma 7
- Auth: JWT access/refresh
- AI providers: OpenAI + Anthropic
- Deploy: Vercel frontend, Hetzner VPS backend, PM2 process manager

## 4. Main Product Areas

### Public B2C

Routes:

- `/`
- `/articles`, `/articles/[slug]`
- `/categories`, `/categories/[slug]`
- `/problems`, `/problems/[slug]`
- `/experts`, `/experts/[slug]`
- `/programs`, `/programs/[slug]`
- `/webinars`, `/webinars/[slug]`
- `/tests`, `/tests/[slug]`
- `/contacts`
- `/legal/privacy-policy`
- `/legal/personal-data`
- `/legal/offer`
- `/legal/cookies`

Positioning: Luma IQ is a space for parents who want to preserve family relationships. Psychology is the instrument, not the main communication object.

### B2C Diagnostic And AI Psychologist

Routes:

- `/diagnostics/ai-psychologist`
- `/diagnostics/ai-psychologist/chat`
- `/client`

Current flow:

1. User starts a short quiz.
2. Quiz collects name, family situation, problem, duration and desired change.
3. Final step collects email, phone and legal consents.
4. User goes directly to chat.
5. First AI message is personalized from quiz answers.
6. Profile and chat are currently saved in localStorage.

Important files:

- `frontend/src/data/b2c/psychology.ts`
- `frontend/src/pages/B2CPsychology/B2CPsychology.tsx`
- `frontend/src/hooks/useB2CDiagnosticState.ts`
- `backend/src/controllers/b2c-psychologist.controller.ts`
- `backend/src/prompts/b2c-psychologist.prompt.ts`
- `backend/B2C_OPENAI_KEY_SETUP.md`

B2C uses separate OpenAI key:

```env
OPENAI_B2C_PSYCHOLOGY_API_KEY=
OPENAI_B2C_PSYCHOLOGY_MODEL=gpt-5.4
```

### B2B SaaS

Main routes:

- `/ai-dialog`
- `/tasks`
- `/strategy/about`
- `/strategy/positioning`
- `/strategy/audience`
- `/strategy/utp`
- `/strategy/social`
- `/products/main`
- `/products/mini`
- `/products/lead-magnet`
- `/posts`
- `/reels`
- `/articles`
- `/video-scripts`
- `/chatbot-chains`
- `/threads`
- `/content-plan`
- `/files/materials`
- `/files/products`
- `/limits`
- `/admin`

Important product principle: B2B should feel like a context-aware AI marketing operating system, not a generic GPT wrapper.

## 5. User-Facing AI Balance Model

User UI should show only:

- AI balance;
- projects;
- current plan;
- reset date;
- user-readable usage history.

User UI should not show:

- credits;
- tokens;
- OpenAI/Anthropic cost;
- request count;
- content units;
- heavy generations;
- separate YouTube script limits;
- separate longread limits;
- technical action types.

Technical usage/cost fields remain available for admin analytics.

Charging rules:

- charge only after successful AI generation;
- do not charge on page open, navigation, manual save, viewing existing material, refresh or failed generation;
- strategy, products and content all use shared AI balance from the user's point of view;
- projects remain a separate limit.

Relevant files:

- `backend/src/services/billing.service.ts`
- `backend/src/services/access-policy.service.ts`
- `backend/src/services/ai-generation.service.ts`
- `frontend/src/api/billing.api.ts`
- `frontend/src/components/UsageLimits/*`

## 6. AI Architecture

Current state is hybrid.

Legacy endpoint remains active:

```text
POST /api/v1/ai/chat
```

Workflow API:

```text
GET  /api/v1/ai/workflows/prompts
POST /api/v1/ai/workflows/:workflow/start
POST /api/v1/ai/workflows/:workflow/step
```

New production AI features should use workflow API unless there is a deliberate compatibility reason.

Workflow stack:

- `backend/src/services/project-context.service.ts`
- `backend/src/services/ai-workflow.service.ts`
- `backend/src/services/ai-validation.service.ts`
- `backend/src/prompts/registry/*`
- `backend/src/controllers/ai-workflow.controller.ts`

Prompt registry includes:

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

Prompt rule: frontend should not assemble new strategic prompts. Frontend sends workflow, step, projectId and inputs; backend handles prompt selection, context, model routing, validation, accounting and artifact saving.

## 7. Product Builder

Product sections:

- main product;
- mini-product;
- lead magnet.

Current behavior:

- product chat edits should update the current product draft;
- if user only confirms/selects a product name, AI should acknowledge and apply it without full regeneration unless explicitly requested;
- export should use the latest/current product version;
- DOCX is the main editable export format;
- DOCX uses common system fonts and converts markdown into headings, lists and bold text;
- PDF export, if used, still needs quality checks for page breaks and raw markdown.

Relevant files:

- `frontend/src/pages/ProductMain/ProductMain.tsx`
- `frontend/src/pages/ProductMini/ProductMini.tsx`
- `frontend/src/pages/LeadMagnet/LeadMagnet.tsx`
- `frontend/src/utils/exportDocx.ts`
- `frontend/src/utils/productDraftEdits.ts`

## 8. File Ingestion

Project material ingestion supports local uploads and public document links.

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

Important:

- extraction/parsing is not an AI generation;
- extraction must not charge AI balance;
- scanned PDFs without text layer should return a clear user-facing message;
- full Google Drive OAuth/file picker is a separate future task.

Relevant files:

- `backend/src/controllers/files.controller.ts`
- `frontend/src/pages/Files/FileMaterials.tsx`
- `frontend/src/pages/Files/FileProducts.tsx`
- strategy/about file upload UI

## 9. Content

Content sections:

- Posts;
- Reels;
- Articles;
- Video Scripts;
- Chatbot Chains;
- Threads AI;
- Content Plan.

Notes:

- mock/demo generated content should not appear in user-facing lists;
- content setup pages must be scrollable inside AI workspace so bottom actions are reachable;
- generated content should be loaded from saved user/project data.

Threads AI:

- creates a 7-day plan and ready posts/threads;
- uses workflow API;
- saves separately as `GeneratedText.type = THREADS`;
- should not overwrite universal Content Plan items unless explicitly connected later.

## 10. Admin

Admin area handles:

- users;
- manual access;
- subscriptions/payments;
- AI usage analytics;
- technical cost and token metrics.

Payment sources:

- `MANUAL`;
- `TRIBUTE`;
- `YOOKASSA`.

Current pilot path: manual/Tribute access. YooKassa remains disabled unless explicitly retested and enabled.

## 11. Important DB Entities

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

AI/accounting:

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

Generated content types include:

- `POST`
- `REEL`
- `ARTICLE`
- `VIDEO_SCRIPT`
- `CHATBOT_CHAIN`
- `THREADS`
- `OTHER`

## 12. Checks

Backend:

```bash
cd backend && npm run build
cd backend && npm run test
```

Frontend:

```bash
cd frontend && npm run build
```

Production:

```bash
curl -s -i https://api.lumaiq.ru/api/v1/health
curl -s -I https://www.lumaiq.ru
```

## 13. Current Roadmap

P0:

- finish backend cleanup of old limit gates so shared AI balance is the only user-facing AI limit;
- split public billing responses from admin/technical billing analytics.

P1:

- product builder versioning and restore/select version UX;
- product export QA for main product, mini-product and lead magnet;
- file ingestion regression checks;
- continue workflow API migration.

P2:

- split large frontend pages: `Strategy.tsx`, `Positioning.tsx`, `Admin.tsx`;
- add workflow/artifact observability in admin;
- move B2C profile/chat persistence from localStorage to backend.

P3:

- CMS/content management for B2C editorial content;
- future subscription/autobilling after AI balance model is stable.

## 14. Working Rules For Future Tasks

- Work in the Google-synced folder only: `Мои ИТ проекты - гугл/Luma IQ`.
- Do not hardcode psychology into B2B flows; Luma IQ supports many niches.
- Do not show internal AI accounting to users.
- Do not charge AI balance for parsing files, navigation, manual edits or failed generations.
- Do not use mock/demo data in user-facing generated lists.
- Keep changes narrow and aligned with existing architecture.
- Run the smallest useful validation after each coherent batch.
- Deploy only after build/test checks pass.

## 15. Useful Persistent Skills

Luma IQ skills:

- `lumaiq-ai-billing`
- `lumaiq-workflow-migration`
- `lumaiq-product-export`
- `lumaiq-file-ingestion`

Universal skills:

- `universal-deploy-checklist`
- `universal-test-repair`
- `universal-frontend-polish`
- `universal-mock-cleanup`
- `universal-roadmap-backlog`
- `universal-file-ingestion`
