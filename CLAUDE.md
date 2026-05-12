# LumaIQ — актуальный контекст проекта

## Что это

**LumaIQ** — SaaS-сервис для маркетинговой упаковки экспертов, в первую очередь психологов, нутрициологов, коучей и фитнес-тренеров. Сервис помогает пройти путь от базового позиционирования и анализа целевой аудитории до УТП, продуктовой линейки, контент-плана и AI-материалов.

Главная логика продукта: пользователь ведет проект внутри сервиса, а AI-маркетолог знает контекст проекта и помогает принимать решения по упаковке, стратегии, воронке и контенту.

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

2. **Целевая аудитория** — 12-шаговая AI-проработка ЦА.
   - Route: `/strategy/audience`
   - Данные сохраняются в `project.strategyData.answers` и `audience-store-v1`.
   - AI-промпт должен учитывать `positioningData`.
   - Промежуточный прогресс сохраняется после каждого шага.

3. **УТП**
   - Route: `/strategy/utp`

4. **Оформление соцсетей**
   - Route: `/strategy/social`

5. **Продукты**
   - Routes: `/strategy/product-main`, `/strategy/product-mini`, `/strategy/lead-magnet`

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
- `frontend/src/store/*`

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

## Текущее состояние на 11.05.2026

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

Ближайшие важные задачи:

- Доработать качество AI-промптов ЦА на основе позиционирования.
- Проверить весь путь пилотного пользователя: ручное создание → вход → позиционирование → ЦА → УТП → продукты → контент.
- Улучшить backend paywall по конкретным действиям/разделам.
- Добавить импорт контекста из Telegram и Instagram: подключение аккаунтов, импорт постов, анализ стиля.
- Добавить phone SMS verification и Telegram linking позже.
- Перед реальным запуском оплаты включить и заново проверить YooKassa webhook.
