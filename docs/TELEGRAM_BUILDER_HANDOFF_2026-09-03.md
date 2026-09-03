# Telegram-конструктор: handoff этапов 0–4

Дата: 2026-09-03
Статус: локальный foundation принят; изолированная migration/worker-проверка пройдена
Production: не изменён

## Граница результата

В handoff входят:

- `ScenarioDefinitionV1` и его backend-валидация;
- additive Prisma-модели и две миграции;
- tenant-scoped management API нескольких пользовательских Telegram-ботов;
- AES-256-GCM keyring для bot tokens и redaction;
- per-bot webhook identity, secret verification и update deduplication;
- frontend-раздел «Мои боты» и сохранённый legacy-раздел цепочек;
- deterministic Runtime v1, PostgreSQL jobs и отдельный worker;
- `/start`, deep link, keyword, `/stop`, block/unblock;
- text, wait, tags, fields, simple conditions, goals, handoff,
  `collect_input` prompt и end;
- lease, optimistic locking, retries/backoff, `retry_after` и dead status.

В handoff не входят изменения голосового ввода, раздела «ТГ-канал», Threads,
лендинга и другие файлы, находящиеся в общей рабочей копии.

## Проверки

- `npx prisma validate` — passed;
- `npx prisma generate` — passed;
- backend `npm run build` — passed;
- профильные Telegram tests — 43 passed;
- frontend `npm run type-check` — passed;
- frontend `npm run lint -- --quiet` — passed;
- frontend `npm run build` — passed;
- полный backend suite — 509 passed, 1 skipped, 1 unrelated failure.
- clean PostgreSQL migration — 38/38 migrations applied;
- `prisma migrate status` на изолированной БД — schema up to date;
- Runtime с `TELEGRAM_RUNTIME_V2_ENABLED=false` — безопасно завершился;
- Runtime с включённым flag на пустой очереди — worker started, recovered 0/0/0.

Единственное падение полного suite:

`tests/unit/provider-boundary.test.ts` обнаруживает прямой OpenAI URL в
`controllers/semeyno-ai-relay.controller.ts`. Эта проблема существовала до
Telegram-этапов и вынесена в общий P0 backlog.

## Что намеренно не включено

- production migration;
- production encryption keys;
- включение `TELEGRAM_RUNTIME_V2_ENABLED`;
- запуск Telegram worker в PM2;
- переключение webhook реального пользовательского бота;
- scenario CRUD/publish/test API;
- callback transitions, ответы `collect_input`, media и runtime analytics;
- AI Builder и рабочее пространство сценария.

## Следующий безопасный шаг

Изолированная migration/worker-проверка выполнена. Для завершения A1 осталось:

1. Получить отдельный тестовый Telegram-бот, не используемый в production.
2. Задать тестовый keyring и webhook base URL через secrets.
3. Запустить runtime только с feature flag на этом тестовом боте.
4. Пройти live E2E `token -> webhook -> /start -> subscriber -> enrollment -> delivery`.
5. Проверить webhook rollback через `deleteWebhook`, не удаляя записи БД.

Системный `@lumaiq_ai_bot` не должен использовать `TelegramBot` или
`BotSubscriber`: его identity и webhook создаются отдельным пакетом согласно
единой Telegram-дорожной карте.
