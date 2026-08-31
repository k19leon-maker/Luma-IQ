# Luma IQ — пакет G «Создание УТП»: regression QA и rollout

Дата: 30 августа 2026 года  
Статус: завершён

## Защита данных и rollback

- До релиза создан полный production backup:
  `/app/backups/lumaiq-pre-utp-package-g-20260830-073933.dump`.
- Размер: 6 149 223 байта.
- SHA-256:
  `9ce2616d1c2a21416a9ac1c6a1f7f81c0fa2ac7e55bad54fa17a8ad6ad2e75aa`.
- Архив проверен через `pg_restore --list`.
- Rollback point до релиза: `0bd0b4773dcc51e4efcdcbb4ffe8c15467ace010`.
- Prisma до релиза подтвердил 36 миграций и актуальную схему; для УТП новая
  миграция БД не требуется, данные остаются в обратно совместимом JSON-контракте.

## Автоматические проверки

- Frontend type-check: успешно.
- Frontend production build: успешно, 2243 модуля.
- Frontend lint: 0 ошибок; 14 ранее существовавших предупреждений вне УТП.
- Backend production build: успешно.
- Prisma validate: успешно.
- Target UTP suite: 13 файлов, 117 тестов успешно.
- Полный backend suite: 458 успешно, 1 пропущен, 1 известная несвязанная ошибка
  `provider-boundary.test.ts` в старом `semeyno-ai-relay`.
- Изменённые backend-файлы УТП проходят ESLint.
- `git diff --check`: успешно.

## Browser QA

Проверены размеры:

- 1440×900;
- 1024×768;
- 768×1024;
- 430×932;
- 390×844;
- 360×800.

На каждом размере горизонтальный overflow равен 0. Desktop сохраняет
двухколоночную структуру, tablet/mobile переходят в последовательность
foundation → editor. Финальные скриншоты лежат в
`docs/audits/utp-package-g-2026-08-30/`.

Проверены сценарии:

- загрузка сохранённого УТП и empty state;
- ручная правка → один autosave → reload;
- изоляция двух проектов одного пользователя;
- первая AI-генерация в пустом проекте;
- improve с current/proposed без записи до подтверждения;
- discard через Escape и apply с одной записью;
- copy action, help popover и ссылки missing data;
- голосовой контракт: транскрипция остаётся редактируемой и отправляется
  отдельным действием;
- отсутствие новых ошибок browser console.

Owner denial, foreign `projectId`, legacy precedence, revision conflict,
idempotency и отсутствие AI-списания при ручной правке закрыты backend/unit
контрактами.

Accessibility проверен через axe WCAG 2A/2AA на desktop и mobile:
0 нарушений, 0 incomplete. В ходе QA исправлены контраст малых подписей и
ARIA-связь плавающего глобального меню.

## Production rollout

- Основной release commit:
  `0926abf348e7030393623a1bafa173adf80668df`.
- Production guardrail hotfix:
  `83b550a256f3e019a9e372e5c6daeb5e7acca04c`.
- Backend обновлён на сервере `/app`, production build выполнен успешно,
  `lumaiq-backend` имеет статус `online`.
- Prisma подтвердил 36 миграций и отсутствие pending migrations.
- Frontend опубликован Git-интеграцией Vercel; deployment release commit имеет
  статус `READY`, маршрут `/app/strategy/utp` и UTP chunk отвечают HTTP 200.
- Public health: HTTP 200. Deep health: DB, OpenAI, Anthropic и model pricing
  `ok`; только необязательный SMTP имеет статус `warn`.
- Неавторизованный маршрут корректно переводит на
  `/auth?next=%2Fapp%2Fstrategy%2Futp`, overflow равен 0, browser console пуст.

Для авторизованного production smoke был создан отдельный временный пользователь
и изолированный проект без реальных пользовательских данных.

- Foundation endpoint вернул правильный `projectId` и ready-секции niche,
  audience, JTBD, pains, desired outcome, mechanism и differentiation.
- Quote `strategy.utp.generate`: 20 AI-баллов.
- Первая попытка выявила два слишком строгих edge case: prompt не передавал
  точные `editPath`, а отрицание «без гарантии» считалось обещанием. Результат
  не был сохранён; ledger зафиксировал `RESERVE → RELEASE`, capture равен 0.
- После hotfix `83b550a` реальная OpenAI-генерация успешно прошла строгий JSON и
  grounding validation; итоговая длина УТП — 635 символов.
- Повтор с тем же idempotency key вернул тот же artifact и generation.
- Баланс изменился ровно с 2000 до 1980; одна запись `CAPTURE -20`, двойного
  списания нет.
- Workspace сохранился и перечитался с revision 1.
- После проверки временный пользователь удалён каскадно; контрольный запрос
  подтвердил `remainingQaUsers: 0`.

Product/content context regression подтверждает, что основные продукты,
лид-магниты, посты, Reels, статьи, Threads, TG-канал, Instagram, чатботы,
видео и Контент-план получают применённое `generatedData.utp` как
high-priority context и не читают непринятое AI-предложение.

## Неблокирующие наблюдения

- Полный backend suite сохраняет известную несвязанную ошибку provider boundary
  из-за прямого OpenAI URL в `semeyno-ai-relay.controller.ts`.
- Headless Chrome не предоставляет реальный микрофон. UI-контракт голосового
  ввода проверен unit-тестом и общим `VoiceComposer`; production AI не запускается
  автоматически после транскрипции.
