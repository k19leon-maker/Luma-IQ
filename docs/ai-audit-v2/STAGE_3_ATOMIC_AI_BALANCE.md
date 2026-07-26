# Этап 3. Атомарный AI-баланс V2

Дата завершения: 26 июля 2026.

## Результат

Пользовательский AI-баланс переведён на атомарный жизненный цикл:

`PLAN_ACCRUAL/CREDIT/PURCHASE -> RESERVE -> CAPTURE | RELEASE -> REFUND`

Новая логика расширяет существующий `CreditLedgerEntry`. Старые записи не удаляются и остаются в единицах `LEGACY_CREDIT`; новые пользовательские баллы записываются с `unit=AI_POINT`.

## Гарантии

- Операции одного пользователя и расчётного периода сериализуются PostgreSQL advisory lock.
- Доступный баланс проверяется и уменьшается внутри одной транзакции с созданием `RESERVE`.
- Для одной генерации уникальны `RESERVE`, `CAPTURE`, `RELEASE` и `REFUND`.
- Повтор с тем же idempotency key не создаёт повторную генерацию или списание.
- `CAPTURE` выполняется только после успешного AI-ответа.
- Workflow делает `CAPTURE` только после сохранения artifact и результата шага.
- Ошибка провайдера, ошибка сохранения результата и отмена workflow вызывают `RELEASE`.
- Подтверждённая компенсация после списания оформляется через `REFUND` и audit log.
- Технические retries учитываются в provider calls, но не создают новые пользовательские списания.
- Отрицательный доступный баланс запрещён.

## Данные ledger

Каждая новая запись хранит:

- `unit`, `type`, `quantity`, `amount`;
- `balanceBefore`, `balanceAfter`, `reservedAfter`, `availableAfter`;
- `userId`, `projectId`, `billingPeriodId`, `generationId`;
- `actionKey`, `idempotencyKey`, `metadata`;
- `settledAt`, `expiresAt`.

Поддержаны типы:

- `PLAN_ACCRUAL`;
- `CREDIT`;
- `PURCHASE`;
- `RESERVE`;
- `CAPTURE`;
- `RELEASE`;
- `REFUND`;
- `ADMIN_ADJUSTMENT`;
- `EXPIRATION`.

## Обслуживание и админские операции

Добавлены защищённые admin endpoints:

- `POST /api/v1/admin/ai-config/ai-points/reconcile/:userId`;
- `POST /api/v1/admin/ai-config/ai-points/sweep`;
- `POST /api/v1/admin/ai-config/ai-points/refund`.

Reconciliation создаёт идемпотентные `CAPTURE` для успешных legacy-генераций текущего периода. Sweeper проверяет статус generation/workflow и:

- фиксирует capture для уже успешного результата;
- не трогает активный workflow;
- освобождает зависший резерв после timeout;
- не обрабатывает уже закрытый резерв повторно.

## Feature flag и запуск

По умолчанию `AI_POINTS_V2=false`.

Безопасный production rollout:

1. Применить additive Prisma migration.
2. Оставить `AI_POINTS_V2=false` и проверить старые сценарии.
3. Выполнить reconciliation для пилотного пользователя.
4. Сверить новый баланс и историю с legacy-данными.
5. Включить `AI_POINTS_V2` сначала для пилотного окружения.
6. Проверить chat, workflow, CustDev, ошибку генерации и повтор запроса.
7. Расширить включение после сверки экономики.

Rollback: выключить `AI_POINTS_V2`. Legacy credit flow продолжит работать; созданные AI_POINT-записи сохраняются для аудита и последующего возобновления миграции.

## Проверки

- Prisma Client generation и schema validation.
- Backend TypeScript build.
- 63 backend-теста прошли, 1 тест осознанно пропущен.
- 13 целевых тестов AI balance V2, включая deferred capture.
- Покрыты reserve, capture, release, refund, stale reservations, idempotency и запрет перерасхода.

Production migration, включение feature flag и deploy в рамках этапа не выполнялись.
