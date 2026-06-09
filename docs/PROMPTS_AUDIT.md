# Prompt And AI Orchestration Audit

Обновлено: 2026-06-09

## Current AI Layer

Luma IQ currently has two AI paths.

### Legacy Path

```text
Frontend prompt
  -> /api/v1/ai/chat
  -> ai.controller.ts
  -> dynamic.prompts.ts
  -> ai.service.ts
  -> AI provider
```

This path still powers current UI screens.

### Workflow Path

```text
Frontend inputs
  -> /api/v1/ai/workflows/:workflow/start|step
  -> prompt registry
  -> project context builder
  -> ai workflow service
  -> validation/repair
  -> artifact + usage accounting
```

This path is implemented and active. It should remain the default path for new production AI features.

## Backend Files

- `backend/src/config/system-prompt.ts`
- `backend/src/prompts/dynamic.prompts.ts`
- `backend/src/prompts/registry/*`
- `backend/src/services/ai.service.ts`
- `backend/src/services/ai-generation.service.ts`
- `backend/src/services/ai-workflow.service.ts`
- `backend/src/services/project-context.service.ts`
- `backend/src/services/ai-validation.service.ts`
- `backend/src/controllers/ai.controller.ts`
- `backend/src/controllers/ai-workflow.controller.ts`

## Registered Workflow Prompts

| Prompt ID | Feature | Purpose |
|---|---|---|
| `posts.topic.generate.v1` | post | Generate post topics |
| `posts.post.write.v1` | post | Write final post |
| `reels.hooks.generate.v1` | reel | Generate/rank Reels hooks |
| `reels.script.write.v1` | reel | Write Reels script |
| `articles.topic.generate.v1` | article | Generate article topics |
| `articles.article.write.v1` | article | Write final article |
| `chatbot.chain.generate.v1` | chatbot_chain | Generate Telegram/direct-response text chain |
| `video.topic.generate.v1` | video_script | Generate video topics |
| `video.script.write.v1` | video_script | Write video script |
| `product.main.generate.v1` | product_main | Generate main product sections |
| `product.mini.generate.v1` | product_mini | Generate mini-product sections |
| `leadmagnet.generate.v1` | lead_magnet | Generate lead magnet sections |
| `positioning.*.generate.v1` | positioning | Positioning analysis, models, variants, final assets |
| `strategy.audience.generate.v1` | audience | Generate audience/JTBD blocks |
| `strategy.utp.generate.v1` | utp | Generate UTP blocks |
| `strategy.social.generate.v1` | social | Generate social packaging |
| `strategy.positioning.generate.v1` | positioning | Generate positioning block |
| `threads.plan.generate.v1` | threads | Generate 7-day Threads plan and posts |
| `threads.post.regenerate.v1` | threads | Regenerate one Threads post |

## Current Content Prompts

### Posts

Status: improved.

System prompt role:

- senior social media strategist;
- direct-response copywriter;
- content marketer.

Important qualities:

- platform-native;
- no generic AI tone;
- no psychology hardcode;
- strong hook, tension, CTA.

Workflow prompts exist. Keep old UI stable while gradually removing frontend prompt assembly.

### Reels

Status: MVP Reels Engine implemented in UI and prompt.

Capabilities:

- goal selection;
- platform selection;
- tone;
- trigger intensity;
- 30 hooks;
- selected hook;
- facture;
- 45-60 sec script.

Workflow prompts exist.

### Articles

Status: MVP Articles Engine implemented in UI and prompt.

Capabilities:

- article type;
- platform;
- tone;
- depth;
- CTA;
- 20 topic options;
- facture;
- SEO/meta/FAQ/scoring.

Workflow prompts exist.

### Chatbot Chains

Status: workflow prompt exists.

Prompt creates Telegram-native direct-response chain posts. Goal: sell next action in funnel.

### Threads ИИ

Status: live.

Threads ИИ uses backend workflow prompts and strict JSON output:

- `threads.plan.generate.v1`
- `threads.post.regenerate.v1`

Result persistence:

- `GeneratedText.type = THREADS`
- `metadata.kind = "threads_plan"`
- `metadata.contentType = "threads"`
- source snapshot, settings and workflow ids in metadata/content

## Known Legacy Risks

1. Some frontend screens still assemble prompts directly.
2. `dynamic.prompts.ts` is large and should gradually become legacy.
3. Some content areas still keep localStorage compatibility.
4. Project materials and DB context are not yet unified into one perfect memory layer.
5. JSON workflows need stronger schema-level validation beyond basic parse checks.

## Rules For New Work

- Do not add complex new prompts to frontend.
- Add new prompts through `backend/src/prompts/registry`.
- Use `project-context.service.ts` for selective context.
- Use `ai-workflow.service.ts` for workflow generation.
- Save important AI outputs as `AIArtifact`.
- Keep old endpoints working while migrating.
- No autonomous agents, no LangChain monster, no Temporal/BullMQ for MVP.

## Next Audit Tasks

1. Identify all frontend `aiApi.chat` calls and rank by migration priority.
2. Identify which production screens still assemble complex prompts in frontend.
3. Move those screens to workflow API in small safe increments.
4. Add structured JSON schemas for Threads and other JSON workflows.
5. Add admin workflow/artifact observability.
