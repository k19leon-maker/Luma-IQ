# Luma IQ AI Infrastructure V2: аудит базовой линии

Дата фиксации: 26 июля 2026  
Production snapshot: 26 июля 2026, 07:54 UTC  
Статус: этап 0 завершён, production-трафик и бизнес-логика не изменялись.

## Резюме

В Luma IQ уже есть полезное ядро AI-инфраструктуры: workflow runs, steps, artifacts, generations, versioned model pricing, idempotency и раздельная пользовательская история AI-баллов. Большинство пользовательских экранов уже используют workflow API.

При этом система пока не готова к безопасному переключению на профили `SOL`, `TERRA`, `LUNA`:

1. Четыре точки вызывают провайдеров напрямую.
2. Стоимость и model IDs распределены между frontend, env, prompt registry и backend.
3. Пользовательские AI-баллы и внутренний credit ledger считают разные единицы.
4. Cached input tokens сейчас учитываются дважды в себестоимости и `totalTokens`.
5. Production-таблица `FeaturePricing` пуста, используется fallback из кода.
6. В `AIModelPricing` нет будущих model IDs `gpt-5.6-*` и цен аудиомоделей.
7. 37 workflow runs находятся в `RUNNING` более часа.
8. B2C Psychology и голосовой ввод не проходят через общий generation/workflow accounting.

Миграцию нужно выполнять расширяющим способом: сначала добавить централизованные реестры и совместимость, затем переводить трафик feature flag-ами. Удалять legacy-контуры до сверки метрик нельзя.

## Метод аудита

- Статический поиск прямых SDK/HTTP-вызовов, route mounts, action keys и model IDs.
- Проверка Prisma schema, миграций, pricing и billing services.
- Проверка frontend model store и AI API clients.
- Read-only агрегирование production `AIGeneration`, workflow, pricing и subscription данных без пользовательского контента.
- Проверка доступности OpenAI model IDs через существующий project API key без вывода секрета.
- Сверка идентификаторов и цен с официальной документацией OpenAI.

## Карта прямых вызовов провайдеров

| Файл | Endpoint / инициатор | Провайдер и API | Action / feature | Модель сейчас | Списание | Логирование |
|---|---|---|---|---|---|---|
| `backend/src/services/ai.service.ts` | Общий text service, вызывается workflow, legacy chat и JTBD | OpenAI Chat Completions | Зависит от вызывающего кода | frontend override → section map → `OPENAI_MODEL` | Через `AIGeneration` только если caller оборачивает вызов | Caller пишет `AIGeneration`; legacy/JTBD дополнительно `AIRequestLog` |
| `backend/src/services/ai.service.ts` | То же | Anthropic Messages | Зависит от caller | frontend override или Claude default | Через `AIGeneration` только при wrapper | Аналогично OpenAI |
| `backend/src/controllers/b2c-psychologist.controller.ts` | `POST /api/v1/b2c/psychologist/chat` | OpenAI Responses HTTP | Отдельного action key нет | `OPENAI_B2C_PSYCHOLOGY_MODEL` | Нет AI-баланса/credit ledger | Нет `AIGeneration`, только HTTP response |
| `backend/src/controllers/audio.controller.ts` | `POST /api/v1/audio/transcribe` | OpenAI Transcriptions | Отдельного action key нет | `OPENAI_TRANSCRIPTION_MODEL` | Не списывает AI-баллы | Нет generation/cost usage |
| `backend/src/services/castdev-transcription.service.ts` | CustDev queue worker | OpenAI Transcriptions | `castdev_transcription` | `OPENAI_TRANSCRIPTION_MODEL` | После успеха гибкие AI-баллы; technical credits = 0 | Создаётся generation вручную, но tokens/cost = 0 |
| `backend/src/services/ai-workflow.service.ts` → `ai.service.ts` | `POST /api/v1/ai/workflows/:workflow/start|step` | OpenAI/Anthropic через общий text service | Prompt registry feature | request override → prompt registry model | Reserve/refund technical credits, после успеха пользовательские AI-баллы | Run, step, generation, usage event, artifact, structured output |

Других прямых вызовов `OpenAI`, `Anthropic`, `api.openai.com`, Chat Completions, Responses и Transcriptions в `backend/src` не найдено.

## Проверка ключевых контуров

### Legacy `/api/v1/ai/chat`

- Клиент `aiApi.chat` сохранён, но прямых вызовов из текущих страниц не найдено.
- При наличии `projectId` endpoint уже делегирует в workflow `ai.dialog/message`.
- Без `projectId` остаётся legacy path через `aiGenerationService`.
- Endpoint принимает model ID от клиента, что противоречит целевой серверной маршрутизации.
- Сохранять до окончания миграции как compatibility endpoint.

### Workflow API

- Основные стратегия, продукты, посты, рилсы, статьи, видео, Threads, TG-канал и AI-диалог идут через workflow API.
- Backend создаёт `AIWorkflowRun`, `AIWorkflowStep`, `AIGeneration`, `AIArtifact` и structured output.
- Идемпотентность есть, но 37 старых runs зависли в `RUNNING`.
- Prompt model может быть переопределён frontend-параметром.

### JTBD

- `POST /api/v1/jtbd/generate` строит prompt в controller/framework и вызывает `ai.service.ts` через `aiGenerationService`.
- Feature code: `jtbd`; пользовательская история отображает его как `audience`.
- Не создаёт workflow run/step/artifact.
- OpenAI model берётся из section `audience`, Claude жёстко задан как Haiku.

### B2C Psychology

- Прямой вызов OpenAI Responses API с отдельным ключом.
- Публичный IP-based rate limit и лимит сообщений есть.
- Нет action key, workflow, generation, token/cost accounting и versioned pricing.
- Должен перейти в отдельный B2C pipeline, не смешиваясь с B2B AI-балансом.

### Voice audio

- `POST /api/v1/audio/transcribe` используется голосовым вводом.
- Есть auth, rate limit, MIME и size checks.
- Нет биллинга и логирования provider usage.
- Для короткого голосового ввода это может оставаться бесплатным пользовательским действием, но техническая себестоимость должна логироваться.

### CustDev

- Транскрибация выполняется через queue service и отдельный transcription service.
- AI-анализ идёт через workflow `castdev/analysis`.
- Пользовательские баллы транскрибации и анализа динамические.
- Transcription generation записывается с нулевыми tokens/cost, поэтому экономика аудио сейчас невидима.

## Текущие источники правды

| Область | Источник | Состояние |
|---|---|---|
| Пользовательские AI-баллы | `backend/src/config/ai-actions.ts` + успешные `AIGeneration` | Вычисляются постфактум, отдельной транзакции списания нет |
| Technical credits | `ai-economy.ts`, `FeaturePricing`, credit ledger | Production `FeaturePricing` пуст; используется code fallback |
| Model pricing | `AIModelPricing` | Versioned, но только старые OpenAI/Anthropic text models |
| Models | frontend store, prompt registry, env, `ai.service.ts` | Распределены по четырём слоям |
| Prompts | prompt registry + `PromptVersion`/experiments | CMS override и версии присутствуют |
| Workflow | run, step, artifact, structured output | Работает, но есть stale RUNNING |
| Usage | generation, usage event, request log, daily usage | Частично дублируется; некоторые прямые пути не логируются |

## Таблицы данных

Баланс и подписки:

- `Subscription`
- `BillingPeriod`
- `CreditLedgerEntry`
- `FeatureUsageDaily`
- `AIUsage`

AI usage и pricing:

- `AIGeneration`
- `AIUsageEvent`
- `AIRequestLog`
- `AIModelPricing`
- `FeaturePricing`

Workflow и результаты:

- `AIWorkflowRun`
- `AIWorkflowStep`
- `AIArtifact`
- `ProjectStructuredOutput`
- `PromptVersion`
- `PromptExperiment`
- `PromptExperimentVariant`

Связанные продуктовые данные:

- `Project`
- `ProjectFile`
- `JTBDSession`
- `Product`
- `GeneratedText`
- `CastDevRecord`
- `ContentPlanItem`

## Текущие тарифы

| Тариф | Сценарий | Цена/мес | Проекты | AI-баланс | AI-бюджет | Примечание |
|---|---:|---:|---:|---:|---:|---|
| Start | self | 12 000 ₽ | 1 | 2 000 | 1 200 ₽ | DB `FREE` также нормализуется в Start |
| Pro | self | 12 000 ₽ | 3 | 10 000 | 1 200 ₽ | Основной текущий самостоятельный тариф |
| Expert | self | 39 000 ₽ | 7 | 10 000 | 3 900 ₽ | Team access |
| Support | support | 39 000 ₽ | 3 | 7 000 | 3 900 ₽ | 1 marketing call |
| Marketing Partner | support | 59 000 ₽ | 5 | 12 000 | 5 900 ₽ | 4 calls, priority support |
| Implementation | support | 89 000 ₽ | 7 | 20 000 | 8 900 ₽ | Team + implementation support |

Все тарифы дополнительно содержат legacy limits: content units, daily messages, monthly generations, heavy generations, rebuilds, YouTube и longreads. Пользовательский UI их скрывает, но access policy и внутренние конфиги пока сохраняют.

Production на момент аудита: 8 активных `PRO`, 1 активный `IMPLEMENTATION`.

## Подтверждённые дефекты и риски

### P0

1. **Двойной учёт cached tokens.** `inputTokens` OpenAI уже включает cached input, но `ai-cost.service.ts` считает полный input cost и затем добавляет cached cost. Правильно: full-rate input = `inputTokens - cachedInputTokens`.
2. **Двойной учёт cached tokens в `totalTokens`.** `ai-generation.service.ts` суммирует input + output + cached, хотя cached входит в input.
3. **Model pricing не готов к aliases.** Новые `gpt-5.6-*` и audio prices отсутствуют в production DB; генерация через общий service будет заблокирована `MODEL_PRICING_MISSING`.
4. **Frontend может подменять model ID.** Это создаёт риск неправильной маршрутизации и отсутствующего pricing.
5. **37 stale workflow runs.** Все текущие `RUNNING` старше часа.

### P1

1. B2C и voice transcription не входят в единый usage accounting.
2. CustDev transcription хранит нулевую себестоимость.
3. `featureCodeToAiAction` имеет опасный default `ai_chat`: неизвестный action будет молча стоить 1 балл.
4. `strategy_rebuild`, `content_longread`, `youtube_script` есть в пользовательском action registry, но не представлены отдельными backend `FeatureCode`.
5. Product workflows списывают баллы по отдельным шагам, а UI может агрегировать их временным окном в 90 минут.
6. `AIRequestLog` за последние 30 дней пуст, хотя generations есть; полагаться на него как на baseline ошибок нельзя.

## Rollback-план для следующих этапов

1. Не переименовывать и не удалять существующие feature/action keys.
2. Добавить aliases и pricing как новые versioned records.
3. Сохранить текущие model IDs и prompt registry как профиль `LEGACY`.
4. Ввести flags отдельно для text orchestration, transcription и action pricing.
5. Переключать сначала внутренний/admin traffic, затем ограниченную группу пользователей.
6. Перед включением сохранять DB snapshot мигрируемых pricing/config rows.
7. При росте ошибок, cost/action или P90 выключать flag и возвращать `LEGACY`, не откатывая пользовательские данные.
8. Новые pipeline runs должны иметь idempotency key; rollback не должен повторно списывать баланс.
9. Миграции БД должны быть additive до полной сверки.

## Production smoke tests

Перед и после каждого переключения:

1. Health, auth и получение `/billing/me`.
2. AI-диалог: один успешный ответ, один generation, одно списание.
3. Ошибка модели: нет пользовательского списания, есть failed generation.
4. Повтор с тем же idempotency key: нет второго provider call и списания.
5. Strategy audience/positioning: run, все steps, artifact, structured output.
6. Product main/mini/lead magnet: актуальный artifact и корректная сумма баллов.
7. Пост/Reels: дешёвый профиль, сохранённый материал.
8. Voice transcription: результат и technical usage event.
9. CustDev: queue → transcript → analysis, раздельные cost и AI points.
10. B2C: rate limit, ответ и отдельный usage namespace.
11. Admin: model/action/cost видны по generation и workflow.
12. Stale run monitor: нет `RUNNING` старше установленного SLA.

## Решение о переходе к этапу 1

Переход разрешён только как additive migration. Сначала нужно исправить token accounting, добавить model/profile pricing records и запретить model ID из браузера. Текущая baseline сохранена в соседних артефактах.

