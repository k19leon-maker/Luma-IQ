# TG_CHANNEL — Package A audit and compatibility contract

Дата: 24 августа 2026 года
Режим production-аудита: **read-only**
Содержимое, названия проектов, email и идентификаторы в отчёт не выгружались.

## 1. Endpoint и data-flow matrix

| Сценарий | Frontend | API | Хранение / результат | Ownership |
|---|---|---|---|---|
| Загрузка workspace | `useContentApi({ projectId, type: 'TG_CHANNEL' })` | `GET /api/v1/content?projectId=...&type=TG_CHANNEL` | `GeneratedText.content` как JSON | backend проверяет `Project.userId` |
| Первое сохранение | `saveItem` | `POST /api/v1/content` | новая `GeneratedText`, type `TG_CHANNEL` | backend проверяет владельца проекта |
| Обновление плана/поста | `updateItem(savedId, ...)` | `PATCH /api/v1/content/:id` | полная замена JSON `content` и `metadata` | backend ищет запись через проект пользователя |
| Контекст стратегии | `projectsApi.getStrategy*` | `GET /api/v1/projects/:id/strategy` | project strategy fields | project-scoped route |
| План канала | `aiApi.startWorkflow('tg-channel.plan')` | `POST /api/v1/ai/workflows/tg-channel.plan/start` | AI artifact + последующее сохранение workspace | auth, project context, billing |
| Один пост / edit / audio / video | `tg-channel.post|edit|audio|video` | `POST /api/v1/ai/workflows/:workflow/start` | AI artifact + вложенный `item.post` | auth, project context, billing |
| Batch постов | `aiApi.createBatch` / `getBatch` | `POST/GET /api/v1/ai/batches` | durable batch job; результат затем переносится в workspace | auth и project scope |
| Передача в контент-план | `openAddModal` | `POST /api/v1/content-plan` | отдельный `ContentPlanItem` | project ownership в content-plan API |

Текущая запись выбирается frontend как первая не-demo запись из списка, который
отсортирован по `createdAt desc`. Это не гарантирует выбор последней изменённой
записи и должно быть исправлено в пакете B.

## 2. Анонимизированный production-аудит

Снимок выполнен 24 августа 2026 года запросом только на чтение.

- записей `TG_CHANNEL`: **3**;
- проектов: **2**;
- владельцев: **2**;
- валидный JSON: **3 из 3**;
- `schemaVersion`: отсутствует во всех 3 записях;
- элементов плана: **44**, по **14–15** в workspace;
- вложенных готовых постов: **11**;
- статусы: `idea` — 33, `ready` — 8, `planned` — 3;
- неверных JSON и не-object roots: **0**.

Наблюдался один корневой формат:

```text
title, strategySummary, items, settings,
sourceSnapshot, aiPromptVersion, generatedAt
```

Наблюдался один settings-формат:

```text
channelName, channelFor, conversionPoint, conversionDetails
```

Item-варианты отличаются только наличием `post` и `plannedDate`. Вложенный post
имеет поля `title`, `text`, `callToAction`, `authorComment`, `status`.

Вывод: production пока целиком legacy v1. Миграция БД не нужна, но read adapter
обязан сохранить все 44 item, 11 постов и 3 planned dates. Ограничение frontend
`slice(0, 15)` нельзя переносить в data contract: адаптер не обрезает данные.

## 3. Compatibility contract

Каноническая новая форма — `TgChannelWorkspaceV2` с `schemaVersion: 2`:

- `channel.name` и новый `channel.description`;
- старые `channelFor` и conversion settings только в `legacyContext`;
- `plan.items` с `position`, `readerTask`, `keyMessage`, `cta`;
- готовый post хранит content, CTA, author comment и previous AI version;
- связи с общим контент-планом имеют отдельные stable IDs;
- количество сохранённых items не обрезается контрактом.

Правила v1 → v2:

1. `clientTask` → `readerTask`.
2. `callToAction` → `cta`.
3. `channelFor` не переносится в `channel.description`.
4. Отсутствующий `keyMessage` остаётся пустым.
5. ID, порядок, статусы, post, author comment и planned date сохраняются.
6. Чтение не вызывает запись и не мутирует исходный объект.

Исполняемый контракт:

- `backend/src/schemas/tg-channel-workspace.schema.ts`;
- fixtures: `backend/tests/fixtures/tg-channel-workspaces.ts`;
- tests: `backend/tests/unit/tg-channel-workspace.schema.test.ts`.

## 4. Rollback contract

Для первой production-версии v2 применяется dual-write внутри одного JSON:

1. Канонические `schemaVersion/channel/plan` записываются вместе с корневым
   legacy mirror `title/strategySummary/items/settings`.
2. Старый frontend после rollback сможет читать название, план, готовые посты и
   planned dates из mirror.
3. Legacy-запись конвертируется только в памяти; обычное чтение её не перезаписывает.
4. Первая v2-запись создаётся только после успешного пользовательского изменения.
5. Перед включением v2 writer нужен backup `generated_texts` для `TG_CHANNEL`.
6. При emergency rollback запись в TG_CHANNEL нужно временно заморозить: старый
   writer не знает `channel.description` и может удалить v2-only поля при PATCH.
7. Legacy mirror нельзя удалять до отдельного аудита adoption и подтверждённого
   restore-теста.

## 5. Не входит в пакет A

- подключение схемы к runtime frontend/backend;
- autosave;
- изменение UI и вкладок;
- миграция или изменение production-данных;
- новые AI workflow и списания;
- исправление idempotency контент-плана.

Это задачи следующих пакетов дорожной карты.

## 6. Проверка

- targeted contract tests: **6/6 passed**;
- backend TypeScript production build: **passed**;
- ESLint нового schema module: **passed**;
- полный backend suite вне sandbox: **332 passed, 1 skipped, 1 failed**.

Единственный fail полного suite существовал вне этого пакета:
`provider-boundary.test.ts` обнаруживает прямой URL OpenAI в
`controllers/semeyno-ai-relay.controller.ts`. Новый TG_CHANNEL contract этот
контроллер и provider boundary не изменяет.
