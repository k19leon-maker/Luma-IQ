# Этап 10. Admin AI Economics V2

Дата завершения: 2026-07-26.

## Что реализовано

- Экономика агрегируется по завершённому pipeline run, а не по отдельному HTTP-запросу.
- Для общей выборки и каждого action key считаются P50, P90 и P95 себестоимости.
- Считаются средняя и P90 стоимость одного AI-балла.
- Показываются input, cached input, output, reasoning, audio input и audio output tokens.
- Показываются доли model aliases, retries, errors, releases, refunds, cache hit rate и оценка экономии.
- Поддерживаются фильтры периода, тарифа, действия, раздела, model alias, пользователя, проекта, Batch, статуса, prompt version и action price version.
- Рекомендация цены: `P90 cost USD × 1000 × 1.20`.
- Округление рекомендации: шаг 5 до 50 баллов, 10 до 250 баллов, затем 25 баллов.
- Рекомендация считается надёжной только при 20 и более успешных результатах.
- Применение рекомендации требует точной строки `APPLY <actionKey> <aiPoints>`.
- Новая цена создаётся через versioned action pricing и audit log, без изменения исходного конфига и без деплоя.
- Тарифный симулятор проверяет action mix против AI-баланса и бюджета тарифа.
- Прогноз строится для использования 30%, 50%, 70% и 100% баланса.
- Добавлена необязательная сверка с OpenAI Costs API.
- Добавлены неблокирующие предупреждения по перерасходу пользователя, недооценённым действиям и высокой доле ошибок.

## Admin API

- `GET /api/v1/admin/ai-economics-v2`
- `POST /api/v1/admin/ai-economics-v2/apply-price`
- `POST /api/v1/admin/ai-economics-v2/simulate`
- `GET /api/v1/admin/ai-economics-v2/reconcile`

Все endpoints защищены `requireAuth` и `requireAdmin`.

## Сверка OpenAI

Сверка выключена, пока не выполнены оба условия:

1. feature flag `AI_COST_RECONCILIATION` включён;
2. в окружении задан `OPENAI_ADMIN_KEY`.

Ключ используется только provider-слоем. Локальная сумма успешных OpenAI provider calls сравнивается с итогом Organization Costs API за выбранный период. Расхождение больше 10% или 1 USD помечается как требующее проверки, но не блокирует пользователей.

## Ограничения первой версии

- Аналитика читает максимум 10 000 последних generations за период.
- Оценка Batch savings строится по зафиксированным batch calls; точность зависит от полноты pricing snapshots.
- До накопления 20 наблюдений тарифный симулятор использует fallback, обратный формуле рекомендации. После накопления данных используется фактический P90 cost per point за 90 дней.
- Функция не меняет пользовательские списания и не включает rollout V2 автоматически.

## Проверки

- Backend TypeScript build: успешно.
- Frontend TypeScript и Vite production build: успешно.
- Backend tests: 139 passed, 1 skipped.
- Provider boundary test: прямой OpenAI Costs API вызов находится только в `src/providers`.
