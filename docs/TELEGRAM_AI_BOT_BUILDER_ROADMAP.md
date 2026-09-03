# Luma IQ: AI-конструктор Telegram-ботов

Статус: продуктовая и техническая дорожная карта
Дата: 2026-07-29

## 1. Цель продукта

Добавить в B2B-контур Luma IQ раздел, в котором пользователь описывает будущего Telegram-бота обычными словами, а ИИ:

1. уточняет цель и недостающие условия;
2. использует контекст выбранного проекта;
3. проектирует сценарий в структурированном виде;
4. показывает понятную схему и предпросмотр;
5. валидирует сценарий;
6. после подтверждения публикует его в подключённого пользователем Telegram-бота;
7. поддерживает исполнение сценариев, сбор подписчиков и выгрузку лидов в персональную Google-таблицу.

Один пользователь может подключить несколько Telegram-ботов. Один бот может содержать несколько сценариев. Один сценарий может иметь несколько опубликованных версий, но в каждый момент исполняется только явно опубликованная версия.

## 2. Продуктовые границы

### Входит в MVP

- подключение нескольких Telegram-ботов по токену BotFather;
- проверка токена и автоматическая установка webhook;
- отдельная изоляция данных и секретов каждого пользователя;
- создание сценария через диалог с ИИ;
- использование контекста проекта: эксперт, позиционирование, ЦА/JTBD, кастдевы, УТП, продукты и лид-магниты;
- текст, фото/документ, кнопки, ссылки, ветвление по кнопкам, ожидание, теги, переменные;
- команды `/start`, deep links с параметром `start`, ключевые слова и callback-кнопки как точки входа;
- несколько сценариев на одного бота;
- черновик, предпросмотр, тестовый режим, публикация, пауза и новая версия;
- карточка подписчика и история прохождения сценария;
- экспорт/синхронизация лидов в отдельную Google-таблицу пользователя;
- базовые метрики: входы, доставленные сообщения, клики, прохождение шагов, ошибки, конверсия в целевое действие;
- журнал технических событий и повторная доставка при временных ошибках.

### Не входит в первый MVP

- свободный AI-агент, который сам меняет опубликованный бот в production;
- полноценная CRM с продажами, сделками и телефонией;
- визуальный no-code редактор уровня ManyChat;
- платежи Telegram Stars, рассылки по произвольным сегментам, Mini Apps;
- сложные интеграции с внешними CRM;
- группы, каналы, inline mode и модерация сообществ;
- произвольный пользовательский JavaScript или HTTP-код;
- автоматическая массовая миграция ботов из других платформ.

Эти функции стоит добавлять только после проверки основного сценария: «описал словами → проверил → опубликовал → получил лидов».

## 3. Главный архитектурный принцип

ИИ не должен напрямую управлять production-ботом и выполнять произвольные действия.

Система состоит из двух слоёв:

1. **AI Builder** превращает диалог в ограниченную декларативную спецификацию сценария.
2. **Deterministic Runtime** валидирует и исполняет только поддерживаемые типы узлов опубликованной версии.

Перед публикацией пользователь всегда видит план изменений и явно подтверждает публикацию. Любое последующее изменение создаёт новый черновик/версию. Это даёт воспроизводимость, откат, аудит и защищает от непредсказуемого поведения модели.

## 4. Пользовательский путь

### Подключение бота

1. Пользователь открывает «Telegram-боты».
2. Нажимает «Подключить бота».
3. Вставляет токен, полученный у BotFather.
4. Backend вызывает `getMe` и `getWebhookInfo`.
5. Пользователь видит имя и username бота и подтверждает подключение.
6. Backend шифрует токен, создаёт уникальный webhook secret и вызывает `setWebhook`.
7. Система делает контрольный запрос `getWebhookInfo` и показывает статус «Подключён».

Токен после сохранения больше не показывается. Доступны действия «Проверить», «Заменить токен», «Отключить» и «Удалить».

### Создание сценария

1. Пользователь выбирает бота и проект Luma IQ.
2. Пишет, например: «Сделай воронку на мой лид-магнит. После выдачи прогревай три дня и приглашай на консультацию».
3. ИИ получает только релевантный контекст проекта.
4. ИИ задаёт только критически важные уточнения: точка входа, оффер, расписание, согласие на данные, целевое действие.
5. ИИ создаёт структурированный сценарий и кратко объясняет логику.
6. Пользователь продолжает правки обычными словами: «Второе сообщение отправь через день», «добавь кнопку», «для родителей подростков сделай другую ветку».
7. Каждая AI-правка формируется как diff к текущему черновику, а не как новый несвязанный результат.
8. Пользователь открывает предпросмотр, запускает тест на своём Telegram-аккаунте и публикует.

### Работа подписчика

1. Подписчик запускает бота или приходит по deep link.
2. Runtime определяет бота и точку входа.
3. Создаёт/обновляет подписчика и его согласия.
4. Запускает экземпляр опубликованного сценария.
5. Отправляет сообщения и планирует отложенные шаги.
6. Обрабатывает кнопки, текстовые ответы, таймауты и переходы.
7. Пишет изменения в CRM-таблицу и внутреннюю карточку лида.

## 5. Сценарная модель MVP

### Поддерживаемые узлы

- `trigger`: `/start`, start-параметр, ключевое слово, ручной запуск;
- `send_message`: текст с переменными и Telegram-разметкой;
- `send_media`: изображение или документ из защищённого файлового хранилища;
- `buttons`: URL-кнопки и callback-кнопки;
- `wait`: задержка в минутах/часах/днях;
- `condition`: ответ, нажатая кнопка, тег, поле лида;
- `collect_input`: имя, email, телефон, свободный ответ, выбор из вариантов;
- `set_field`: запись значения в профиль лида;
- `add_tag` / `remove_tag`;
- `goal`: фиксация целевого события;
- `handoff`: сообщение с контактом менеджера или ссылкой на запись;
- `end`: завершение экземпляра сценария.

### Ограничения первой версии

- без циклов или с жёстким лимитом повторений;
- конечный граф должен быть достижимым и иметь хотя бы один `end`;
- ограничение на число узлов, длину сообщений и общий горизонт ожиданий;
- обязательная валидация ссылок, кнопок, переменных и переходов;
- запрет неизвестных действий и произвольного кода;
- защита от повторного запуска одной и той же воронки для одного подписчика по настраиваемой политике;
- отдельные правила для остановленных, удалённых и заблокировавших бота пользователей.

### Структурная спецификация

ИИ возвращает JSON по версионируемой JSON Schema, например:

```json
{
  "schemaVersion": "1.0",
  "name": "Лид-магнит → консультация",
  "entrypoints": [{"type": "start_parameter", "value": "guide"}],
  "variables": ["first_name", "email"],
  "nodes": [],
  "edges": [],
  "goals": [],
  "crmMapping": {}
}
```

Текстовое объяснение ИИ не является исполняемым сценарием. Runtime принимает только документ, прошедший schema validation и бизнес-валидацию.

## 6. Модель данных

Новые сущности Prisma:

### Интеграции и боты

- `TelegramBot`
  - `id`, `userId`, `projectId?`;
  - `telegramBotId`, `username`, `displayName`;
  - `encryptedToken`, `tokenKeyVersion`, `tokenLast4`;
  - `webhookSecretHash`, `status`, `lastHealthCheckAt`, `lastError`;
  - `createdAt`, `updatedAt`, `deletedAt`.
- `GoogleConnection`
  - `id`, `userId`;
  - `googleAccountId`, `email`, `scopes`;
  - `encryptedRefreshToken`, `tokenKeyVersion`, `status`, `lastError`;
  - временный access token по возможности не хранить в БД.
- `BotCrmDestination`
  - `botId`, `googleConnectionId`;
  - `spreadsheetId`, `spreadsheetUrl`, `sheetName`;
  - версия заголовков и последняя успешная синхронизация.

### Сценарии

- `BotScenario`
  - `id`, `userId`, `botId`, `projectId`;
  - `name`, `description`, `status`;
  - `draftVersionId`, `publishedVersionId`;
  - `createdAt`, `updatedAt`, `archivedAt`.
- `BotScenarioVersion`
  - `id`, `scenarioId`, `version`;
  - `schemaVersion`, `definition` JSON;
  - `sourcePrompt`, `validationReport`;
  - `createdBy`, `publishedAt`, `createdAt`.
- `BotBuilderConversation` и `BotBuilderMessage`
  - история AI-диалога, ссылки на workflow run/artifact и версию сценария;
  - контекст проекта не дублируется целиком в сообщениях.

### Runtime и CRM

- `BotSubscriber`
  - `id`, `userId`, `botId`, `telegramUserId`;
  - username, имя, язык, телефон/email при добровольном предоставлении;
  - `status`, `source`, `startParameter`, `firstSeenAt`, `lastSeenAt`;
  - согласия и дата отписки/блокировки.
- `BotSubscriberField`, `BotSubscriberTag`;
- `BotScenarioEnrollment`
  - подписчик, scenario/version, текущий узел, состояние, status;
  - started/completed/cancelled timestamps.
- `BotInboundUpdate`
  - `botId`, `telegramUpdateId`, тип, минимизированный payload;
  - уникальный ключ `(botId, telegramUpdateId)` для идемпотентности.
- `BotMessageDelivery`
  - enrollment, node, scheduledAt, status, attempts;
  - Telegram message id, sent/delivered/error timestamps.
- `BotEvent`
  - вход, клик, ответ, шаг, цель, отписка, ошибка;
  - используется для аналитики и аудита.
- `BotCrmSyncJob`
  - subscriber/event, idempotency key, status, attempts, nextAttemptAt, error.

Все корневые пользовательские записи имеют `userId`. Дочерняя запись всегда проверяется через принадлежащего пользователю родителя. Уникальности, выборки, агрегаты, экспорты, логи и фоновые задачи обязательно scope-ятся по владельцу.

## 7. Telegram runtime

### Webhook-маршрутизация

Текущий общий `/api/v1/telegram-bots/webhook` с одним глобальным secret недостаточен для нескольких пользовательских ботов.

Целевой вариант:

```text
POST /api/v1/telegram/webhooks/:publicBotKey
```

- `publicBotKey` — случайный непрогнозируемый идентификатор, не DB id и не токен;
- у каждого бота отдельный `secret_token`;
- заголовок проверяется constant-time сравнением с сохранённым hash;
- бот определяется только сервером по `publicBotKey`;
- webhook не принимает `userId`, `botId` или токен из payload;
- update быстро валидируется, дедуплицируется, сохраняется и получает `2xx`;
- дальнейшее исполнение идёт асинхронно.

Telegram поддерживает один webhook на бота, поэтому при подключении необходимо явно предупреждать, если у токена уже установлен сторонний webhook: его замена отключит прежнюю платформу.

### Очередь и worker

Для MVP:

- PostgreSQL outbox/job tables;
- отдельный процесс `lumaiq-telegram-worker` под PM2;
- `FOR UPDATE SKIP LOCKED` или зрелая PostgreSQL-backed job library;
- exponential backoff + jitter;
- dead-letter статус после лимита попыток;
- блокировки/lease для восстановления зависших jobs;
- отдельные очереди inbound updates, scheduled messages и CRM sync;
- лимиты параллелизма глобально, по botId и chatId;
- корректная обработка Telegram `429 retry_after`;
- идемпотентный переход между узлами.

При заметном росте нагрузки очередь можно перевести на Redis/BullMQ без изменения сценарной модели.

### Отправка сообщений

- единый Telegram API client с timeout, retry classification и sanitised logs;
- токен расшифровывается только внутри server-side integration service;
- токен никогда не попадает в URL логов, error tracking, AI prompt или frontend;
- экранирование MarkdownV2/HTML;
- хранение Telegram `message_id` для диагностики;
- обработка `bot was blocked`, `chat not found`, rate limits и невалидного токена;
- per-bot kill switch и глобальная аварийная пауза.

## 8. AI Builder и контекст проекта

Новые workflow prompts:

- `chatbot.builder.discover.v1` — определить задачу и недостающие данные;
- `chatbot.builder.generate.v1` — создать первый structured draft;
- `chatbot.builder.edit.v1` — применить изменение к текущей версии;
- `chatbot.builder.validate.v1` — проверить логику и пользовательский путь;
- `chatbot.builder.copy.v1` — улучшить отдельные сообщения без перестройки графа;
- `chatbot.builder.explain.v1` — объяснить сценарий пользователю.

Все вызовы проходят через существующие:

- `AIWorkflowRun`;
- `AIWorkflowStep`;
- `AIArtifact`;
- `AIGeneration`;
- shared AI balance;
- backend prompt registry;
- `project-context.service.ts`.

Для chatbot workflows включаются релевантные блоки: профиль эксперта, позиционирование, УТП, аудитория/JTBD, кастдевы, продукты, лид-магниты и при необходимости история контента. В prompt не передаются Telegram token, Google refresh token, webhook secret и необязательные персональные данные подписчиков.

### Поведение AI-диалога

- сохраняет текущий `scenarioId` и `draftVersionId`;
- различает обсуждение, изменение и команду публикации;
- каждое изменение возвращает typed patch либо новую полную validated definition;
- показывает diff: что добавлено, изменено и удалено;
- не публикует автоматически;
- при конфликте с runtime-возможностями предлагает поддерживаемую альтернативу;
- не придумывает неизвестные цены, ссылки, расписание или юридические согласия;
- предупреждает, если данных проекта недостаточно;
- не регенерирует весь сценарий при локальной правке одного сообщения.

## 9. Google Sheets как простая CRM

### Рекомендуемый UX

1. Пользователь нажимает «Подключить Google».
2. Проходит отдельный OAuth consent flow.
3. Luma IQ запрашивает минимальные scopes в момент подключения CRM.
4. Backend получает offline access и хранит refresh token в зашифрованном виде.
5. Пользователь выбирает:
   - «Создать новую CRM-таблицу»;
   - позднее — «Подключить существующую таблицу».
6. Luma IQ создаёт таблицу в Google Drive пользователя, записывает заголовки и сохраняет `spreadsheetId`.
7. Пользователь получает постоянную ссылку на таблицу.

Авторизация Google для входа в Luma IQ и Google-интеграция для Sheets должны быть логически раздельными: разные scopes, отдельное согласие, отдельный статус и возможность отключить доступ.

### Scopes

На этапе реализации выбрать минимальную комбинацию после spike:

- Sheets API для создания/изменения таблицы;
- при необходимости `drive.file`, чтобы приложение работало только с файлами, созданными или выбранными через приложение.

Не запрашивать полный доступ ко всему Google Drive без доказанной необходимости.

### Структура CRM-таблицы

Лист `Подписчики`:

- `subscriber_id` Luma IQ;
- Telegram user id;
- username;
- имя/фамилия;
- телефон;
- email;
- bot;
- источник;
- start parameter/UTM;
- первый вход;
- последний контакт;
- текущий сценарий и шаг;
- теги;
- статус;
- согласие;
- целевое действие;
- updated_at.

Дополнительный лист `События` можно добавить после MVP или включить опционально: timestamp, subscriber_id, scenario, event, node, value.

### Синхронизация

- внутренняя БД Luma IQ — источник истины, Google Sheet — удобное представление/экспорт;
- upsert по стабильному `subscriber_id`, а не по номеру строки;
- заголовки защищены версией схемы;
- batch-запись вместо одного API-вызова на каждое событие;
- retry queue и идемпотентность;
- health status, последнее успешное обновление и кнопка «Повторить синхронизацию»;
- обработка удалённой таблицы, отозванного OAuth, изменённых заголовков и нехватки прав;
- пользовательские правки не должны молча перезаписываться: служебные колонки управляются Luma IQ, произвольные колонки сохраняются;
- журнал ошибок не содержит access/refresh tokens и лишние персональные данные.

## 10. Backend API

Предлагаемые группы:

```text
GET/POST            /api/v1/telegram-bots
GET/PATCH/DELETE    /api/v1/telegram-bots/:botId
POST                /api/v1/telegram-bots/:botId/verify
POST                /api/v1/telegram-bots/:botId/connect-webhook
POST                /api/v1/telegram-bots/:botId/disconnect-webhook

GET/POST            /api/v1/telegram-bots/:botId/scenarios
GET/PATCH/DELETE    /api/v1/bot-scenarios/:scenarioId
GET                 /api/v1/bot-scenarios/:scenarioId/versions
POST                /api/v1/bot-scenarios/:scenarioId/preview
POST                /api/v1/bot-scenarios/:scenarioId/test
POST                /api/v1/bot-scenarios/:scenarioId/publish
POST                /api/v1/bot-scenarios/:scenarioId/pause
POST                /api/v1/bot-scenarios/:scenarioId/rollback

POST                /api/v1/bot-builder/conversations
POST                /api/v1/bot-builder/conversations/:id/messages

GET                 /api/v1/telegram-bots/:botId/subscribers
GET                 /api/v1/telegram-bots/:botId/subscribers/:subscriberId
GET                 /api/v1/telegram-bots/:botId/analytics

GET                 /api/v1/integrations/google/connect
GET                 /api/v1/integrations/google/callback
GET/DELETE          /api/v1/integrations/google
POST                /api/v1/telegram-bots/:botId/crm/google-sheet
POST                /api/v1/telegram-bots/:botId/crm/resync
```

Каждый authenticated endpoint проверяет ownership на сервере. `projectId`, `botId`, `scenarioId`, connection и spreadsheet обязаны принадлежать одному пользователю. Админский просмотр — только отдельным role-guarded и audit-logged маршрутом.

## 11. Frontend

### Разделы

- список ботов с health/status;
- мастер подключения;
- страница бота: сценарии, подписчики, аналитика, CRM, настройки;
- AI Builder:
  - чат;
  - карточка выбранного проекта и использованного контекста;
  - компактная карта сценария;
  - список сообщений/узлов;
  - diff последнего изменения;
  - ошибки/предупреждения;
  - тест и публикация;
- список версий и откат;
- CRM status и ссылка на Google Sheet;
- техническая диагностика без раскрытия секретов.

### Защита от ошибок пользователя

- перед заменой существующего webhook показать предупреждение;
- перед публикацией показать изменённые точки входа и активные enrollments;
- публикация несовместимой версии требует стратегии: старые подписчики заканчивают старую версию, новые начинают новую;
- удаление бота — мягкое, с периодом восстановления;
- отключение Google не останавливает самого Telegram-бота, но показывает накопившиеся sync jobs;
- тестовая отправка помечается и не попадает в production-аналитику.

## 12. Безопасность, приватность и юридический слой

- envelope encryption или AES-256-GCM для Telegram и Google refresh tokens;
- master key хранится только в production secrets; поддерживается `keyVersion` и ротация;
- токены не возвращаются API после сохранения;
- redact secrets в логах, APM, request dump и error reporting;
- не хранить полный raw Telegram update дольше необходимого; определить retention;
- rate limiting на webhook, builder, publish и test-send;
- CSRF/state/PKCE-защита OAuth flow;
- проверка redirect URI и одноразового OAuth state;
- audit log: подключение, замена токена, webhook, публикация, откат, Google connect/disconnect, экспорт;
- two-user integration tests на read/update/delete/export/guess-id;
- резервные копии сценариев и runtime state;
- отдельные пользовательские согласия/политика обработки данных для ботов;
- настройка текста согласия и ссылки на политику владельца в сценарии;
- механизм удаления/экспорта данных конкретного подписчика;
- запрет использования для спама и обязанность владельца иметь законное основание для сообщений;
- юридическая проверка состава собираемых данных и роли Luma IQ как обработчика/оператора перед production launch.

## 13. Наблюдаемость и эксплуатация

Метрики:

- webhook requests, invalid secret, duplicate updates;
- update processing latency и queue lag;
- jobs ready/running/retry/dead;
- Telegram API latency, 429, 4xx, 5xx;
- отправки и ошибки по botId без токена;
- active enrollments;
- CRM sync lag/errors;
- OAuth refresh failures;
- AI builder generation/validation failures;
- расход AI-баланса с понятными пользовательскими названиями.

Нужны:

- health endpoints для API и worker;
- dashboard в админке;
- поиск по botId/scenario/enrollment/update id;
- replay только идемпотентных failed jobs;
- алерты при росте dead jobs, queue lag, webhook errors и invalid credentials;
- runbooks: Telegram недоступен, токен отозван, webhook занят, Google OAuth отозван, worker остановился.

## 14. Этапы реализации

Оценки приведены для одного сильного full-stack разработчика с помощью ИИ, без учёта ожидания внешней Google verification и отдельной юридической экспертизы.

### Этап 0. Product discovery и фиксация правил — 2–4 дня

- подтвердить MVP use cases;
- выбрать модель тарифов и лимитов;
- определить типы сообщений/ветвлений;
- определить правила согласий и хранения данных;
- утвердить UX «чат + структура + предпросмотр»;
- зафиксировать 10–15 эталонных пользовательских запросов и ожидаемые сценарии.

Результат: PRD, сценарная JSON Schema v1, список acceptance cases.

### Этап 1. Технический spike — 3–5 дней

- multi-bot `setWebhook` на staging;
- per-bot route/secret;
- тест Postgres queue и отложенной доставки;
- Google OAuth offline access;
- создать Sheet и сделать idempotent upsert;
- измерить лимиты/поведение ошибок Telegram и Google;
- выбрать encryption/key management.

Результат: решения сняты с предположений и подтверждены прототипом.

### Этап 2. Основа данных и безопасность — 4–6 дней

- Prisma models и миграции;
- backfill/ownership constraints;
- encryption service и redaction;
- scoped repositories;
- audit events;
- two-user isolation tests.

Результат: безопасное хранилище ботов, интеграций и сценариев.

### Этап 3. Подключение нескольких Telegram-ботов — 4–6 дней

- CRUD ботов;
- `getMe/getWebhookInfo`;
- конфликт существующего webhook;
- `setWebhook/deleteWebhook`;
- health checks;
- UI списка и мастера подключения;
- замена токена, отключение и мягкое удаление.

Результат: пользователь самостоятельно и безопасно подключает несколько ботов.

Статус на 2026-09-03: backend CRUD, шифрование токенов, per-bot webhook, диагностика, конфликт стороннего webhook и интерфейс управления реализованы локально. Production не переключался. До закрытия этапа нужны staging-миграция, переменные шифрования/webhook, настоящее фото бота и end-to-end проверка тестового подключения.

### Этап 4. Runtime v1 — 8–12 дней

- webhook ingest и дедупликация;
- Postgres-backed queue + PM2 worker;
- interpreter сценарной схемы;
- сообщения, кнопки, wait, conditions, fields, tags, goals;
- subscriber/enrollment state;
- retries, rate limits, dead jobs;
- test mode;
- runtime integration tests с mock Telegram API.

Результат: вручную заданная JSON Schema стабильно исполняется.

Статус на 2026-09-03: локально реализовано ядро Runtime v1: `/start`, deep-link и ключевые слова, subscriber/enrollment state, Postgres-backed очереди inbound/delivery, отдельный worker, текстовые сообщения и inline-кнопки, задержки и отправка в местное время, tags/fields/conditions/goals/end, retries, `429 retry_after`, dead jobs и защита от дублей. Callback-переходы, приём ответов, media, proactive rate limiting, test-mode API/UI и staging E2E остаются. Миграция не применялась, worker по умолчанию выключен, production не менялся.

### Этап 5. AI Builder — 8–12 дней

- prompt registry и workflows;
- structured output;
- selective project context;
- discover/generate/edit/validate;
- conversation persistence;
- typed diff;
- чат и preview UI;
- защита от full-regeneration при локальной правке;
- AI accounting/artifacts.

Результат: пользователь создаёт рабочий сценарий только через диалог.

### Этап 6. Версии и безопасная публикация — 4–6 дней

- draft/published versions;
- publish validation;
- политика для уже активных подписчиков;
- rollback/pause;
- история изменений;
- conflict handling при параллельном редактировании.

Результат: production-сценарий воспроизводим и откатываем.

### Этап 7. Подписчики и базовая аналитика — 4–6 дней

- список и карточка подписчика;
- фильтры по ботам, сценариям, тегам и статусам;
- funnel events и цели;
- базовая воронка;
- CSV export с ownership checks.

Результат: пользователь видит лидов и эффективность сценариев внутри Luma IQ.

### Этап 8. Google Sheets CRM — 6–9 дней

- отдельный OAuth flow со scopes;
- encrypted refresh token;
- создание уникальной таблицы;
- headers/schema version;
- batch upsert и retry jobs;
- reconnect/resync;
- UI состояния и ошибок;
- проверка политики Google и при необходимости запуск verification.

Результат: подписчики автоматически появляются в таблице пользователя.

### Этап 9. Hardening и закрытая beta — 7–10 дней

- security review;
- нагрузочные и chaos tests;
- backup/restore;
- observability и alerts;
- privacy/retention/delete flows;
- runbooks;
- пилот на 3–5 владельцах и 10–20 ботах;
- исправление edge cases.

Результат: controlled beta.

### Этап 10. Production launch — 3–5 дней плюс наблюдение

- тарифы/лимиты;
- onboarding и документация;
- production migrations;
- отдельный PM2 worker;
- staged rollout и feature flag;
- smoke tests;
- ежедневный мониторинг первой недели.

Ориентир: 8–12 календарных недель разработки до устойчивой закрытой beta. Google verification, юридическая проверка и изменения scope могут увеличить календарный срок.

## 15. Приоритеты релизов

### MVP-A: доказать runtime

- один/несколько ботов;
- один сценарий с базовыми узлами;
- ручная JSON/служебная конфигурация;
- webhook, worker, subscriber state.

### MVP-B: доказать natural-language builder

- AI-чат;
- контекст проекта;
- generate/edit/validate;
- preview/test/publish/versioning.

### MVP-C: доказать бизнес-ценность

- несколько сценариев;
- лиды/аналитика;
- Google Sheets CRM;
- onboarding, лимиты и beta.

Не стоит начинать с красивого AI-чата до готовности runtime: иначе будет создан интерфейс, который генерирует сценарии, но не может надёжно их исполнять.

## 16. Тарифы и ограничения

До разработки нужно решить:

- сколько ботов доступно на каждом плане;
- сколько активных сценариев на бот;
- число подписчиков и исходящих сообщений в месяц;
- расходует ли AI Builder общий AI-баланс;
- платны ли дополнительные Google connections;
- что происходит при превышении лимита;
- сколько хранятся события и неактивные подписчики.

Рекомендуемая модель:

- AI-генерация и AI-редактирование расходуют общий AI-баланс только после успешного результата;
- Telegram runtime тарифицируется отдельно по активным подписчикам или доставленным сообщениям;
- открытие сценария, ручное редактирование, webhook ingest и неуспешные AI-запросы AI-баланс не списывают;
- лимит runtime не должен приводить к внезапной потере update: переход в paused/grace state с уведомлением владельца.

## 17. Тестовая стратегия

### Unit

- schema/business validator;
- interpreter каждого node type;
- variable interpolation/escaping;
- state transitions;
- retry classification;
- encryption/redaction;
- CRM row mapping.

### Integration

- webhook → update → enrollment → message job;
- duplicate update;
- callback and branching;
- scheduled wait after worker restart;
- publish/rollback;
- Telegram 429/401/5xx;
- Google refresh/upsert/revocation;
- два пользователя с угадыванием чужих ids;
- удалённый/paused bot и archived scenario.

### End-to-end

- подключить тестового бота;
- создать сценарий словами;
- изменить отдельный шаг;
- отправить тест;
- опубликовать;
- пройти сценарий реальным Telegram test account;
- увидеть лида в Luma IQ и Google Sheet;
- выпустить v2, убедиться, что старый enrollment корректно заканчивает v1;
- отключить Google, накопить sync, переподключить и восстановить.

## 18. Definition of Done для beta

- пользователь подключает минимум три своих бота без участия разработчика;
- каждый бот имеет минимум три независимых сценария;
- AI создаёт валидный сценарий по эталонным запросам и применяет локальные правки;
- публикация всегда явная и версионируемая;
- дубликат Telegram update не создаёт повторное сообщение;
- отложенные сообщения переживают restart API и worker;
- токены не видны в API, frontend, логах и AI history;
- User A не может получить данные/бота/лидов/таблицу User B;
- Google sync восстанавливается после временной ошибки;
- есть пауза, откат, аудит и аварийный kill switch;
- production health и alerts покрывают API, worker, Telegram и Google;
- юридические тексты и consent flow проверены.

## 19. Что владелец Luma IQ должен сделать вручную

### До начала разработки

1. Утвердить MVP:
   - допустимые типы сообщений;
   - нужные ветвления;
   - нужны ли сразу сбор телефона/email и согласия;
   - нужна ли ручная рассылка;
   - лимиты тарифов.
2. Дать 10–15 реальных примеров запросов к AI-конструктору.
3. Для каждого примера описать ожидаемую воронку и целевое действие.
4. Утвердить срок хранения подписчиков, сообщений и событий.
5. Передать юристу модель обработки Telegram/Google/CRM данных.

### Telegram

Для разработки не нужен отдельный Telegram `api_id/api_hash`: для обычного Bot API достаточно токена BotFather.

1. Открыть официального `@BotFather`.
2. Создать минимум двух тестовых ботов через `/newbot`:
   - staging/test;
   - production demo.
3. Сохранить их токены в менеджере паролей, не в чате, Git или документах.
4. Настроить имя, описание, avatar, команды и при необходимости privacy mode через BotFather.
5. Передать токены только через согласованный secrets/env канал.
6. Иметь отдельный Telegram-аккаунт для end-to-end тестирования пути подписчика.
7. Подтвердить, можно ли при подключении заменять существующий webhook пользователя, и какой текст предупреждения показывать.

После реализации обычному клиенту Luma IQ потребуется только создать бота в BotFather и вставить токен в защищённую форму Luma IQ. Webhook и дальнейшее подключение выполняет сервис.

### Google Cloud

1. Создать или выбрать отдельный Google Cloud Project для production Luma IQ.
2. Включить Google Sheets API и при необходимости Google Drive API.
3. Настроить OAuth consent screen:
   - название и логотип Luma IQ;
   - support email;
   - privacy policy и terms URLs;
   - authorized domains;
   - developer contacts.
4. Создать OAuth 2.0 Web Application client.
5. Добавить точные staging и production redirect URIs.
6. Передать `client_id` и `client_secret` через production secret storage.
7. Добавить тестовых пользователей, пока приложение находится в testing mode.
8. Проверить классификацию выбранных scopes и при необходимости пройти Google verification.
9. Подготовить материалы для verification: описание использования данных, demo video, privacy policy, domain verification.
10. Утвердить, где создаётся CRM-файл: в Drive пользователя (рекомендуется) или в Drive Luma IQ с передачей доступа.

### Production и безопасность

1. Создать production encryption master key и резервную процедуру его хранения/ротации.
2. Не передавать master key разработчикам через чат и не коммитить его.
3. Утвердить новый PM2 process `lumaiq-telegram-worker`.
4. Утвердить лимиты VPS/БД и резервное копирование новых таблиц.
5. Подключить канал аварийных уведомлений.
6. Утвердить retention и процедуру удаления данных.
7. Обновить политику конфиденциальности, оферту/DPA и правила допустимого использования.
8. Выбрать 3–5 пилотных пользователей и получить согласие на beta.

### Перед production launch

1. Пройти полный E2E самостоятельно как владелец бота и как подписчик.
2. Проверить, что токены можно отозвать/заменить и что отключение действительно прекращает работу.
3. Подтвердить тарифы, лимиты и тексты уведомлений.
4. Подтвердить legal/consent тексты.
5. Дать явное разрешение на production migration и staged rollout.

## 20. Вопросы, которые нужно зафиксировать до Этапа 1

1. В MVP бот только ведёт автоматическую воронку или должен также отвечать на свободные вопросы с помощью ИИ?
2. Нужны ли рассылки всем/сегменту подписчиков уже в первой версии?
3. Какие форматы обязательны: текст, фото, видео, аудио, voice, файлы?
4. Нужны ли менеджеры/операторы и передача диалога человеку?
5. Должен ли один сценарий запускать другой сценарий?
6. Разрешено ли подписчику одновременно находиться в нескольких сценариях одного бота?
7. Нужны ли UTM/deep-link источники и A/B-тесты в MVP?
8. Должна ли Google-таблица быть отдельной для каждого бота или отдельной для каждого сценария?
9. Нужен ли обратный импорт изменений из Google Sheet в Luma IQ или Sheet только принимает данные?
10. Какие персональные данные планируется собирать и в каких странах будут пользователи/подписчики?
11. Какая ожидается нагрузка на beta и через год: боты, подписчики, сообщения в сутки?
12. Нужны ли webhooks/API Luma IQ для внешних CRM уже в первой версии?

## 21. Рекомендованные ответы по умолчанию

Если продуктовые решения пока не приняты, для MVP безопасно зафиксировать:

- свободные AI-ответы подписчикам — не включать, только детерминированные ветки;
- рассылки — после MVP;
- форматы — текст, изображение, документ и inline-кнопки;
- оператор — ссылка/контакт без live inbox;
- сценарии могут запускать друг друга только в следующей версии;
- один подписчик может иметь несколько enrollments, но только один активный enrollment одного scenario;
- deep links и UTM — включить, A/B — позже;
- одна CRM-таблица на бота, сценарий хранить в отдельной колонке;
- Google Sheet — односторонняя выгрузка, Luma IQ остаётся источником истины;
- beta sizing: до 20 ботов, 10 000 подписчиков суммарно и 50 000 исходящих сообщений в сутки, затем пересчитать;
- внешние CRM/webhooks — после стабилизации Google Sheets.

## 22. Текущий задел Luma IQ

Можно переиспользовать:

- `/chatbot-chains` и `chatbot.chain.generate.v1` как источник UX/content learnings;
- `project-context.service.ts` для контекста эксперта, аудитории, кастдевов и продуктов;
- workflow runs/steps/artifacts/generations и общий AI-баланс;
- `telegram-bot.service.ts` для базового Telegram API client;
- `/telegram-bots/diagnose` для проверки токена;
- webhook controller как spike, но не как конечную multi-bot маршрутизацию;
- существующий Google login только как инфраструктурный ориентир, не как готовую Sheets authorization;
- production backend/VPS/PM2.

Нельзя считать готовым:

- безопасное постоянное хранение пользовательских Telegram tokens;
- multi-bot webhook routing;
- runtime сценариев и очередь;
- subscriber/enrollment/analytics;
- отдельный Google OAuth с offline refresh token;
- создание персональных CRM-таблиц и sync;
- AI Builder с structured scenario editing/versioning.
