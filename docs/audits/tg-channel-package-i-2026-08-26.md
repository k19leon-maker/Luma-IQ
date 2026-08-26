# Luma IQ — ТГ-канал — пакет I

Дата: 26 августа 2026 года  
Объём: responsive, accessibility и regression QA  
Среда: локальный production-like frontend и изолированный mock API  
Production: не изменялся

## Что доработано

- Добавлена полноценная клавиатурная навигация между вкладками: стрелки,
  `Home`, `End` и циклический переход.
- Для вкладок настроен roving focus; активная вкладка остаётся единственной в
  обычной последовательности Tab.
- Меню действий получают фокус при открытии, поддерживают стрелки,
  `Home`/`End` и закрытие по `Escape` с возвратом фокуса на кнопку.
- Подтверждение удаления получает безопасный начальный фокус на «Отмена» и
  закрывается по `Escape` без удаления.
- На tablet/mobile переход list → detail переводит фокус на «К плану», а
  возврат — на выбранную карточку поста.
- Добавлены `aria-busy`, alert/status semantics, подписи icon-only действий,
  видимые focus states и человекочитаемые статусы фоновой генерации.
- Уточнены размеры вкладок и кнопок на экранах 360–430 px.

## Проверки кода

- Frontend lint: успешно, 0 ошибок; остаются 14 ранее существовавших warnings в
  других модулях.
- Frontend production build: успешно.
- Backend TypeScript build: успешно.
- TG unit/integration suite: 9 файлов, 37 тестов — успешно.
- Idempotency integration: 1 файл, 1 тест — успешно; повторная передача
  обновляет существующий материал (`201` → `200`) и не создаёт дубль.

## Browser QA

Проверены размеры:

- 1440×900 — list/detail одновременно, без page jump и horizontal scroll;
- 1024×768 — компактный list → detail, возврат «К плану»;
- 768×1024 — компактный list → detail, корректный фокус;
- 430×932, 390×844 и 360×800 — одна рабочая область, без переполнения страницы.

Дополнительно проверены:

- прямой URL вкладки и browser history;
- клавиатурное переключение вкладок;
- клавиатурное управление обоими action menu;
- безопасная отмена удаления;
- autosave описания и восстановление значения после повторного входа;
- переключение между двумя изолированными project-scoped workspace;
- insufficient-context ссылки;
- copy actions с доступными названиями;
- loading/saving/error/retry/balance/batch состояния по UI-контрактам и
  профильным тестам;
- browser console: ошибок приложения нет; только два существующих
  React Router future warnings.

Живые AI-вызовы и списания намеренно не выполнялись на локальном QA. Корректность
quote/billing/idempotency покрыта тестами; сверка production AI ledger входит в
контролируемый пакет J.

## Скриншоты

- `docs/audits/tg-channel-package-i-2026-08-26/desktop-1440x900.png`
- `docs/audits/tg-channel-package-i-2026-08-26/tablet-768x1024.png`
- `docs/audits/tg-channel-package-i-2026-08-26/mobile-390x844.png`

## Итог

Пакет I завершён. Следующий этап — пакет J: backup, контролируемый rollout и
production smoke на реальных legacy/empty workspace со сверкой AI ledger.
