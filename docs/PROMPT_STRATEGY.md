# Prompt Strategy Luma IQ

Обновлено: 2026-05-20

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

- `posts.topic.generate.v1`
- `posts.post.write.v1`
- `reels.hooks.generate.v1`
- `reels.script.write.v1`
- `articles.topic.generate.v1`
- `articles.article.write.v1`

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

## Content Engines

### Posts Engine

Current behavior:

- Generates topics and posts.
- System prompt emphasizes social strategy, direct response, JTBD, platform adaptation, CTA.
- No hardcoded psychology.

Next migration:

- Move frontend prompt assembly to `posts.topic.generate` and `posts.post.write` workflow API.

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

Next migration:

- Frontend should call workflow API and save hook/script artifacts.

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

Next migration:

- Frontend should call workflow API and save topic/article artifacts.

### Chatbot Chains

System prompt creates Telegram-native direct-response posts for chains. Goal is to sell the next action: lead magnet, video, application, consultation, closed channel, mini-product, return after lead magnet.

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

1. Migrate Reels UI to workflow API.
2. Migrate Articles UI to workflow API.
3. Migrate Posts UI to workflow API.
4. Add workflow prompts for chatbot chains and video scripts.
5. Add prompt configs for strategy/product sections.
6. Add admin/prompt observability views later.
