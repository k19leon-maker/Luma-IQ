# Luma IQ

Главный актуальный контекст проекта: [`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md).

Luma IQ состоит из двух контуров:

1. Публичный B2C-контур для родителей и семей: лендинг, SEO-страницы, короткая диагностика и диалог с ИИ-психологом.
2. Существующий B2B AI SaaS для экспертов, маркетологов и продюсеров: стратегия проекта, ЦА, УТП, продукты, контент, AI workflows, админка и подписки.

Важно: B2C-контур добавлен поверх существующего продукта. B2B-сервис не переписывался и продолжает жить отдельно.

## Текущее состояние

- Production frontend: `https://www.lumaiq.ru`
- Production API: `https://api.lumaiq.ru`
- Backend: Hetzner VPS, PM2 process `lumaiq-backend`
- Frontend deploy: Vercel production deploy from repo root with `npx vercel --prod --yes`
- Backend deploy: SSH to `/app`, pull `main`, migrate, generate Prisma client, build, restart PM2
- Latest production deploy verified: `dpl_BveXUQKV7XbNt14HhHFrhLrWSMQe`
- Latest deployed commit: `fe5f6e4`

## Stack

- Frontend: React 18, TypeScript, Vite, CSS Modules, Zustand
- Backend: Node.js, Express, TypeScript
- DB: PostgreSQL
- ORM: Prisma 7
- Auth: JWT access/refresh
- AI: OpenAI + Anthropic
- Process manager: PM2

## Main Modules

### Public B2C Portal

- `/` — публичная главная страница для родителей, которые хотят сохранить отношения в семье.
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

B2C-концепция: Luma IQ — пространство для родителей. Коммуникация должна идти от жизненных семейных ситуаций, а не от “психологического портала” или каталога специалистов.

### B2C Diagnostic + AI Psychologist

- `/diagnostics/ai-psychologist` — короткий квиз как первый этап диагностики.
- `/diagnostics/ai-psychologist/chat` — личный кабинет/диалог с ИИ-психологом.
- `/client` — черновой B2C-кабинет конечного пользователя.

Текущая логика:

- квиз сохраняет имя, базовую семейную ситуацию, длительность, желаемое изменение, email и телефон;
- последний шаг собирает email/телефон и юридические согласия;
- после отправки пользователь сразу попадает в чат;
- первое сообщение ИИ персонализируется по ответам квиза;
- профиль и история сохраняются в localStorage;
- публичные CTA понимают состояние пользователя:
  - новый пользователь видит `Начать диагностику` / `Пройти диагностику`;
  - пользователь с завершенным квизом видит `Вернуться к ИИ-психологу`;
- повторный вход на `/diagnostics/ai-psychologist` после завершения ведет в чат;
- кнопка B2B `Личный кабинет` удалена из публичной шапки.

Основные файлы:

- `frontend/src/data/b2c/psychology.ts`
- `frontend/src/pages/B2CPsychology/B2CPsychology.tsx`
- `frontend/src/pages/B2CPsychology/B2CPsychology.module.css`
- `frontend/src/hooks/useB2CDiagnosticState.ts`
- `backend/src/controllers/b2c-psychologist.controller.ts`
- `backend/src/prompts/b2c-psychologist.prompt.ts`

Для B2C AI используется отдельный ключ:

```env
OPENAI_B2C_PSYCHOLOGY_API_KEY=
OPENAI_B2C_PSYCHOLOGY_MODEL=gpt-5.4
```

См. `backend/B2C_OPENAI_KEY_SETUP.md`.

### Legal Infrastructure

Публичный контур подготовлен под юридическое оформление:

- страницы документов существуют как заглушки;
- единый footer содержит legal-ссылки;
- формы используют обязательные consent checkbox;
- согласия логируются через `ConsentLog`;
- cookie banner сохраняет факт принятия;
- версии документов фиксируются через document version.

### B2B SaaS

- Strategy: About Expert, Positioning, Audience, UTP, Social profiles
- Product Builder: Main Product, Mini Product, Lead Magnet
- Content: Posts, Reels, Articles, Video Scripts, Chatbot Chains, Threads ИИ, Content Plan
- AI Dialog: project-aware AI marketing assistant
- Admin: users, manual access, subscriptions/payments, AI usage analytics
- AI Economy: usage tracking, model pricing, cost accounting
- AI Orchestration Foundation: prompt registry, project context builder, workflow runs/steps/artifacts

Current B2B product state:

- пользовательский UI лимитов упрощен до AI-баланса, проектов, тарифа, даты обновления и истории списаний;
- технические credits/tokens/cost/request count/content units остаются для admin/analytics, но не должны показываться пользователю;
- backend access policy больше не должен блокировать пользовательские сценарии отдельными контентными лимитами вроде heavy/content/youtube/longread;
- стратегия и продукты списываются через общий AI-баланс, а не как контент-единицы;
- верхний AI-баланс вынес в topbar B2B-приложения;
- страницы Content имеют отдельный scroll внутри AI-workspace, чтобы нижние кнопки настройки были доступны.

### Project Files And Materials

Файловый импорт используется в разделе `О себе` и материалах проекта.

Поддерживаемые источники:

- локальные файлы: TXT/MD, PDF, DOC/DOCX, CSV, XLS/XLSX;
- публичные ссылки Google Docs;
- публичные ссылки Google Sheets;
- публичные Google Drive file links.

Важно:

- загрузка и извлечение текста не должны списывать AI-баланс;
- PDF без текстового слоя возвращает понятное сообщение пользователю;
- полноценная привязка Google Drive OAuth пока остается отдельной будущей задачей.

### Product Builder Export

Продуктовый конструктор поддерживает основной продукт, мини-продукт и лид-магнит.

Текущие правила:

- правки названия продукта должны фиксироваться без полной пересборки, если пользователь просто выбрал название;
- экспорт должен брать актуальную версию продукта, а не первую генерацию;
- DOCX-экспорт использует универсальные шрифты и преобразует markdown в нормальные заголовки, списки и жирный текст;
- PDF-экспорт, если используется, требует отдельной проверки качества разрывов страниц.

## Backend AI

Legacy endpoint remains active:

```text
POST /api/v1/ai/chat
```

New workflow foundation:

```text
GET  /api/v1/ai/workflows/prompts
POST /api/v1/ai/workflows/:workflow/start
POST /api/v1/ai/workflows/:workflow/step
```

Current workflow prompt configs:

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

## Threads ИИ

`/threads` is a specialized content section for Threads.

- Generates a fixed 7-day plan plus ready posts/threads.
- Uses active project strategy, audience/JTBD, UTP, products and previous content context.
- Uses backend workflow API, not frontend prompt assembly.
- Full plan generation and single-post regeneration are counted through the shared AI economy as feature `threads`.
- Saved separately as `GeneratedText.type = THREADS`; it does not overwrite universal Content Plan items.

## Local Start

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

```bash
cd frontend
npm install
npm run dev
```

Local URLs:

- Frontend: `http://localhost:5174`
- Backend API: `http://localhost:3001/api/v1`

## Checks

```bash
cd backend && npm run build
cd backend && npm run test
cd frontend && npm run build
```

Production health:

```bash
curl -s -i https://api.lumaiq.ru/api/v1/health
```

## Docs

- `PROJECT_CONTEXT.md` — единый актуальный контекст проекта
- `CLAUDE.md` — current project context for AI/code assistants
- `docs/architecture.md` — current architecture
- `docs/PROMPT_STRATEGY.md` — AI roles and prompt strategy
- `docs/PROMPTS_AUDIT.md` — prompt/orchestration audit
- `docs/ROADMAP.md` — current roadmap
