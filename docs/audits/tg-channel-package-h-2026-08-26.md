# TG-канал: отчёт по пакету H

Дата: 26 августа 2026 года.

## Результат

- Stable `sourceId` строится из ID плана и ID конкретного TG-поста.
- `POST /content-plan` для `tg-channel:*` обновляет существующую запись вместо дубля.
- Partial unique index по `projectId + sourceId` защищает от параллельных repeat requests и не затрагивает старые типы источников.
- `contentPlanItemId`, `contentPlanSourceId` и дата сохраняются в TG workspace и переживают reload.
- Модальное окно ждёт ответ API, показывает loading/error и не отмечает пост добавленным при ошибке.
- Удаление TG-идеи не удаляет связанный материал из общего Контент-плана; интерфейс явно это сообщает.

## Проверки

- TG regression: 10 test files, 36 tests — passed.
- API repeat action: first request `201 created=true`, repeat `200 created=false`, тот же item ID — passed.
- Backend production build — passed.
- Frontend production build — passed.
- Prisma schema validation — passed.
- Frontend lint — 0 errors; остались прежние warnings в других модулях.
- Backend lint остановлен прежней unrelated-ошибкой `no-control-regex` в `case-study-import.service.ts`.

## Операционные заметки

- Миграция должна быть применена вместе с backend release.
- Деплой в рамках пакета H не выполнялся.
- Полная browser-матрица входит в следующий пакет I.
