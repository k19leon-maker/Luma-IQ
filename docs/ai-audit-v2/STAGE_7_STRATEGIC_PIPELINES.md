# Этап 7. Стратегические pipeline SOL/TERRA/LUNA

Дата завершения реализации: 26 июля 2026.

## Маршруты

- `audience`: `LUNA -> TERRA -> SOL -> LUNA`, 25 AI-баллов.
- `positioning`: `TERRA -> SOL -> LUNA`, 20 AI-баллов.
- `utp`: `TERRA -> LUNA`, 20 AI-баллов.
- `offer`: `TERRA -> SOL -> LUNA`, 30 AI-баллов.
- `social`: `TERRA -> LUNA -> TERRA`, 15 AI-баллов.
- `strategy_rebuild`: `TERRA -> SOL -> LUNA`, 100 AI-баллов.
- `product_strategy_audit`: `TERRA -> SOL -> LUNA`, 60 AI-баллов.

Для системного оффера, полной пересборки стратегии и аудита продуктовой стратегии добавлены отдельные prompt registry entries:

- `strategy.offer.generate`;
- `strategy.rebuild.generate`;
- `product.strategy.audit`.

## Роль SOL

SOL используется только на стадии `decision`.

SOL не получает полный selective context, исходную историю диалога или длинный пользовательский черновик. На эту стадию передаются:

- тип действия и итогового артефакта;
- требования финальной валидации;
- компактный структурированный результат предыдущей стадии TERRA.

System prompt SOL запрещает выдумывать факты и требует вернуть компактный JSON с решением, аргументами, рисками и ограничениями.

После SOL модель LUNA получает решение и исходный selective context и формирует пользовательский материал.

## Строгая деградация

Для всех стратегических pipeline задано:

```text
fallbackPolicy.aliases = []
fallbackPolicy.allowDowngrade = false
```

Разрешён повтор того же model profile по общей retry policy. Переход `SOL -> TERRA` или `SOL -> LUNA` запрещён.

Если SOL недоступен:

1. стратегический run получает ошибку;
2. final artifact не создаётся;
3. capture не выполняется;
4. резерв AI-баллов освобождается;
5. generation и workflow получают статус `FAILED`.

## Единое списание для ЦА

Старый 13-шаговый мастер ЦА вызывал workflow для каждого автоматически создаваемого блока. Раньше каждый такой вызов мог рассчитываться как новый полный анализ по 25 баллов.

Новая логика:

- первый шаг использует `audience` и списывает 25 AI-баллов;
- последующие системные шаги используют `audience_followup`;
- `audience_followup` использует `TERRA -> LUNA`, не вызывает SOL и не списывает баланс повторно;
- step chat и строгие технические повторы также считаются продолжением уже оплаченного анализа;
- все provider calls сохраняются для внутреннего учёта себестоимости.

Такая же совместимость добавлена в legacy accounting metadata, поэтому повторное списание не зависит только от включения V2.

## Версионирование конфигурации

Seed AI V2 теперь сравнивает текущую активную action definition с серверным конфигом.

Если pipeline, output limits, fallback policy или цена изменились:

1. предыдущая запись закрывается через `validTo`;
2. создаётся новая активная версия;
3. создаётся configuration audit log с `before` и `after`.

Повторный seed без изменений не создаёт лишних версий.

## Финальная проверка

Стратегические prompt configs имеют минимальную длину, обязательные разделы или паттерны, ограничения максимального размера и запрещённые служебные ответы. Финальная validation выполняется до создания final artifact и capture.

## Проверки

- Контрактные тесты всех Stage 7 pipeline и фиксированной стоимости.
- Тест, что SOL встречается только на стадии `decision`.
- Тест отсутствия downgrade fallback для SOL.
- Тест изоляции system/user prompt SOL от полного контекста.
- Integration test: `SOL_UNAVAILABLE` освобождает резерв и не создаёт capture.
- Тест однократного списания мастера ЦА.
- Backend unit/integration suite.
- Backend и frontend production builds.

## Rollout

Код остаётся под `AI_ORCHESTRATION_V2`, `AI_POINTS_V2`, action allowlist и user pilot allowlist. Перед production rollout нужно применить миграции, выполнить `db:seed:ai-v2`, включить конкретные action keys только пилотной группе и сравнить стоимость с baseline.
