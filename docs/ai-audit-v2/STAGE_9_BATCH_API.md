# Этап 9. Batch API и фоновые пакеты

Дата реализации: 26 июля 2026.

## Результат

Добавлен долговечный контур фоновой пакетной генерации:

- `AIBatchJob` хранит пакет, provider identifiers и агрегированные статусы;
- `AIBatchItem` хранит каждый элемент, generation, результат, ошибку, токены, AI-баллы и себестоимость;
- `BatchJobService` резервирует AI-баллы до запуска, восстанавливает незавершенные задания после рестарта и опрашивает OpenAI каждые 30 секунд;
- успешные элементы независимо создают `AIArtifact`, `ProjectStructuredOutput`, usage и capture;
- ошибочные, отмененные и просроченные элементы освобождают резерв;
- повторный settlement безопасен благодаря уникальному lifecycle ledger по `generationId`;
- `idempotencyKey` задания и OpenAI idempotency key защищают от повторной отправки;
- фактическая стоимость Batch-вызовов учитывается с `discountMultiplier: 0.5`.

## Статусы

Пользовательский и API-контракт:

`queued → submitted → in_progress → finalizing → completed`

Терминальные альтернативы:

- `partially_failed`;
- `failed`;
- `cancelled`;
- `expired`.

## Ограничения

Фоновый режим:

- требует `AI_POINTS_V2=true` и `AI_BATCH_ENABLED=true`;
- принимает пакет от 2 до 100 элементов;
- доступен только для действий с `batchEligible=true`;
- запрещен для диалога, единичного материала и пошаговых конструкторов продуктов;
- использует TERRA один раз для общего замысла серии и LUNA для отдельных элементов;
- сейчас использует OpenAI `/v1/chat/completions` Batch API.

## API

- `POST /api/v1/ai/batches`;
- `GET /api/v1/ai/batches`;
- `GET /api/v1/ai/batches/:id`;
- `POST /api/v1/ai/batches/:id/refresh`;
- `POST /api/v1/ai/batches/:id/cancel`.

В `ТГ-канале` добавлены режимы:

- `Сейчас` — создание одного выбранного поста через обычный workflow;
- `Фоновая генерация` — создание всех еще не готовых постов пакетом с автоматической подстановкой результатов.

## Rollout

1. Применить миграцию `20260726190000_add_ai_batch_jobs`.
2. Убедиться, что активны `AI_POINTS_V2` и необходимые action definitions.
3. Включить `AI_BATCH_ENABLED` для пилотной среды.
4. Проверить пакет из 2–3 постов, частичный сбой и отмену.
5. После проверки расширять доступ без изменения интерактивных workflow.

Rollback выполняется отключением `AI_BATCH_ENABLED`. Существующие задания и результаты остаются в базе, обычные workflow продолжают работать.

## Проверки

- Prisma schema: valid;
- backend build: passed;
- frontend build: passed;
- backend tests: 132 passed, 1 skipped;
- отдельные тесты покрывают complete, partial failure, cancel, expired, eligibility, JSONL parsing и Batch discount.

Production deployment и применение миграции в этот этап не входили.
