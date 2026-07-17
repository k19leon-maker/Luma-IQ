# Luma IQ Roadmap

Обновлено: 2026-07-10

## Current State

| Area | Status |
|---|---|
| Production frontend/backend | Live |
| PostgreSQL/Prisma foundation | Live |
| Auth/admin/manual access | Live |
| OpenAI + Anthropic integration | Live |
| AI usage/token/cost accounting | Foundation live |
| User-facing AI balance UI | Live foundation |
| Public/admin billing separation | In progress |
| Prompt/workflow foundation | Live |
| Frontend workflow migration | Partial |
| Product builder main/mini/lead magnet | Live, versioning needs hardening |
| Product DOCX export | Live |
| File upload/link text extraction | Live foundation |
| Mock/demo cleanup in user UI | Mostly done, needs regression checks |
| Public B2C family portal | Live |
| B2C AI psychologist quiz/chat | Live MVP |
| Legal pages/consent/cookie infrastructure | Live foundation |
| B2C backend persistence | Future |
| Workflow observability | Future |
| CMS/content management | Future |

## Done Recently

- Backend tests stabilized: `backend npm run test` passes.
- User-facing limits were simplified around AI balance, projects, plan, reset date and usage history.
- Topbar AI balance was added to the B2B app shell.
- Old technical usage concepts were hidden from user-facing UI where already migrated.
- Backend access policy and billing logic were adjusted toward shared AI balance.
- User-facing mock products/content were removed from major user sections.
- Content pages were made scrollable inside AI workspace, so setup actions are reachable.
- Manual access/admin user form was updated.
- File ingestion was expanded:
  - TXT/MD;
  - PDF;
  - DOC/DOCX;
  - CSV;
  - XLS/XLSX;
  - public Google Docs links;
  - public Google Sheets links;
  - public Google Drive file links.
- Product builder was improved:
  - product chat title selection no longer needs full product regeneration;
  - current draft handling improved;
  - DOCX export uses common fonts;
  - markdown is converted into readable document formatting.
- Positioning next-route bug was fixed.
- Large frontend pages started being split into helpers/components.
- Latest production deploy:
  - commit `fe5f6e4`;
  - Vercel deployment `dpl_BveXUQKV7XbNt14HhHFrhLrWSMQe`.

## Next Engineering Priorities

### P0 - Finish AI Balance Backend Model

- Remove or disable remaining user-facing gates for old limits:
  - daily/monthly AI generation limits;
  - content units;
  - heavy generations;
  - youtube script limits;
  - longread limits.
- Keep technical cost/tokens/request data for admin only.
- Verify that strategy and products do not get blocked as content units.
- Verify charge rules:
  - charge only after successful generation;
  - no charge on page open/navigation/manual save/viewing/refresh/error.

### P0 - Split Public Billing And Admin Billing

- Public billing response should include only:
  - plan;
  - plan status;
  - AI balance total/used/remaining;
  - project total/used/remaining;
  - reset date;
  - user-readable usage history.
- Admin billing/analytics can keep:
  - credits;
  - tokens;
  - cost;
  - request count;
  - content units;
  - heavy generations;
  - feature-level accounting.
- Update frontend types so user UI cannot accidentally render technical fields.

### P1 - Product Builder Versioning

- Define a canonical current version for:
  - main product;
  - mini-product;
  - lead magnet.
- Save manual and AI edits into that current version.
- Add version history and restore/select version UX.
- Ensure `Мои материалы -> Продукты` loads real user-created products only.
- Ensure export always uses the current version.

### P1 - Product Export QA

- Regression-check DOCX export for main product, mini-product and lead magnet.
- Confirm titles, headings, lists and bold formatting are preserved.
- If PDF export stays available, fix page breaks and raw markdown rendering there too.

### P1 - File Ingestion QA

- Regression-check each supported local format.
- Regression-check public Google Docs/Sheets/Drive links.
- Confirm scanned PDFs return a helpful message.
- Confirm extraction does not charge AI balance.
- Decide separately whether Google Drive OAuth/file picker is needed in the next release.

### P1 - Finish Prompt/Workflow Migration

- Identify screens that still assemble strategic prompts in frontend.
- Move remaining product/strategy/content flows to workflow API where useful.
- Preserve existing DB/localStorage compatibility while migrating.
- Store workflow runs, steps, artifacts and generation links consistently.

### P2 - Frontend Maintainability

- Continue splitting large pages:
  - `Strategy.tsx`;
  - `Positioning.tsx`;
  - `Admin.tsx`.
- Keep UI polish targeted and local.
- Run frontend build after each coherent UI batch.

### P2 - Workflow Observability

- Admin view for workflow runs.
- Filters by user, project, workflow, status and date.
- Show model, cost, tokens, failed steps and artifacts.

### P2 - B2C Backend Persistence

- Replace localStorage-only B2C profile/messages with backend-backed B2C user/session storage.
- Keep B2C user separate from B2B SaaS users/projects.
- Preserve quiz answers, chat history, consents and contact data.
- Add migration-compatible reader from current localStorage state.

### P2 - B2C Safety And Product Guardrails

- Add stronger crisis/safety handling for AI psychologist.
- Add clear disclaimers around medical/crisis/emergency help.
- Add backend-side message limits.
- Add admin/analytics visibility for B2C diagnostic starts/completions.

### P3 - CMS And Content Management

- Replace B2C mock/editorial content with CMS or backend content storage.
- Add editorial workflow for articles, categories, problems, experts, programs, webinars and tests.

### P3 - Billing And Payments

- Tribute/manual remains current pilot path.
- YooKassa stays disabled unless explicitly retested and enabled.
- Future subscription/autobilling should be designed after AI balance model is stable.

## Product Principle

Do not build autonomous agents. Build deterministic, observable, context-aware workflows.

For B2B: the user should understand one simple model - AI balance is spent on AI actions, projects are counted separately, and history shows where the balance went.

For B2C: do not turn the homepage into a generic psychology catalog. Keep the product anchored in family situations, parent-child relationships and relationships between parents.
