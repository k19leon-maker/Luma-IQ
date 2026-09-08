# Telegram-конструктор: handoff Runtime A2 и Scenario API A3

Дата: 2026-09-08
Статус: Runtime A2, Scenario API A3, AI Builder A4 и workspace A5 развёрнуты;
runtime canary ограничен одним ботом
Production: commit `4fb2a5c`, worker запущен только для `@lumaiq_dev_bot`

## Граница результата

В handoff входят:

- `ScenarioDefinitionV1` и его backend-валидация;
- additive Prisma-модели и миграции;
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
- закрытый PostgreSQL-backed `BotAsset` с tenant/project scope, MIME/size/signature
  guards и SHA-256 integrity check;
- приватный asset API и runtime `send_media` для image/document/video/audio без
  публичных файловых URL и без бинарных данных в scenario/delivery JSON.
- tenant-scoped Scenario API: list/create/read/update/archive;
- draft autosave с optimistic locking по `versionId + updatedAt`;
- immutable published version, новая draft version, publish, pause и rollback;
- обязательная backend-валидация структуры, media ownership и конфликтов
  опубликованных trigger;
- test run только после одноразового подтверждения Telegram ID владельца через
  private-chat deep link; recipient ID не принимается от клиента;
- служебный namespace `luma_test_` не может провалиться в обычный `/start` даже
  для просроченной или уже использованной ссылки;
- точный `start_parameter` имеет приоритет над общим `/start` между сценариями.

В handoff не входят изменения голосового ввода, раздела «ТГ-канал», Threads,
лендинга и другие файлы, находящиеся в общей рабочей копии.

## Проверки

- `npx prisma validate` — passed;
- `npx prisma generate` — passed;
- backend `npm run build` — passed;
- ESLint изменённых A3 backend-файлов — passed без ошибок;
- профильные Telegram tests после A3 — 89 passed в 17 файлах;
- профильные Telegram tests — 53 passed;
- frontend `npm run type-check` — passed;
- frontend `npm run lint -- --quiet` — passed;
- frontend `npm run build` — passed;
- полный backend suite — 523 passed, 1 skipped, 1 unrelated failure.
- clean PostgreSQL migration после media storage — 41/41 migrations applied;
- Telegram regression после media storage — 73 passed;
- binary DB smoke: roundtrip passed, cross-tenant и wrong-project guards passed;
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
- live E2E `send_media` пройден 2026-09-07 на `@lumaiq_dev_bot` через
  одноразовую PostgreSQL с 41 миграцией: image, document, video и audio
  доставлены по одному разу, каждая delivery получила `SENT` с первой попытки,
  inbound получил `PROCESSED`, enrollment — `COMPLETED`, runtime errors нет;
- из-за сетевой блокировки исходящего Cloudflare/localtunnel трафика повторный
  тест входящих updates использовал временный `getUpdates` poller до того же
  локального webhook; публичный webhook был отдельно доказан предыдущим E2E;
- webhook после проверки удалён через `deleteWebhook`, очередь пуста, tunnel,
  worker, backend и одноразовая PostgreSQL-база остановлены;
- перед production migration создан и проверен backup
  `/app/backups/pre-telegram-media-20260907-093158.dump`, SHA-256
  `3a33620b9aad81c9a37e65bde60b9aa43331400bf3a39825b256cf3b74af6525`;
- 2026-09-07 production backend обновлён до `9ee774e`, все 41 migration имеют
  статус up to date, API health `200`, защищённый Telegram management API без
  сессии возвращает `401`, PM2 `lumaiq-backend` online;
- production backend обновлён до `017fad6`; настроены отдельный AES keyring и
  webhook base URL, а allowlist runtime ограничен одним внутренним ID тестового
  бота без wildcard;
- отдельный PM2-процесс `lumaiq-telegram-worker` запущен и сохранён, startup
  подтвердил `botScope: 1`, ошибок и рестартов нет;
- production canary 2026-09-07 на `@lumaiq_dev_bot` пройден через публичный
  webhook `api.lumaiq.ru`: inbound `PROCESSED` за одну попытку, enrollment
  `COMPLETED`, image/document/video/audio получили `SENT` за одну попытку;
- Telegram `getWebhookInfo`: очередь пуста, последней ошибки нет; чужих inbound
  и delivery в production не создано, backend health возвращает `200`;
- временный файл с token, canary-скрипты и тестовые media после проверки удалены;
  token сохранён только в зашифрованном поле production БД.
- перед rollout A3 создан и проверен backup
  `/app/backups/pre-telegram-a3-20260907-173608.dump`, SHA-256
  `eaf6f94ff9f18d1426eceaa9cec24189a04c5502a4bf18665d97cbe0dcf22189`;
- production обновлён до `7ad8ae4`, migration
  `20260907153000_add_bot_scenario_version_updated_at` применена, 42/42 migration
  up to date, backend build и health прошли;
- HTTP-canary на `@lumaiq_dev_bot` прошёл create, autosave, publish, pause,
  new version, republish, rollback и archive; две published definition остались
  неизменными, тестовый сценарий архивирован, Telegram-сообщения не отправлялись;
- после canary очереди inbound/delivery пусты, активных canary-сценариев нет,
  error-логи не менялись после рестарта; внешний Scenario API без JWT вернул 401;
- runtime allowlist после rollout содержит ровно один bot ID и не содержит `*`.
- перед rollout A4/A5 создан и проверен backup
  `/app/backups/lumaiq-pre-chatbot-ai-builder-20260908-112247.dump`, SHA-256
  `c5a2c526a7e8cd909207d8dd33a81e83b704be78b6793c09f6ed8b2c7544ff30`;
- production backend и frontend обновлены до `4fb2a5c`; 42/42 migrations up to
  date, backend/deep health и `https://www.lumaiq.ru` возвращают `200`;
- Vercel deployment `dpl_6nCoxkUPyhXrTUbqBK9GRia2bcgW` назначен alias
  `https://www.lumaiq.ru`;
- авторизованный production canary AI Builder прошёл quote → generate → strict
  validation → apply draft → publish → pause → archive на `@lumaiq_dev_bot`;
- действие `chatbot_scenario` списало ровно 30 AI-баллов: баланс изменился с
  2000 до 1970, generation `SUCCEEDED`, reserve 30 полностью captured, refund 0;
- owner test recipient подтверждён через одноразовый deep link; production
  test run прошёл на `@lumaiq_dev_bot`: delivery `SENT` с первой попытки,
  enrollment `COMPLETED`; изолированный manual-only сценарий затем остановлен
  и архивирован;
- временный production canary script удалён после проверки.

Полный backend suite после A3: 550 passed, 1 skipped, 1 unrelated failure.
Единственное падение полного suite:

`tests/unit/provider-boundary.test.ts` обнаруживает прямой OpenAI URL в
`controllers/semeyno-ai-relay.controller.ts`. Эта проблема существовала до
Telegram-этапов и вынесена в общий P0 backlog.

## Что намеренно не включено

- wildcard-доступ runtime для всех пользовательских ботов;
- подключение production-ботов реальных пользователей;
- миграция и удаление legacy-раздела `Цепочки`;
- расширение runtime allowlist за пределы `@lumaiq_dev_bot`.

## Рабочее пространство A5

В production доступен frontend-маршрут `/app/chatbot-scenarios`: список
сценариев выбранного бота и проекта, создание черновика, структурный редактор
сообщений/задержек/кнопок/переходов, autosave через optimistic locking,
публикация, пауза, rollback и server-side test recipient. Legacy-экран
`Цепочки (legacy)` не изменён. API lifecycle, AI Builder и Telegram test run
проверены production canary. Test recipient принимается только после
server-side подтверждения личного Telegram ID владельца.

## Следующий безопасный шаг

Пакеты A1–A5 развёрнуты; пакет A6 реализован и локально проверен, но ещё не
развёрнут в production. Production runtime остаётся ограничен
`@lumaiq_dev_bot`. Owner test recipient и изолированный Telegram test run
пройдены. Следующий безопасный шаг — контролируемый rollout A6 для закрытой
beta с backup и smoke-проверкой owner-scoped API. Искусственный provider failure в production
не инъецировался: release reserve покрыт автоматическими тестами, а успешный
production run подтвердил reserve/capture и итоговый баланс.

Системный `@lumaiq_ai_bot` не должен использовать `TelegramBot` или
`BotSubscriber`: его identity и webhook создаются отдельным пакетом согласно
единой Telegram-дорожной карте.
## AI Builder — обновление 2026-09-08

- Добавлены workflow `chatbot.builder`: `discover`, `generate`, `edit`,
  `validate`, `copy`, `explain`.
- Генерация использует server-owned контекст проекта и общий AI runtime/billing.
- Результат AI никогда не сохраняется автоматически: сначала показывается
  proposal и diff, затем пользователь явно применяет его к mutable draft.
- Proposal проходит строгую schema- и graph-валидацию `ScenarioDefinitionV1`.
- Published version не изменяется; для неё сначала требуется новая draft version.
- История AI Builder изолирована от общего AI-диалога и хранит последние
  сообщения отдельно для каждого сценария в текущем браузере. Полные workflow
  runs/artifacts сохраняются серверной AI-инфраструктурой.
- Secrets и Telegram bot token не передаются в prompt; добавлены проверки
  prompt injection и secret exclusion.

## Подписчики и аналитика — обновление 2026-09-08

- Добавлен owner-scoped API списка, карточки прохождения, 30-дневной аналитики
  и CSV-экспорта для выбранного Telegram-бота.
- Тестовые enrollment с `source=owner_test` исключены из рабочих показателей.
- Карточка не возвращает Telegram user/chat ID, телефон или email.
- Метрики разделяют успешную отправку Telegram и ошибки; read/open rate не
  вычисляется, потому что Telegram Bot API не предоставляет receipt чтения.
- CSV защищён от formula injection, ограничен 10 000 строками и оставляет
  audit-событие. Добавлены проверки двух владельцев и guessed-resource access.
