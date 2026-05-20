# Prompt And AI Orchestration Audit

Обновлено: 2026-05-20

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

This path is implemented as backend foundation and should gradually replace frontend prompt assembly.

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

Migration needed:

- move UI from `/ai/chat` to workflow API.

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

Migration needed:

- use `reels.hooks.generate` and `reels.script.write`.

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

Migration needed:

- use `articles.topic.generate` and `articles.article.write`.

### Chatbot Chains

Status: improved.

Prompt creates Telegram-native direct-response chain posts. Goal: sell next action in funnel.

Migration needed:

- add workflow prompt configs and artifact storage.

## Known Legacy Risks

1. Some frontend screens still assemble prompts directly.
2. `ai.service.ts` still contains old fallback prompts with psychology language.
3. `dynamic.prompts.ts` is large and should gradually become legacy.
4. LocalStorage still stores many content results on frontend.
5. Project materials and DB context are not yet unified into one perfect memory layer.

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
2. Migrate Reels first.
3. Migrate Articles second.
4. Migrate Posts third.
5. Add workflow configs for Chains and Video Scripts.
6. Replace old psychology fallback in `ai.service.ts`.
