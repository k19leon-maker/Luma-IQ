# Этап 8. CustDev V2

Дата завершения: 26 июля 2026.

## Что реализовано

### Транскрибация

- `TRANSCRIBE_MINI` разрешается через `modelRegistryService`, а не через прямой legacy env.
- `TRANSCRIBE_DIARIZE` доступен как явный пользовательский режим «Разделить спикеров».
- Скрытый переход с MINI на более дорогую DIARIZE-модель запрещён.
- В записи CustDev сохраняются:
  - продолжительность;
  - количество частей;
  - model alias и фактический model ID;
  - input/output и audio usage;
  - фактическая стоимость провайдера;
  - generation ID и списанные AI-баллы.
- Транскрибация и AI-анализ остаются разными `actionKey`, generation и ledger lifecycle.

### Очередь и изоляция

- Одновременно могут обрабатываться два файла разных пользователей.
- Для одного пользователя файлы выполняются последовательно.
- Каждый worker повторно проверяет пару `recordId + userId`.
- После рестарта backend записи в `queued` и `transcribing` возвращаются в очередь.
- Ошибка освобождает резерв AI-баллов; успешная обработка выполняет capture один раз.

### AI-анализ

- Pipeline: `LUNA normalize -> TERRA analysis`.
- LUNA получает исходный transcript и создаёт компактный evidence pack.
- TERRA получает только evidence pack и не получает исходный transcript.
- Исходный transcript хранится отдельно от аналитического JSON.
- Аналитический результат содержит задачи, страхи/проблемы/возражения, желания и `summaryForContext`.

### Синтез интервью

- Добавлено действие `castdev_synthesis`, стоимость по умолчанию 100 AI-баллов.
- Пользователь выбирает ровно 5, 10 или 20 завершённых интервью.
- В synthesis передаются только аналитические отчёты и короткие цитаты.
- Pipeline: `TERRA aggregate -> SOL synthesis`.
- SOL не получает необработанные транскрипты.
- Результат сохраняется как `AIArtifact` типа `castdev_synthesis` и появляется в project context.
- Повторный запуск по неизменившемуся набору интервью идемпотентен.

### Project context

- Prisma-запрос CustDev явно выбирает только `id`, `title`, `status`, `analysis`, `updatedAt`.
- `transcriptText` и `transcriptFormatted` не загружаются в project context.
- В контекст попадают summary, ограниченное число коротких цитат и последний синтез.

### Версионирование цены

- Пороговые шкалы транскрибации и анализа вынесены в `pricingPolicy`.
- Политика записывается в metadata `AIActionPricingVersion`.
- Seed создаёт новую ценовую версию при изменении шкалы.
- Фактические audio tokens и USD cost хранятся отдельно от пользовательской цены в AI-баллах.

## API

- `POST /api/v1/castdev/:id/transcribe`
  - body: `{ "mode": "mini" | "diarize" }`
- `POST /api/v1/castdev/:id/analyze`
- `GET /api/v1/castdev/syntheses?projectId=...`
- `POST /api/v1/castdev/syntheses`
  - body: `{ "projectId": "...", "recordIds": ["..."] }`

## Проверки

- Backend production build: успешно.
- Frontend production build: успешно.
- Полный backend suite: 125 passed, 1 skipped.
- Stage 8 contract suite проверяет model routing, fallback, ledger actions, synthesis и независимость очереди пользователей.

## Rollout

Код совместим с legacy runtime. Многоэтапные LUNA/TERRA/SOL pipeline включаются только для пилотных пользователей через общие флаги AI V2 и allowlist действий. Перед production rollout необходимо выполнить seed V2-конфигурации и smoke test на тестовых записях MINI и DIARIZE.
