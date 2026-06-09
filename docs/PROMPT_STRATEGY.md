# Prompt Strategy Luma IQ

Обновлено: 2026-06-09

## Главная идея

Luma IQ не должен быть набором prompt screens. Целевая архитектура: backend-driven, context-aware AI workflow platform.

Новые AI workflows должны строиться так:

```text
Frontend inputs
  -> workflow API
  -> prompt registry
  -> project context builder
  -> AI generation service
  -> validation/repair
  -> artifacts/accounting
```

Frontend не должен собирать сложные prompts для новых workflows.

## Prompt Layers

### 1. Global Behavior Prompt

File: `backend/src/config/system-prompt.ts`

Используется как общий слой поведения:

- русский язык;
- конкретика;
- анти-галлюцинации;
- учет контекста;
- уважение локального формата ответа.

### 2. Legacy Dynamic Prompts

File: `backend/src/prompts/dynamic.prompts.ts`

Используется старым endpoint:

```text
POST /api/v1/ai/chat
```

Активные секции:

- `ai-dialog`
- `positioning`
- `audience`
- `utp`
- `social`
- `product-main`
- `product-mini`
- `lead-magnet`
- `posts`
- `reels`
- `articles`
- `video-scripts`
- `chatbot-chains`

Legacy prompt path remains available for compatibility. New production AI features should be added through the workflow registry.

### 3. Workflow Prompt Registry

Files: `backend/src/prompts/registry/*`

Используется новым API:

```text
GET  /api/v1/ai/workflows/prompts
POST /api/v1/ai/workflows/:workflow/start
POST /api/v1/ai/workflows/:workflow/step
```

Каждый prompt config содержит:

- `id`
- `version`
- `feature`
- `workflow`
- `step`
- `model`
- `temperature`
- `maxTokens`
- `artifactType`
- `systemPrompt`
- `userPromptBuilder`
- `validationRules`

Current configs:

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

## AI Roles By Area

| Area | Role | Goal |
|---|---|---|
| AI Dialog | Business strategist / marketing strategist | Help user manage project as a business |
| About Expert | Structured brief | Collect objective expert data |
| Positioning | Strategic marketer | Find/clarify market direction |
| Audience/JTBD | Expert-in-niche + client voice | Extract demand, pains, language, buying reasons |
| UTP/Social | Conversion strategist | Turn project meaning into profile/offers |
| Main/Mini/Lead Magnet | Product marketer | Build product ladder from demand |
| Posts | Senior social strategist + direct-response copywriter | Generate high-retention, high-trust social posts |
| Reels | Vertical video strategist + direct-response scriptwriter | Generate hooks and scripts for business goals |
| Articles | Editorial strategist + SEO editor + journalist | Generate expert editorial/SEO assets |
| Chatbot Chains | Telegram direct-response copywriter | Sell the next action in funnel |
| Threads ИИ | Senior content strategist + direct-response copywriter for Threads | Generate a project-aware 7-day Threads plan and ready posts/threads |

## Content Engines

### Posts Engine

Current behavior:

- Generates topics and posts.
- System prompt emphasizes social strategy, direct response, JTBD, platform adaptation, CTA.
- No hardcoded psychology.

Workflow prompts exist:

- `posts.topic.generate`
- `posts.post.write`

### Reels Engine

Current MVP UI:

- goal selection;
- platform selection;
- tone;
- trigger intensity;
- 30 hooks;
- hook selection;
- facture;
- 45-60 second script.

Workflow prompts already exist:

- `reels.hooks.generate`
- `reels.script.write`

Workflow prompts exist:

- `reels.hooks.generate`
- `reels.script.write`

### Articles Engine

Current MVP UI:

- article type;
- platform;
- tone;
- depth;
- CTA;
- 20 topics;
- facture;
- article with SEO/meta/FAQ/scoring.

Workflow prompts already exist:

- `articles.topic.generate`
- `articles.article.write`

Workflow prompts exist:

- `articles.topic.generate`
- `articles.article.write`

### Chatbot Chains

System prompt creates Telegram-native direct-response posts for chains. Goal is to sell the next action: lead magnet, video, application, consultation, closed channel, mini-product, return after lead magnet.

Workflow prompt exists:

- `chatbot.chain.generate`

### Threads ИИ

Specialized Threads content engine:

- fixed 7-day plan;
- THREADS-7 framework;
- H-C-M-I-C post structure;
- strict JSON output;
- source snapshot saved with the result;
- plan and post regeneration counted through AI economy feature `threads`.

Workflow prompts:

- `threads.plan.generate`
- `threads.post.regenerate`

## Context Rules

Main principle: selective context injection.

Do not pass all project data by default. Use:

- expert profile;
- positioning;
- audience/JTBD;
- UTP;
- products;
- lead magnets;
- relevant previous content;
- current workflow inputs.

Backend service:

```text
backend/src/services/project-context.service.ts
```

This service returns:

- base project context;
- prioritized context blocks;
- rendered context;
- approx token usage;
- context version.

## Validation Rules

MVP validation lives in:

```text
backend/src/services/ai-validation.service.ts
```

Current checks:

- minimum length;
- required includes;
- list-like output;
- article heading structure;
- script scene structure.
- JSON parsing for `structuredOutput: "json"`.

If output fails validation, workflow service performs one repair attempt.

## Model Strategy

Default intent:

- Strategy/product heavy tasks: `gpt-5.5`
- Content/chat tasks: `gpt-5.4`
- Lightweight/fast tests can use mini/haiku later
- Anthropic remains available for reasoning flows/user choice

Do not hardcode provider-specific logic in frontend for new workflows.

## Non-Negotiables

- Do not hardcode psychology or any niche.
- Do not assemble new production prompts in frontend.
- Do not create giant unversioned prompts.
- Do not create autonomous agents.
- Do not add LangChain/Temporal/BullMQ orchestration for MVP.
- AI outputs should become structured artifacts where possible.
- Every AI generation should be attributable to feature/workflow/step/model/provider/cost.

## Next Prompt Work

1. Audit remaining frontend `aiApi.chat` usage and migrate where it still assembles complex production prompts.
2. Add richer structured-output schemas for JSON workflows, especially Threads.
3. Add admin/prompt observability views.
4. Continue shrinking legacy `dynamic.prompts.ts` as screens move to workflow API.
