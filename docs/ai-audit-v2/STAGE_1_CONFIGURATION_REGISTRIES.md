# Этап 1. Реестры конфигурации и миграции данных

Дата завершения: 26 июля 2026.

## Что реализовано

- Централизованный `ModelRegistry` с алиасами `SOL`, `TERRA`, `LUNA`, `TRANSCRIBE_MINI`, `TRANSCRIBE_DIARIZE`.
- Реальные model IDs больше не принимаются от браузера и не публикуются клиентскому API.
- Создан версионируемый `AiActionRegistry`: pipeline, модели, context budget, output limit, retry, fallback, batch eligibility и AI-баллы.
- Добавлены версионируемые профили моделей, цены действий и text/audio pricing.
- Добавлены configuration audit log и административный API для изменения конфигурации.
- Добавлены шесть feature flags. Все новые runtime-механизмы по умолчанию выключены.
- Подготовлена additive Prisma migration. Старые usage-записи маркируются как `legacy`, финансовая история не пересчитывается.
- Добавлен seed актуальной конфигурации AI V2.
- Исправлен двойной учёт cached input tokens в техническом расчёте себестоимости.

## Безопасность перехода

Новая конфигурация доступна серверу, но production runtime остаётся прежним, пока не включены соответствующие feature flags:

- `AI_ORCHESTRATION_V2=false`
- `AI_POINTS_V2=false`
- `AI_ROUTER_V2=false`
- `AI_BATCH_ENABLED=false`
- `AI_COST_RECONCILIATION=false`
- `AI_ADMIN_ECONOMICS_V2=false`

Миграция и seed не применялись к production в рамках этого этапа.

## Проверки

- Backend TypeScript build: пройден.
- Frontend TypeScript/Vite build: пройден.
- Backend tests: 42 пройдено, 1 пропущен.
- Prisma schema validation/generation: пройдены.
- `git diff --check`: пройден.

## Следующий этап

Этап 2: единый provider layer и полный технический учёт каждого AI/API-вызова без изменения пользовательских списаний.
