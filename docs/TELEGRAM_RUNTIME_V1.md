# Telegram Runtime v1

Статус: локальная реализация, feature flag выключен
Дата: 2026-09-07

## Что реализовано

- per-bot webhook сохраняет дедуплицированный `BotInboundUpdate`;
- worker создаёт/обновляет `BotSubscriber` и запускает `BotScenarioEnrollment`;
- точки входа: `/start`, `/start <parameter>` и ключевые слова;
- `/stop`, `my_chat_member` block/unblock останавливают цепочки и плановые отправки;
- исполняются `send_message`, `send_media`, `wait`, `add_tag`, `remove_tag`, `set_field`, `condition`, `goal`, `handoff`, `collect_input` и `end`;
- `send_media` отправляет image/document/video/audio из закрытого `BotAsset`, а не из публичного URL;
- media asset хранится в PostgreSQL с `userId`, `projectId`, MIME, размером и SHA-256; worker повторно проверяет владельца, проект, тип и целостность перед отправкой;
- приватный asset API поддерживает upload/list/download/delete; удаление используемого сценарием файла блокируется;
- callback-кнопки и текстовый `collect_input` продолжают сценарий;
- persistent rate limiter действует глобально, по bot и chat;
- tenant-scoped runtime events и admin recovery доступны без сохранения текста ответов;
- `wait` поддерживает относительную задержку и следующее местное время в IANA timezone;
- очередь на `BotMessageDelivery` хранит отложенные шаги и итог отправки;
- атомарный claim и idempotency key защищают от параллельного исполнения;
- Telegram `429` повторяется по `retry_after`, остальные явно временные ошибки — с exponential backoff;
- неопределённый итог сетевой отправки не повторяется автоматически: delivery и enrollment переводятся в ошибку, чтобы не послать дубль;
- все runtime-запросы привязаны к `userId + botId + subscriberId`.

## Что пока не входит

- UI/API для ручного создания, публикации и тестового запуска сценария;
- интерфейс выбора и загрузки media asset в конструкторе;
- live E2E отправки media через отдельного тестового бота;
- Google Sheets sync;
- production activation.

## Приватный media API

- `GET /api/v1/telegram-bots/:botId/assets?projectId=:projectId`;
- `POST /api/v1/telegram-bots/:botId/assets` (`multipart/form-data`: `file`, `projectId`, `mediaType`);
- `GET /api/v1/telegram-bots/:botId/assets/:assetId`;
- `DELETE /api/v1/telegram-bots/:botId/assets/:assetId`.

Допустимые `mediaType`: `image`, `document`, `video`, `audio`. Общий лимит задаёт
`TELEGRAM_ASSET_MAX_MB` (по умолчанию 20 MB, максимум 50 MB); изображения
дополнительно ограничены 10 MB. Проверяются расширение, MIME и сигнатура.

## Как запускается

Отдельный процесс:

```bash
npm run start:telegram-worker
```

По умолчанию runtime выключен. Для контролируемого staging-запуска нужны:

```env
TELEGRAM_RUNTIME_V2_ENABLED=true
TELEGRAM_RUNTIME_POLL_INTERVAL_MS=1000
TELEGRAM_RUNTIME_BATCH_SIZE=20
TELEGRAM_RUNTIME_LOCK_TIMEOUT_SECONDS=300
TELEGRAM_ASSET_MAX_MB=20
```

До включения нужно:

1. применить additive-миграции runtime, включая `20260907120000_add_bot_assets`;
2. иметь опубликованную версию сценария;
3. запустить worker отдельно от HTTP API;
4. провести E2E только на тестовом боте и админском Telegram-аккаунте.

## Проверки

- TypeScript build: passed;
- ESLint runtime-файлов: passed без ошибок;
- чистая PostgreSQL: 41/41 миграция применена;
- целевые Telegram/runtime tests: 73 passed;
- binary DB smoke: roundtrip passed, cross-tenant и wrong-project доступ отклонены;
- полный backend suite: 533 passed, 1 skipped, 1 unrelated pre-existing failure in `provider-boundary.test.ts` из-за `semeyno-ai-relay.controller.ts`.
