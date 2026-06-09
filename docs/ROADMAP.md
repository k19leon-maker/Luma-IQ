# Luma IQ Roadmap

Обновлено: 2026-06-09

## Current State

| Area | Status |
|---|---|
| Production frontend/backend | Done |
| PostgreSQL/Prisma foundation | Done |
| Auth/admin/manual access | Done |
| OpenAI + Anthropic integration | Done |
| AI usage/token/cost accounting | Foundation done |
| Prompt improvements for Posts/Reels/Articles/Chains | MVP done |
| AI orchestration foundation | Live |
| Frontend migration to workflow API | Partial |
| Threads ИИ | Live |
| Frontend limits display | UI foundation live |
| Subscription/autobilling | Future |
| Social import/style analysis | Future |

## Done Recently

- OpenAI/Anthropic real AI responses enabled for production flows.
- Model routing configured by section intent.
- AI usage tracking writes `ai_generations` and `ai_usage_events`.
- Token usage and model pricing seed added.
- Posts prompt improved and psychology hardcode removed.
- Chatbot Chains prompt replaced with Telegram direct-response logic.
- Reels Engine MVP added: goals, hooks, facture, scripts.
- Articles Engine MVP added: topic generation, platform/tone/depth, SEO article output.
- Threads ИИ added:
  - route `/threads`;
  - sidebar item in Content group;
  - fixed 7-day Threads plan;
  - ready posts/threads;
  - strict JSON workflow prompts;
  - `GeneratedText.type = THREADS`;
  - shared AI economy feature `threads`.
- Frontend limit summary added to the service UI; it currently shows tariff limits, with real usage balances still planned.
- Credit ledger race condition fixed with project-level advisory lock / transaction protection.
- AI orchestration foundation added:
  - prompt registry;
  - project context builder;
  - workflow API;
  - workflow runs/steps/artifacts;
  - validation/repair layer.

## Next Engineering Priorities

### P0 — Backend-Backed Limits In UI

- Replace frontend tariff-only limit display with real backend balances.
- Show actual monthly credits remaining, daily AI generations used/left, plan and reset dates.
- Keep copy/view/save operations free; generation/regeneration should spend limits through AI economy.

### P0 — Finish Prompt/Workflow Migration

- Identify remaining complex frontend prompt assembly.
- Move screens to workflow API without breaking existing UX.
- Keep DB persistence and localStorage compatibility where necessary during migration.

### P1 — Workflow Observability

- Admin view for workflow runs.
- Artifact history per project.
- Cost per workflow and feature.
- Basic filters: user, project, workflow, status, date.

### P1 — Threads ИИ Follow-Up

- Add history/version picker for previous Threads generations.
- Add quick rewrite actions: softer, sharper, shorter, more expert.
- Add stronger JSON schema validation for Threads result shape.
- Optionally connect selected Threads items to universal content-plan after explicit product decision.

### P2 — Prompt Registry Hardening

- Add schema-level structured output validation, not only JSON parse checks.
- Add prompt version visibility in admin.
- Add repair telemetry by workflow/step.

### P2 — Memory Optimization

- Lightweight summaries.
- Repeated themes/hooks detection.
- Content history compression.
- No vector DB yet.

### P3 — Social Context Import

- Telegram channel import.
- Instagram professional account import.
- Content style profile.
- “Write in my style” mode.

### P3 — Billing Readiness

- Stripe/Telegram payments later.
- Tribute/manual remains current pilot path.
- YooKassa stays disabled unless explicitly retested and enabled.

## Product Principle

Do not build autonomous agents. Build deterministic, observable, context-aware workflows.
