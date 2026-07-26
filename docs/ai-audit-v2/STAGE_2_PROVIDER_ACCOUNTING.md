# Этап 2. Единый provider layer и учёт себестоимости

Дата завершения: 26 июля 2026.

## Архитектура

Все реальные вызовы OpenAI и Anthropic теперь выполняются только из:

- `backend/src/providers/openai.provider.ts`;
- `backend/src/providers/anthropic.provider.ts`.

Каждый API-вызов создаёт отдельную запись `AIProviderCall`. Пользовательский запуск остаётся одной `AIGeneration`, а его техническая себестоимость агрегируется из всех успешных provider calls, включая repair stages и retries.

## Какие контуры подключены

- обычные OpenAI text generations;
- Anthropic text generations;
- legacy AI chat и JTBD;
- workflow generations и validation repair;
- голосовой ввод;
- CustDev transcription с отдельной записью на каждый аудиочанк;
- публичный B2C AI-психолог с изолированным API key scope.

## Что сохраняется по каждому вызову

- provider response ID;
- provider, model alias и actual model ID;
- model snapshot и prompt version;
- action key, pipeline и stage;
- input, cached input, output, reasoning, audio input и audio output usage;
- latency, retry index, batch status;
- success/failure и ошибка;
- локальная стоимость и pricing snapshot;
- связь с generation, workflow, пользователем, проектом или внешним correlation ID.

Сырые промпты и ответы в provider accounting не сохраняются.

## Экономика

- Cached input отделяется от uncached input.
- Reasoning tokens сохраняются отдельно, но не прибавляются повторно к output cost.
- Audio input/output рассчитываются по отдельным тарифам.
- Стоимость нескольких stages и retries суммируется в `AIGeneration.actualCostUsd`.
- Технические retries не создают отдельного пользовательского списания AI-баллов.
- CustDev chunks связываются с одной итоговой generation после успешной транскрибации.

## Защита архитектуры

Unit test `provider-boundary.test.ts` запрещает прямые вызовы OpenAI/Anthropic SDK вне `src/providers`.

## Проверки

- Backend build: пройден.
- Frontend build: пройден.
- Backend tests: 50 пройдено, 1 пропущен.
- Prisma validation: пройдена.
- Прямых provider SDK-вызовов вне `src/providers` нет.

## Rollout

Добавлена additive migration `20260726130000_add_ai_provider_calls`.
В рамках этапа migration не применялась к production и deploy не выполнялся.

Пользовательская модель списаний не менялась. Атомарный `reserve → capture/release/refund` реализуется на этапе 3.
