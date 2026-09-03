# Telegram Runtime v1

Статус: локальная реализация, feature flag выключен
Дата: 2026-09-03

## Что реализовано

- per-bot webhook сохраняет дедуплицированный `BotInboundUpdate`;
- worker создаёт/обновляет `BotSubscriber` и запускает `BotScenarioEnrollment`;
- точки входа: `/start`, `/start <parameter>` и ключевые слова;
- `/stop`, `my_chat_member` block/unblock останавливают цепочки и плановые отправки;
- исполняются `send_message`, `wait`, `add_tag`, `remove_tag`, `set_field`, `condition`, `goal`, `handoff`, `collect_input` и `end`;
- `wait` поддерживает относительную задержку и следующее местное время в IANA timezone;
- очередь на `BotMessageDelivery` хранит отложенные шаги и итог отправки;
- атомарный claim и idempotency key защищают от параллельного исполнения;
- Telegram `429` повторяется по `retry_after`, остальные явно временные ошибки — с exponential backoff;
- неопределённый итог сетевой отправки не повторяется автоматически: delivery и enrollment переводятся в ошибку, чтобы не послать дубль;
- все runtime-запросы привязаны к `userId + botId + subscriberId`.

## Что пока не входит

- переходы по callback-кнопкам и текстовым ответам;
- отправка изображений и документов;
- proactive rate limiter по bot/chat;
- UI/API для ручного создания, публикации и тестового запуска сценария;
- runtime events/analytics и Google Sheets sync;
- production activation.

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
```

До включения нужно:

1. применить additive-миграцию `20260903113000_add_telegram_runtime_v1`;
2. иметь опубликованную версию сценария;
3. запустить worker отдельно от HTTP API;
4. провести E2E только на тестовом боте и админском Telegram-аккаунте.

## Проверки

- TypeScript build: passed;
- ESLint runtime-файлов: passed без ошибок;
- целевые Telegram/runtime tests: 24 passed;
- полный backend suite: 509 passed, 1 skipped, 1 unrelated pre-existing failure in `provider-boundary.test.ts` из-за `semeyno-ai-relay.controller.ts`.
