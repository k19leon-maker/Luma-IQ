# ТГ-канал — отчёт по пакету B

Дата: 24 августа 2026 года
Статус: завершён локально, без deployment

## Что реализовано

- Frontend domain module с единым parse/normalize/serialize-контрактом.
- Чтение legacy v1 через adapter без записи при одном открытии страницы.
- Запись versioned v2 envelope с корневым legacy-зеркалом для rollback.
- Детерминированный выбор последнего `TG_CHANNEL` workspace только текущего
  проекта.
- Project-scoped storage hook с загрузкой, debounce autosave, immediate save для
  AI-результатов, retry и явными статусами сохранения.
- Отмена загрузки и незавершённой записи при смене проекта или размонтировании.
- Сохранение всех элементов legacy-плана без прежнего ограничения в 15 записей.
- Подключение текущего UI `ТГ-канала` к новому storage path без изменения его
  композиции.

## Гарантии совместимости

- Старые workspace не изменяются при чтении.
- Первый следующий save переводит запись в v2 и одновременно сохраняет поля,
  которые понимает старый frontend.
- Неизвестные поля v2 сохраняются при parse/serialize.
- Запросы всегда фильтруются по текущему `projectId` и типу `TG_CHANNEL`.
- На переходном render после смены проекта старый workspace не возвращается UI.
- Ошибка загрузки блокирует редактирование, а ошибка записи сохраняет pending
  revision для ручного retry.

## Проверки

- `frontend: npm run type-check` — успешно.
- Target ESLint для изменённых TG/API-файлов — успешно.
- `frontend: npm run build` — успешно.
- `backend: npm run build` — успешно.
- Контрактные тесты Package A + B — 10 из 10 успешно.
- Покрыты legacy-план из 24 записей, v2 reload, backend Zod compatibility,
  выбор актуальной записи и изоляция двух проектов.
- Локальный browser smoke через dev-login — route открывается; без выбранного
  проекта показывается безопасный empty state, ошибок приложения в console нет.
  Два предупреждения React Router v7 не связаны с этим пакетом.

## Изменённые файлы пакета B

- `frontend/src/api/content.api.ts`
- `frontend/src/pages/TgChannel/TgChannel.tsx`
- `frontend/src/pages/TgChannel/TgChannel.module.css`
- `frontend/src/pages/TgChannel/tgChannelWorkspace.ts`
- `frontend/src/pages/TgChannel/useTgChannelWorkspaceStorage.ts`
- `backend/tests/unit/tg-channel-workspace.frontend.test.ts`

Контракт и fixtures Package A остаются общей основой этого пакета:

- `backend/src/schemas/tg-channel-workspace.schema.ts`
- `backend/tests/fixtures/tg-channel-workspaces.ts`
- `backend/tests/unit/tg-channel-workspace.schema.test.ts`

## Что не делалось

- Production данные не читались и не изменялись повторно.
- Миграция БД не создавалась.
- Deployment не выполнялся.
- UI двух вкладок и list/detail workspace относятся к следующим пакетам C–F.
