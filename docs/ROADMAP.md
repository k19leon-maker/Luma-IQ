# Luma IQ Roadmap

Обновлено: 2026-05-20

## Current State

| Area | Status |
|---|---|
| Production frontend/backend | Done |
| PostgreSQL/Prisma foundation | Done |
| Auth/admin/manual access | Done |
| OpenAI + Anthropic integration | Done |
| AI usage/token/cost accounting | Foundation done |
| Prompt improvements for Posts/Reels/Articles/Chains | MVP done |
| AI orchestration foundation | Phase 1A/1B done |
| Frontend migration to workflow API | Not done |
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
- AI orchestration foundation added:
  - prompt registry;
  - project context builder;
  - workflow API;
  - workflow runs/steps/artifacts;
  - validation/repair layer.

## Next Engineering Priorities

### P0 — Migrate Content Engines To Workflow API

1. Reels:
   - use `reels.hooks.generate`;
   - use `reels.script.write`;
   - save selected hooks/scripts as `AIArtifact`.

2. Articles:
   - use `articles.topic.generate`;
   - use `articles.article.write`;
   - save topics/articles as `AIArtifact`.

3. Posts:
   - use `posts.topic.generate`;
   - use `posts.post.write`;
   - remove remaining frontend prompt assembly.

### P1 — Workflow Observability

- Admin view for workflow runs.
- Artifact history per project.
- Cost per workflow and feature.
- Basic filters: user, project, workflow, status, date.

### P1 — Access And Limits

- Connect workflow API to credit limits more strictly.
- Add per-workflow costs.
- Add heavy/light classification by workflow step.

### P2 — Prompt Registry Expansion

- Add workflow configs for:
  - chatbot chains;
  - video scripts;
  - positioning;
  - audience/JTBD;
  - UTP/social;
  - product-main/product-mini/lead-magnet.

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
