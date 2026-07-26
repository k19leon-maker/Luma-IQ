# Этап 12. Production rollout и rollback runbook

Дата: 2026-07-26.

## Что реализовано

- Детерминированный процентный rollout AI V2 по `userId`.
- Администраторы и пользователи из allowlist всегда попадают в пилот независимо от процента.
- `AI_ORCHESTRATION_V2_ACTIONS=*` включает все зарегистрированные action keys.
- При недостатке AI-баланса provider не вызывается.
- Автоматический sweeper завершает зависшие резервы.
- Pilot metrics возвращают error rate, P50/P90 latency, P50/P90 cost per point и критические alerts.
- Provider-boundary test запрещает прямые OpenAI/Anthropic вызовы вне `src/providers`.
- Production smoke проверяет frontend, health, deep health, auth, projects, billing и workflow quote.
- Shadow mode не выполняет второй реальный provider request.
- `AI_LEGACY_RUNTIME_ENABLED` отдельно контролирует создание новых legacy workflow runs.

## Начальная production-конфигурация

```env
AI_ORCHESTRATION_V2=true
AI_POINTS_V2=true
AI_ROUTER_V2=true
AI_ORCHESTRATION_V2_ACTIONS=*
AI_ORCHESTRATION_V2_USERS=
AI_ORCHESTRATION_V2_ROLLOUT_PERCENT=0
AI_LEGACY_RUNTIME_ENABLED=true
```

При проценте `0` V2 доступен администраторам и явному allowlist. Обычные пользователи остаются на legacy runtime.

## Порядок rollout

1. Admin-only, не менее 10 успешных реальных runs.
2. Выбранные пользователи через `AI_ORCHESTRATION_V2_USERS=email1,email2`.
3. `AI_ORCHESTRATION_V2_ROLLOUT_PERCENT=10`.
4. После периода наблюдения: `25`.
5. После периода наблюдения: `50`.
6. После периода наблюдения: `100`.
7. После стабильного периода на 100% установить `AI_LEGACY_RUNTIME_ENABLED=false`.

После изменения env:

```bash
pm2 restart lumaiq-backend --update-env
pm2 save
```

Детерминированный bucket означает, что при расширении процента уже включённые пользователи остаются в V2.

## Условия перехода

- не менее 10 завершённых V2 runs на текущем шаге;
- error rate не превышает `AI_V2_MAX_ERROR_RATE`;
- P90 cost per point не превышает `AI_V2_MAX_P90_COST_PER_POINT_USD`;
- нет роста необработанных `RUNNING`/`QUEUED`;
- нет отрицательного доступного AI-баланса;
- idempotency key не создаёт повторное списание;
- health и authenticated smoke проходят.

Pilot metrics формирует alerts `AI_V2_ERROR_RATE_HIGH` и `AI_V2_P90_COST_HIGH`. Наличие alert запрещает увеличивать процент. Автоматическое переключение production не выполняется, чтобы кратковременный всплеск не менял runtime без решения администратора.

## Rollback

Мягкий откат:

```env
AI_ORCHESTRATION_V2_ROLLOUT_PERCENT=0
AI_ORCHESTRATION_V2_USERS=
```

Полный runtime rollback:

1. Выключить DB flags `AI_ORCHESTRATION_V2` и `AI_POINTS_V2`.
2. Перезапустить backend.
3. Запустить sweeper резервов.
4. Проверить health, PM2 logs и пользовательский баланс.

Откат не удаляет старые workflow runs, artifacts, generations, provider calls, usage/cost и ledger entries.

## Зависшие резервы

- интервал задаётся `AI_POINT_SWEEPER_INTERVAL_MINUTES`;
- возраст резерва задаётся `AI_POINT_STALE_MINUTES`;
- ручной запуск: `POST /api/v1/admin/ai-config/ai-points/sweep`.

Успешная генерация получает capture. Ошибочная, отменённая или истёкшая получает release. Активный workflow не освобождается.

## Production smoke

Публичная проверка:

```bash
cd backend
npm run smoke:production
```

Authenticated smoke без реальной генерации:

```bash
PRODUCTION_SMOKE_EMAIL=... PRODUCTION_SMOKE_PASSWORD=... npm run smoke:production
```

Реальный AI smoke включается только осознанно:

```bash
PRODUCTION_SMOKE_RUN_AI=true PRODUCTION_SMOKE_EMAIL=... PRODUCTION_SMOKE_PASSWORD=... npm run smoke:production
```

## Отключение legacy

Не выполняется в день первого релиза. Условия: rollout 100%, стабильный период без alerts, сверка ledger, подтверждённый rollback и полное покрытие B2B workflow. После этого `AI_LEGACY_RUNTIME_ENABLED=false` запрещает новые legacy workflow runs, сохраняя чтение старых данных.
