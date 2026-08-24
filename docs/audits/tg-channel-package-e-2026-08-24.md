# ТГ-канал: пакет E — AI для описания

Дата: 24 августа 2026 года.

## Результат

- Генерация и доработка описания разделены на action codes
  `tg_channel_description_generate` и `tg_channel_description_improve`.
- Цена показывается из backend quote: 5 и 2 AI-балла соответственно.
- Backend собирает ограниченный контекст проекта без истории контента и кейсов.
- Workflow возвращает строгий JSON `{ channelName, channelDescription }`.
- Название ограничено 128 символами, описание — 250; лишние поля запрещены.
- Один composer принимает quick action, текст или голосовую расшифровку.
- Расшифровка остаётся в поле и не запускает AI автоматически.
- AI-вариант показывается рядом с текущим; workspace меняется только после
  явного действия «Применить вариант».
- Добавлены loading lock, уникальные idempotency keys, retry и billing tests.

## Проверки

- Target Vitest: 7 файлов, 66 тестов — успешно.
- Backend build — успешно.
- Frontend type-check, lint и production build — успешно; lint содержит только
  ранее существовавшие warnings.
- `git diff --check` — успешно.
- Browser smoke 1440×900 и 390×844 — успешно.
- Quick action только заполняет composer; AI запускается отдельной кнопкой.
- До «Применить вариант» поля не меняются; после применения обновляются оба.
- На 390 px `scrollWidth === clientWidth`, горизонтального скролла нет.

Полный backend suite: 350 тестов прошли, один ранее существовавший тест
`provider-boundary.test.ts` падает из-за прямого OpenAI URL в
`semeyno-ai-relay.controller.ts`. Этот модуль не относится к пакету E и не
изменялся.

## Скриншоты

- `screenshots/tg-channel-package-e-desktop-before.png`
- `screenshots/tg-channel-package-e-desktop-proposal.png`
- `screenshots/tg-channel-package-e-mobile.png`

## Релиз

Production и production database не изменялись. Следующий пакет — F:
двухпанельный workspace контент-плана.
