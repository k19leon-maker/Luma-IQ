# Telegram-конструктор: handoff этапов 0–4 и live E2E

Дата: 2026-09-05
Статус: локальный foundation принят; live E2E и безопасная часть Runtime A2 пройдены
Production: не изменён

## Граница результата

В handoff входят:

- `ScenarioDefinitionV1` и его backend-валидация;
- additive Prisma-модели и четыре миграции;
- tenant-scoped management API нескольких пользовательских Telegram-ботов;
- AES-256-GCM keyring для bot tokens и redaction;
- per-bot webhook identity, secret verification и update deduplication;
- frontend-раздел «Мои боты» и сохранённый legacy-раздел цепочек;
- deterministic Runtime v1, PostgreSQL jobs и отдельный worker;
- `/start`, deep link, keyword, `/stop`, block/unblock;
- text, wait, tags, fields, simple conditions, goals, handoff,
  `collect_input`, callback-переходы и end;
- lease, optimistic locking, retries/backoff, `retry_after` и dead status.
- идемпотентный `answerCallbackQuery`;
- проверка и сохранение text/email/phone/number/choice ответов;
- persistent proactive rate limiter глобально, по bot и chat;
- tenant-scoped `BotEvent` для запусков, шагов, кликов, ответов, целей,
  отправок, stop/block и ошибок без хранения текста ответов.
- admin-only recovery для `DEAD` inbound и однозначно безопасных delivery jobs;
  доставка с неизвестным исходом не может быть повторена через API.

В handoff не входят изменения голосового ввода, раздела «ТГ-канал», Threads,
лендинга и другие файлы, находящиеся в общей рабочей копии.

## Проверки

- `npx prisma validate` — passed;
- `npx prisma generate` — passed;
- backend `npm run build` — passed;
- профильные Telegram tests — 53 passed;
- frontend `npm run type-check` — passed;
- frontend `npm run lint -- --quiet` — passed;
- frontend `npm run build` — passed;
- полный backend suite — 523 passed, 1 skipped, 1 unrelated failure.
- clean PostgreSQL migration — 40/40 migrations applied;
- `prisma migrate status` на изолированной БД — schema up to date;
- Runtime с `TELEGRAM_RUNTIME_V2_ENABLED=false` — безопасно завершился;
- Runtime с включённым flag на пустой очереди — worker started, recovered 0/0/0.
- отдельный тестовый бот `@lumaiq_dev_bot` прошёл `getMe` и регистрацию с
  зашифрованным token storage;
- временный Cloudflare Quick Tunnel открывал только точный webhook тестового
  бота через ограниченный локальный proxy;
- live E2E `token -> webhook -> /start -> subscriber -> enrollment -> delivery`
  пройден: inbound `PROCESSED`, subscriber `ACTIVE`, enrollment `COMPLETED`,
  delivery `SENT` с первой попытки и без runtime errors;
- live E2E `start -> callback -> collect_input(email) -> completion` пройден
  2026-09-05 на `@lumaiq_dev_bot`: четыре inbound updates обработаны с первой
  попытки, callback подтверждён, email провалидирован и сохранён, три delivery
  получили `SENT` с первой попытки, создано 10 runtime events, дублей нет;
- cross-tenant live E2E пройден 2026-09-05 на двух владельцах и двух отдельных
  ботах `@lumaiq_dev_bot` и `@dleonid_bot`: оба сценария `/start -> callback ->
  collect_input(email) -> completion` завершены, шесть inbound updates
  обработаны с первой попытки, шесть delivery получили `SENT` с первой попытки;
  ownership mismatches и дубли idempotency key отсутствуют, тестовые email
  сохранены только в своих subscriber-контурах;
- из-за сетевой блокировки исходящего Cloudflare/localtunnel трафика повторный
  тест входящих updates использовал временный `getUpdates` poller до того же
  локального webhook; публичный webhook был отдельно доказан предыдущим E2E;
- webhook после проверки удалён через `deleteWebhook`, очередь пуста, tunnel,
  worker, backend и одноразовая PostgreSQL-база остановлены;
- production token, production DB, PM2 и production webhook не изменялись.

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
- новые миграции `BotEvent` и rate limiter не применялись к production;
- scenario CRUD/publish/test API;
- media delivery из защищённого бинарного storage;
- AI Builder и рабочее пространство сценария.

## Следующий безопасный шаг

Live E2E пакета A1 выполнен. Callback/input, rate limiting, runtime events и
admin recovery из пакета A2 реализованы локально. Все 40 миграций применены на
чистой одноразовой PostgreSQL. Следующий безопасный шаг:

1. добавить защищённое бинарное storage и только после этого включить
   `send_media`; текущий `ProjectFile` хранит извлечённый текст, а не файл;
2. подготовить production rollout миграций и worker как отдельную операцию с
   backup, rollback и выключенным по умолчанию feature flag.

Локальные ownership-тесты и cross-tenant live-проверка двух владельцев и двух
отдельных ботов пройдены. Временный тестовый контур после проверки остановлен;
production не изменялся.

Системный `@lumaiq_ai_bot` не должен использовать `TelegramBot` или
`BotSubscriber`: его identity и webhook создаются отдельным пакетом согласно
единой Telegram-дорожной карте.
