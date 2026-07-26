# Этап 4. AiOrchestrator, PipelineRunner и ModelRouter

Дата завершения: 26 июля 2026.

## Результат

Создан общий серверный runtime для многоэтапных AI-действий:

`AiRuntime -> AiOrchestrator -> PipelineRunner -> ModelRouter -> provider layer`

Один пользовательский запуск создаёт один `AIGeneration`, один резерв и не более одного итогового capture. Внутренние stages не являются отдельными платными действиями.

## Компоненты

### AiRuntime

- Выбирает legacy или V2 на сервере.
- V2 включается только при `AI_ORCHESTRATION_V2=true`.
- Дополнительно action key должен присутствовать в `AI_ORCHESTRATION_V2_ACTIONS`.
- Пустой allowlist оставляет все действия на legacy runtime.
- Browser не передаёт модель или стоимость в V2.

### AiOrchestrator

- Загружает versioned action definition и цену.
- Строит task-specific context.
- Создаёт workflow run.
- Запускает одну оплачиваемую generation вокруг всего pipeline.
- Сохраняет финальный artifact и structured output до capture.
- Передаёт usage/cost в существующий provider accounting.
- При ошибке освобождает резерв через AI balance V2.

### PipelineRunner

- Выполняет stages последовательно по action configuration.
- Сохраняет каждый stage/attempt как `AIWorkflowStep`.
- Сохраняет промежуточный компактный JSON как внутренний `pipeline_stage` artifact.
- Передаёт следующему stage компактный JSON, а не полный сырой ответ.
- Повторяет только упавший stage.
- Успешные предыдущие stages при retry не выполняются повторно.
- Внутренние artifacts исключены из пользовательского API списка материалов.

### ModelRouter

- Выбирает профиль по action definition и stage.
- Сначала использует основной alias.
- Может повторить тот же профиль по retry policy.
- Использует только явно разрешённые fallback aliases.
- Блокирует downgrade, если `allowDowngrade=false`.
- Сохраняет requested alias, selected alias, actual model ID, profile version, route reason и fallback decision.

### ContextBuilder

- Использует существующий `projectContextService`.
- Применяет `contextBudget` из action definition.
- При превышении бюджета сохраняет critical/high блоки и осмысленно сокращает абзацы.
- Создаёт стабильный `promptCacheKey`.
- Сохраняет immutable versioned summary в `AIContextSummary`.
- Повтор того же source hash использует сохранённую summary как cache hit.
- Логирует compression, dropped blocks, source/actual tokens и cache usage.

### Rolling summary AI-диалога

- Для V2 AI-диалога сохраняется versioned rolling summary.
- Следующий запрос получает summary и несколько последних сообщений.
- Legacy AI-диалог не меняется при выключенном V2.

## Persistence

Использованы существующие:

- `AIWorkflowRun`;
- `AIWorkflowStep`;
- `AIGeneration`;
- `AIProviderCall`;
- `AIArtifact`;
- `ProjectStructuredOutput`;
- `CreditLedgerEntry`.

Добавлена только таблица `AIContextSummary` для versioned task/dialog summaries и cache keys.

## Observability

В generation, workflow steps, artifacts и provider calls сохраняются:

- action definition/pricing versions;
- context summary/version;
- compression и cache hit;
- prompt cache key;
- route decision;
- fallback/downgrade;
- actual model ID;
- stage/retry index;
- cached input tokens;
- output limit.

## Rollout и rollback

По умолчанию:

```env
AI_ORCHESTRATION_V2=false
AI_ORCHESTRATION_V2_ACTIONS=
```

Порядок пилота:

1. Применить additive migration `20260726170000_add_ai_context_summaries`.
2. Оставить `AI_ORCHESTRATION_V2=false` и выполнить smoke tests.
3. Включить флаг.
4. Добавить один action key в `AI_ORCHESTRATION_V2_ACTIONS`.
5. Сравнить качество, latency, tokens, cost и AI points с baseline.
6. Расширять allowlist по одному классу действий.

Rollback: удалить action key из allowlist или выключить `AI_ORCHESTRATION_V2`. Legacy runtime начнёт обслуживать новые запросы без удаления V2-истории.

## Проверки

- Prisma schema validation: успешно.
- Backend TypeScript build: успешно.
- Backend tests: 71 passed, 1 skipped.
- Новые runtime tests: router, downgrade protection, context compression, pipeline retry, orchestrator persistence/capture order, rolling summary и runtime rollback.
- Frontend production build: успешно.

Production migration, включение V2 action allowlist и deploy в рамках этапа не выполнялись.
