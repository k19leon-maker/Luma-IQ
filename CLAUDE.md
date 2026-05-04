# LumaIQ — Контекст проекта

## Описание

**LumaIQ** — SaaS-платформа для маркетинговой упаковки психологов на основе JTBD-фреймворка. Помогает психологам структурировать услуги, создавать продуктовую линейку и генерировать маркетинговые материалы с помощью ИИ.

## Стек технологий

| Слой | Технологии |
|------|-----------|
| Frontend | React 18, TypeScript, CSS Modules, Vite |
| Backend | Node.js, Express, TypeScript |
| База данных | PostgreSQL (основная), Redis (кэш / очереди) |
| Аутентификация | JWT (access + refresh tokens), Google OAuth 2.0 |
| Очереди | Bull (Redis-based) — для AI-задач |

## Основные модули

1. **Стратегия (распаковка по JTBD)** — диалоговый чат с AI-маркетологом, профиль эксперта
2. **Продукты КПТ** — трёхуровневая продуктовая линейка (лид-магнит / мини / основной)
3. **Генерация контента** — AI-генерация постов, рилсов, статей, видео-сценариев, цепочек
4. **Целевая аудитория** — 12-шаговый анализ ЦА с выбором сегментов
5. **Контент-план** — Kanban по дням недели с drag-and-drop
6. **План задач** — Kanban с 4 колонками и drag-and-drop

## ИИ-интеграции

Активные (API-ключи настроены, реальные запросы работают):
- **Anthropic Claude** — `@anthropic-ai/sdk` — основной провайдер
- **OpenAI (ChatGPT)** — `openai` npm package — альтернативный провайдер (ключ закомментирован в .env)

Неактивные (закомментированы):
- Google Gemini, Grok (xAI), Nano Banana Pro

### AI endpoint
- `POST /api/v1/ai/chat` — универсальный endpoint
- Body: `{ model, claudeModel, section, message, conversationHistory, unpackingProfile?, projectName? }`
- Dev-token авторизация: `Authorization: Bearer dev-token` (только в NODE_ENV=development)
- Возвращает: `{ content: string, mock: boolean }`

### Выбор модели (frontend)
- `frontend/src/store/model.store.ts` — хранит выбранную модель per-section в localStorage
- Ключи: `selectedModel_${section}`, `sectionSettings_${section}`
- Дефолты по секциям: unpacking→opus-4-6, audience/utp/social/products→sonnet-4-6, контент→haiku-4-5

## UI/UX

- **Светлая тема** — белый фон (`#ffffff`), поверхности `#F5F4F0`
- **Акцентный цвет: `#D4A847`** (золотой) — кнопки, ссылки, выделения
- Язык интерфейса: русский
- CSS-переменные в `:root` (`frontend/src/styles/variables.css`)
- CSS Modules для компонентов (без UI-библиотек)
- `@dnd-kit/core` + `@dnd-kit/sortable` — drag-and-drop (Kanban)

## Структура директорий

```
/lumaiq
  /frontend
    /src
      /components    — переиспользуемые UI-компоненты
      /pages         — страницы приложения
      /hooks         — кастомные React-хуки
      /api           — клиент для запросов к backend (axios)
      /store         — глобальное состояние (zustand)
      /styles        — глобальные CSS-переменные и сбросы
      /config        — конфиги (jtbd-steps, strategy-prompts)
  /backend
    /src
      /routes        — Express-роутеры
      /controllers   — обработчики запросов
      /services      — бизнес-логика (ai.service.ts — главный)
      /middleware    — auth, validation, error handling
      /utils         — вспомогательные функции
  /docs              — документация API и архитектуры
```

## Соглашения

- API эндпоинты: `/api/v1/...`
- Переменные окружения: `.env` (не коммитить, есть `.env.example`)
- Все тексты интерфейса — на русском языке
- Backend порт: `3001`, Frontend dev-сервер: `5174`

## Архитектурные паттерны

### Zustand stores (актуальный список)
- `auth.store.ts` — пользователь, токены, isAuthenticated
- `projects.store.ts` — список проектов, activeProjectId, currentProject (key: `lumaiq-projects-v4`)
- `progress.store.ts` — 4 флага завершения стратегии: unpackingCompleted, audienceCompleted, utpCompleted, socialCompleted (key: `lumaiq-progress`)
- `unpacking.store.ts` — per-project: messages, qAnswers, profileData, positioning (key: `unpacking-store-v2`)
- `audience.store.ts` — per-project: answers, completed (key: `audience-store-v1`)
- `model.store.ts` — выбранная AI-модель per-section (localStorage, не persist-middleware)
- `contentPlan.store.ts` — карточки контент-плана
- `tasks.store.ts` — задачи (если используется, иначе локальный state в Tasks.tsx)

### Fallback при недоступном бэкенде
- `addProject` в projects.store.ts создаёт проект локально (UUID) если API недоступен
- Все AI-разделы имеют catch-блок с mock-данными и toast-уведомлением

### Прогресс и блокировки
- 4 флага в progress.store.ts: `unpackingCompleted`, `audienceCompleted`, `utpCompleted`, `socialCompleted`
- Разделы стратегии блокируются пока не завершён предыдущий этап (иконка 🔒 в сайдбаре)
- Завершение: `completeUnpacking()` / `completeAudience()` / `completeUtp()` / `completeSocial()`

### Маршрутизация
- `/dashboard` — главная страница (DashboardEmpty / InProgress / Complete в зависимости от прогресса)
- `/strategy/unpacking` — распаковка (чат с AI)
- `/strategy/audience` — целевая аудитория
- `/strategy/utp` — УТП
- `/strategy/social` — оформление соцсетей
- `/strategy/product-main`, `/strategy/product-mini` — продукты
- `/strategy/lead-magnet` — лид-магнит
- `/tasks` — план задач (kanban)
- `/content-plan` — контент-план
- `/posts`, `/reels`, `/articles`, `/video-scripts`, `/chatbot-chains` — контент
- `/files/materials`, `/files/products` — мои файлы
- `/history` — история генераций
- `/settings` — настройки профиля

### AI в страницах — паттерн вызова
```ts
const settings = useModelStore((s) => s.getSettings('section-name'));
const resp = await aiApi.chat({
  model:               settings.provider === 'claude' ? 'claude' : 'chatgpt',
  claudeModel:         settings.claudeModel,
  section:             'section-name',
  message:             prompt,
  conversationHistory: history,
  projectName,
  unpackingProfile:    profileData,
});
```

### PDF-экспорт (backend)
- Скрипт: `backend/src/utils/generate_strategy_pdf.py` (reportlab)
- Маршрут: `POST /api/v1/strategy/export-pdf` (requireAuth)
- Frontend: `frontend/src/api/strategy.api.ts` → `downloadStrategyPdf(projectName, answers)`

## Текущий статус разработки

### Статус на 04.05.2026

### Готово ✅

ИНФРАСТРУКТУРА:
- Backend: Express + Node.js на порту 3001 (запускать: `cd backend && npm run dev`)
- Frontend: React + TypeScript + Vite на порту 5174 (запускать: `cd frontend && npm run dev`)
- TypeScript компилируется без ошибок (`npx tsc --noEmit`)
- Docker + PostgreSQL + Redis (для полного запуска — `docker compose up -d`)
- Prisma 7 с adapter-pg, миграции применены

АВТОРИЗАЦИЯ:
- Login, Register, PrivateRoute
- Dev-режим: кнопка "Войти как тестовый пользователь" (dev-token)
- Онбординг при первом входе (4 шага)

ПРОЕКТЫ:
- CRUD через API + БД, fallback на локальный UUID если сервер недоступен
- Переключение в сайдбаре, имя активного проекта отображается на дашборде
- При смене проекта audience.store сбрасывает состояние ЦА

AI — РЕАЛЬНЫЕ ЗАПРОСЫ (подключены и работают):
- Anthropic API ключ в .env, `mock: false` при успешном ответе
- **Распаковка** (`/strategy/unpacking`) — чат с Claude, история диалога передаётся
- **Целевая аудитория** (`/strategy/audience`) — 12 шагов, реальный AI + mock fallback
- **УТП** (`/strategy/utp`) — генерация и улучшение УТП через Claude
- **Соцсети** (`/strategy/social`) — отдельный промпт для Instagram / Telegram / ВКонтакте
- **Основной продукт** (`/strategy/product-main`) — JSON-ответ от Claude
- **Мини-продукт** (`/strategy/product-mini`) — JSON-ответ от Claude
- **Лид-магнит** (`/strategy/lead-magnet`) — JSON-ответ от Claude
- **Посты, Рилсы, Статьи, Видео, Цепочки** — реальный AI + mock fallback

НАВИГАЦИЯ / LAYOUT:
- Светлый сайдбар, акцент #D4A847
- 7 подпунктов стратегии с lock/unlock логикой
- Динамический баннер на заблокированных страницах

ПЛАН ЗАДАЧ (`/tasks`):
- 4-колоночный Kanban: Все / Сегодня / На неделе / Выполнено
- Drag-and-drop между колонками через @dnd-kit
- Галочка для быстрого выполнения + toast
- Добавление задач с категорией и приоритетом

КОНТЕНТ-ПЛАН (`/content-plan`):
- Kanban по дням недели с drag-and-drop
- Статусы: Черновик / Готов / Опубликован

ИСТОРИЯ (`/history`):
- Список генераций из БД, фильтры, боковая панель

НАСТРОЙКИ (`/settings`):
- Профиль, выбор AI-модели по умолчанию (Claude / ChatGPT), смена пароля

ЭКСПОРТ:
- .docx через библиотеку `docx`
- Копирование во всех разделах

### Следующие шаги 🔜

КРИТИЧНО:
- Разобраться почему в Распаковке AI иногда не отвечает (возможно CORS или бэкенд не запущен)
- Сохранять answers из Распаковки и ЦА в БД (сейчас только в localStorage / unpacking.store)

ВАЖНО:
- Email-верификация при регистрации
- Подключение оплаты (ЮКасса / Robokassa)
- Деплой: фронтенд на Timeweb/Selectel, бэкенд на Hetzner

ОТЛОЖЕНО:
- Telegram Bot Builder
- Обучение / курсы
- Командная работа
- Аналитика использования
