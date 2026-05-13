# LumaIQ — актуальный контекст проекта

## Что это

**LumaIQ** — SaaS-сервис для маркетинговой упаковки экспертов и сервисных бизнесов. Сервис помогает пройти путь от базового позиционирования и анализа целевой аудитории до УТП, продуктовой линейки, контент-плана и AI-материалов.

Главная логика продукта: пользователь ведет проект внутри сервиса, а AI-маркетолог / бизнес-стратег знает контекст проекта, накопленные материалы и помогает принимать решения по упаковке, стратегии, воронке, продуктам и контенту.

## Продакшен

- Frontend: Vercel
- Домен frontend: `https://www.lumaiq.ru`
- Backend: Hetzner VPS `128.140.111.43`
- Домен API: `https://api.lumaiq.ru`
- Backend path на сервере: `/app/backend`
- PM2 process: `lumaiq-backend`
- SSH: `ssh root@128.140.111.43`
- GitHub branch: `main`

Типовой деплой backend:

```bash
ssh root@128.140.111.43 "cd /app && git fetch origin main && git reset --hard origin/main && cd backend && npm install && npx prisma migrate deploy && npx prisma generate && npm run build && pm2 restart lumaiq-backend --update-env && pm2 save"
```

Frontend деплоится автоматически через Vercel после `git push origin main`.

## Стек

| Слой | Технологии |
|------|------------|
| Frontend | React 18, TypeScript, Vite, CSS Modules |
| Backend | Node.js, Express, TypeScript |
| DB | PostgreSQL |
| ORM | Prisma 7 |
| Auth | JWT access/refresh, email/password |
| State | Zustand + localStorage |
| AI | Anthropic Claude основной, OpenAI альтернативный |
| Process manager | PM2 |

Redis/Bull сейчас не являются активной частью продукта.

## Основные разделы

### Стратегия

1. **Позиционирование** — первый обязательный шаг стратегии.
   - Route: `/strategy/positioning`
   - Пользователь заполняет 4 простых поля: кто он, для кого работает, с какой проблемой помогает, к какому результату ведет.
   - Данные сохраняются в `project.strategyData.positioningData`.
   - Эти данные используются как базовый контекст для ЦА и AI-диалога.

2. **Целевая аудитория** — 13-шаговая AI-проработка ЦА.
   - Route: `/strategy/audience`
   - Данные сохраняются в `project.strategyData.answers` и `audience-store-v1`.
   - AI-промпт должен учитывать `positioningData`.
   - Промежуточный прогресс сохраняется после каждого шага.
   - Шаги сегментов/подсегментов/запросов генерируются из роли эксперта проекта с 25-летним опытом в нише.
   - Шаги болезненных вопросов, сокровенных желаний, конечного результата и раздражителей пишутся из роли выбранного клиента, простым языком клиента.
   - Шаг 12 не должен содержать нишевые хардкоды вроде “после работы с психологом”.

3. **УТП**
   - Route: `/strategy/utp`

4. **Оформление соцсетей**
   - Route: `/strategy/social`

### Конструктор продуктов

Продуктовые разделы вынесены из блока “Стратегия” в отдельный блок бокового меню “Конструктор продуктов”.

1. **Основной продукт**
   - Route: `/products/main`
   - Флагманский продукт / основная программа.

2. **Мини-продукт**
   - Route: `/products/mini`
   - Быстрый входной платный продукт.

3. **Лид-магнит**
   - Route: `/products/lead-magnet`
   - Бесплатный вход в воронку.

Legacy routes `/strategy/product-main`, `/strategy/product-mini`, `/strategy/lead-magnet`, `/product-main`, `/product-mini`, `/product-free`, `/lead-magnet` редиректят на новые product routes.

### Диалог с ИИ

- Route: `/ai-dialog`
- Это отдельный пункт бокового меню, вынесен за пределы блока стратегии.
- Старые `/strategy/unpacking` и `/chat` редиректят сюда.
- Смысл раздела: прямой AI-маркетолог по проекту.
- Backend собирает контекст проекта через `buildAiDialogContext.ts`: проект, стратегия, прогресс, контент, задачи, история.

### Контент

- `/posts`
- `/reels`
- `/articles`
- `/video-scripts`
- `/chatbot-chains`
- `/content-plan`

### Операционные разделы

- `/dashboard`
- `/tasks`
- `/files/materials`
- `/files/products`
- `/history`
- `/settings`

### Админка

- Route: `/admin`
- Доступ только для роли `ADMIN`.
- Обычные пользователи не должны иметь доступ к admin API и admin UI.
- Реализовано:
  - dashboard метрик;
  - список пользователей;
  - карточка пользователя;
  - ручное создание пользователя;
  - ручная выдача PRO;
  - просмотр подписки;
  - payment source: `MANUAL`, `TRIBUTE`, `YOOKASSA`;
  - LTV;
  - activity events;
  - AI usage analytics.

## Backend API

Все основные API начинаются с `/api/v1`.

Ключевые группы:

- `/api/v1/auth`
- `/api/v1/projects`
- `/api/v1/ai/chat`
- `/api/v1/payments`
- `/api/v1/admin`
- `/api/v1/strategy/export-pdf`

### AI endpoint

`POST /api/v1/ai/chat`

Пример body:

```ts
{
  model: 'claude' | 'chatgpt',
  claudeModel?: string,
  section: string,
  message: string,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
  unpackingProfile?: Record<string, unknown>,
  projectName?: string,
  projectId?: string
}
```

Для `section: 'ai-dialog'` важно передавать `projectId`, чтобы backend собрал полный контекст проекта.

## AI и ограничения

- Anthropic Claude сейчас основной провайдер.
- OpenAI есть как альтернативный провайдер, если ключ настроен.
- Mock-ответы в пользовательских AI-разделах должны быть отключены или не использоваться как “успешная генерация”.
- При ошибке AI пользователь должен видеть toast с ошибкой связи, а раздел не должен подставлять старые демо-данные.
- Для free-пользователей есть backend paywall/лимиты AI.
- Используется логирование AI-запросов для аналитики.

## Prompt strategy

Основная стратегия зафиксирована в `docs/PROMPT_STRATEGY.md`, аудит текущих промптов — в `docs/PROMPTS_AUDIT.md`.

Ключевая логика ролей:

- `ai-dialog` — бизнес-стратег / маркетинг-стратег, смотрит на проект как на бизнес и помогает повышать прибыльность при минимальных лишних действиях.
- `positioning` — пока без сложного AI-фреймворка: простые поля, которые задают направление проекта.
- `audience` — главный фреймворк стратегии:
  - сегменты, топ-3 сегмента, подсегменты, “хочу”, запросы и топ-3 запроса — роль опытного эксперта в нише пользователя;
  - болезненные вопросы, сокровенные желания, конечный результат, “что бесит” — роль выбранного клиента.
- `utp` и `social` — маркетолог-стратег, задача: конвертировать холодную аудиторию в интерес/подписку/заявку.
- `product-main`, `product-mini`, `lead-magnet` — продуктовый маркетолог, задача: создавать продукты на основе найденного спроса в ЦА.
- Контентные разделы — сильный копирайтер/контент-маркетолог, который пишет на основе стратегии, ЦА, материалов и фактуры пользователя.

Важно: новые промпты не должны хардкодить психологию или любую другую нишу. Ниша всегда берется из позиционирования, ЦА и project materials.

## Project materials / Knowledge base

Сервис постепенно переводится на логику project materials: все важные результаты пользователя сохраняются как markdown-материалы и используются как knowledge base для следующих действий.

Ключевые материалы:

- `positioning.md`
- `audience.md`
- `utp.md`
- `social.md`
- `product-main.md`
- `product-mini.md`
- `lead-magnet.md`

`audience.md` сейчас содержит:

- стратегическое ядро для следующих разделов;
- выбранный сегмент;
- выбранный подсегмент;
- главный запрос;
- болезненные вопросы;
- сокровенные желания;
- конечный результат;
- раздражители клиента.

Материалы имеют:

- content;
- summary;
- `summaryStatus`;
- `linkedMaterialIds`;
- историю версий.

При редактировании/генерации разделов материал должен обновляться, а пользователь должен видеть UX-статус, что knowledge base актуален.

## Оплаты и доступы

Текущий режим — пилотный:

- Регистрация в production должна быть закрыта, если явно не включена через env.
- Доступы пользователям открываются вручную через админку.
- PRO можно выдавать вручную.
- YooKassa ветка должна быть выключена до реального запуска.
- Tribute/manual платежи используются как источник оплаты для пилота.

Важно: платежный webhook YooKassa не должен активировать подписки, пока `YOOKASSA_ENABLED=false`.

## Email

- Email verification реализована.
- Если SMTP не настроен, backend должен работать без падения и логировать ссылку в консоль.

## Prisma / DB

Основные сущности:

- `User`
- `Project`
- `VerificationToken`
- `Subscription`
- `Payment`
- `AIUsage`
- `AIRequestLog`
- `UserEvent`

Стратегические данные проекта хранятся в JSON-поле `Project.strategyData`.

Важные ключи внутри `strategyData`:

- `positioningData`
- `answers`
- `completed`
- `unpackingData`
- `progressFlags`
- `materialsData`

Миграции на сервере применять через:

```bash
cd /app/backend && npx prisma migrate deploy && npx prisma generate
```

## Frontend state

Zustand stores:

- `auth.store.ts` — пользователь, токены, сессия.
- `projects.store.ts` — проекты и `activeProjectId`.
- `progress.store.ts` — флаги прохождения стратегии, включая positioning/audience/utp/social.
- `audience.store.ts` — ответы и completed для ЦА по проектам.
- `unpacking.store.ts` — исторический store; часть данных может использоваться как профиль/контекст, но основной “чат распаковки” заменен на AI-диалог.
- `model.store.ts` — выбранные AI-модели по разделам.
- `materials.store.ts` — project materials / knowledge base, summary, links, versions, sync в `strategyData.materialsData`.
- `generated.store.ts` — сохраненные результаты УТП, соцсетей, продуктов и лид-магнита по проектам.
- `contentPlan.store.ts` — контент-план.
- `tasks.store.ts` — задачи.

## UI

- Интерфейс на русском.
- Основной фон светлый.
- Акцентный цвет: `#D4A847`.
- CSS Modules, без большой UI-библиотеки.
- Drag-and-drop: `@dnd-kit`.
- Пункт “Диалог с ИИ” в боковом меню визуально выделен.

## Важные файлы

Backend:

- `backend/src/controllers/ai.controller.ts`
- `backend/src/services/ai.service.ts`
- `backend/src/controllers/project.controller.ts`
- `backend/src/controllers/admin.controller.ts`
- `backend/src/services/payment.service.ts`
- `backend/src/services/ai-access.service.ts`
- `backend/src/utils/buildAiDialogContext.ts`
- `backend/prisma/schema.prisma`

Frontend:

- `frontend/src/App.tsx`
- `frontend/src/components/Layout/Layout.tsx`
- `frontend/src/pages/Positioning/Positioning.tsx`
- `frontend/src/pages/Strategy/Strategy.tsx`
- `frontend/src/pages/AiDialog/AiDialog.tsx`
- `frontend/src/pages/Admin/*`
- `frontend/src/api/projects.api.ts`
- `frontend/src/api/ai.ts`
- `frontend/src/hooks/useProjectMarketingContext.ts`
- `frontend/src/store/materials.store.ts`
- `frontend/src/store/generated.store.ts`
- `frontend/src/utils/projectMaterials.ts`
- `frontend/src/store/*`

Docs:

- `docs/PROMPTS_AUDIT.md`
- `docs/PROMPT_STRATEGY.md`

## Backlog: social context import

Цель: дать пользователю возможность подключить свои соцсети, чтобы LumaIQ сам проанализировал его реальный контент и дальше генерировал материалы в стиле конкретного эксперта.

### Telegram

MVP-логика:

- Создать бота, например `@luma_iq_bot`.
- Пользователь добавляет бота администратором в свой Telegram-канал.
- Backend получает новые публикации через Telegram Bot API webhook / updates `channel_post`.
- Новые посты сохраняются в БД как `SocialPost`.
- Для старой истории Bot API недостаточен: бот не может просто выкачать всю прошлую историю канала.
- Для старых постов MVP-вариант: пользователь экспортирует историю канала из Telegram Desktop в `.json` и загружает файл в LumaIQ.
- Позже можно рассмотреть Telegram Client API / MTProto для импорта старой истории, но это сложнее по безопасности и UX.

### Instagram

MVP-логика:

- В интерфейсе проекта кнопка `Подключить Instagram`.
- Пользователь проходит OAuth через Meta / Instagram.
- Основной поддерживаемый сценарий: Instagram Professional account — Business или Creator.
- Backend получает access token и подтягивает последние публикации аккаунта.
- Сохранять: caption, media type, timestamp, permalink, media url / thumbnail, raw metadata.
- Этого достаточно, чтобы AI понял темы, тональность, структуру постов, частые формулировки, офферы и CTA.
- Для Reels/video на первом этапе анализировать caption и metadata.
- Позже добавить скачивание/обработку видео и транскрибацию речи для анализа содержания Reels.

### Предлагаемые сущности

```text
SocialAccount
- id
- userId
- projectId
- provider: INSTAGRAM | TELEGRAM
- handle
- externalId
- accessTokenEncrypted
- refreshTokenEncrypted
- connectedAt
- status

SocialPost
- id
- socialAccountId
- providerPostId
- text
- mediaType
- url
- publishedAt
- metricsJson
- rawJson

ContentStyleProfile
- id
- projectId
- summary
- tone
- themesJson
- vocabularyJson
- contentPatternsJson
- audienceSignalsJson
- doDontJson
- examplesJson
- updatedAt
```

### AI-использование

- Импортировать последние 50-200 постов.
- Очистить текст от мусора, ссылок и дублей.
- Построить `ContentStyleProfile`.
- При генерации контента подмешивать:
  - краткий профиль стиля;
  - 3-7 релевантных примеров старых постов;
  - текущий контекст проекта.
- В генераторах добавить режим `Писать в стиле моих соцсетей`.

## Проверки перед завершением задачи

Минимум:

```bash
cd backend && npm run build
cd frontend && npm run build
```

После backend-деплоя:

```bash
curl -s -i https://api.lumaiq.ru/api/v1/health
```

После frontend-деплоя:

```bash
curl -s -i https://www.lumaiq.ru/
```

## Текущее состояние на 13.05.2026

Готово:

- Production домены подключены.
- Backend работает на Hetzner под PM2.
- Frontend работает на Vercel.
- Админка P0/P1 реализована.
- Закрыта production-регистрация.
- Реализованы manual PRO и ручное создание пользователей.
- Реализованы AI usage analytics, activity events, LTV, payment source.
- Реализован отдельный раздел “Диалог с ИИ”.
- Реализован первый шаг стратегии “Позиционирование”.
- Исправлено сохранение `positioningData`.
- ЦА подтягивает `positioningData` и сохраняет промежуточный прогресс.
- ЦА переведена на 13-шаговую логику с отдельным шагом “ТОП 3 запроса”.
- В ЦА добавлен чат с ИИ на каждом шаге в формате диалога.
- Исправлены критичные состояния ЦА: восстановление выбора после обновления, продолжение после ручного варианта, порядок сообщений в чате, выбор запроса из актуального топ-3.
- PDF после ЦА скачивается, но качество/шаблон еще требует дальнейшей проверки.
- УТП, соцсети, основной продукт, мини-продукт и лид-магнит используют контекст позиционирования, ЦА и project materials, а не мок-ответы.
- Реализован project materials / knowledge base: сохранение материалов, AI-summary, связи между материалами, версии, UX-статус обновления.
- Созданы документы `docs/PROMPTS_AUDIT.md` и `docs/PROMPT_STRATEGY.md`.
- P0 по промптам ЦА выполнен: `buildStepPrompt` разделяет роли “эксперт” и “клиент”, убран хардкод про психолога, усилены форматы ответов, обновлен `audience.md`.

Ближайшие важные задачи:

- Протестировать свежую логику ЦА на нескольких нишах: не психолог, B2B, эксперт, сервисный бизнес.
- Дальше проработать промпты УТП и оформления соцсетей по стратегии из `docs/PROMPT_STRATEGY.md`.
- Затем проработать промпты основного продукта, мини-продукта и лид-магнита.
- Потом обновить промпты контентных разделов: посты, рилсы, статьи, видео-сценарии, цепочки сообщений.
- Проверить весь путь пилотного пользователя: ручное создание → вход → позиционирование → ЦА → УТП → продукты → контент.
- Улучшить backend paywall по конкретным действиям/разделам.
- Добавить импорт контекста из Telegram и Instagram: подключение аккаунтов, импорт постов, анализ стиля.
- Добавить phone SMS verification и Telegram linking позже.
- Перед реальным запуском оплаты включить и заново проверить YooKassa webhook.
