# УТП — пакет E — редактор, autosave и сохранность данных

Дата: 29 августа 2026 года

Статус: завершено локально, без деплоя и без изменения production-данных.

## Что реализовано

- Добавлены owner-checked `GET/PUT /projects/:id/utp/workspace`.
- Сервер читает каноническое УТП, `utp.md` и старый `utpData` в прежнем порядке
  совместимости. Старые данные не мигрируются при простом чтении.
- Сохранение одной транзакцией обновляет `generatedData.utp`, историю, metadata,
  revision и `materialsData/utp.md`, сохраняя соседние поля и версии материала.
- Revision guard и serializable transaction возвращают `409`, если другая вкладка
  уже сохранила более новую версию.
- Редактор получил project-scoped serial autosave с debounce 700 ms. При смене
  проекта pending-снимок отправляется только со старым `projectId`; ввод для
  неактивного проекта игнорируется.
- UI показывает `pending`, `saving`, `saved`, `error` и действие «Повторить».
- Ручная сессия создаёт одну версию «До ручной правки», а не историю на каждую
  клавишу. Восстановление также сохраняет точку возврата.
- Ручной save-path не использует AI workflow, провайдер или AI ledger.

## Проверки

- Backend TypeScript build: успешно.
- Frontend production build: успешно.
- ESLint изменённых frontend-файлов: успешно.
- UTP targeted regression: 43 теста успешно, включая serial autosave race.
- Полный backend regression вне sandbox: 450 тестов успешно, 1 skipped, 1 ранее
  известная несвязанная ошибка `provider-boundary.test.ts` из-за прямого OpenAI URL
  в `controllers/semeyno-ai-relay.controller.ts`.
- `audio-controller.test.ts` один раз упал в полном параллельном прогоне из-за
  проверки удаления временного файла; отдельный повтор прошёл (7/7).
- `git diff --check`: успешно.

## Следующий этап

Пакет F: current/proposed AI-генерация и доработка с обязательным подтверждением
перед заменой текущего ручного текста, плюс проверка голосового сценария и
идемпотентного списания.
