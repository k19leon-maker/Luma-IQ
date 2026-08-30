# УТП — пакет A — compatibility audit

Дата: 2026-08-29

Статус: завершён

## Границы аудита

Проведён read-only аудит production-форматов. Запрос читал только
`Project.strategyData` и `Project.utpData`. В вывод попали только типы, ключи,
количества и факт совпадения версий.

Не выводились:

- тексты УТП;
- ID проектов и пользователей;
- email и другие персональные данные;
- история AI-диалогов.

Не выполнялись `UPDATE`, `INSERT`, `DELETE`, миграции, restart или deploy.

## Production-результат

Проверено 14 проектов.

| Состояние | Количество |
| --- | ---: |
| `generatedData.utp` — строка | 6 |
| `generatedData.utp` — отсутствует | 8 |
| `utpHistory` — массив | 4 |
| Элементы history со строковым `value` | 5 |
| `materialsData` — массив | 9 |
| Материал `utp.md` / kind `utp` со строковым content | 6 |
| `generatedData.utpMeta` | 0 |
| legacy `Project.utpData` | 0 |

Сочетания источников:

| Сочетание | Количество |
| --- | ---: |
| Только `utp.md` | 2 |
| Только `generatedData.utp` | 2 |
| `generatedData.utp` + `utp.md` | 4 |
| Нет УТП | 6 |

Во всех четырёх проектах, где есть оба источника, тексты точно совпадают
после удаления технического heading `# УТП`. Конфликтующих версий нет.

## Зафиксированный compatibility contract

### Read precedence

1. Непустая строка `strategyData.generatedData.utp`.
2. Материал `strategyData.materialsData` с `id = utp.md` или `kind = utp`.
3. Legacy `Project.utpData`: прямое поле, `formats` или последнее AI-сообщение.
4. Пустое состояние.

### Canonical write contract для следующих пакетов

- Текущий применённый текст остаётся строкой `generatedData.utp`.
- `utpHistory` не меняет формат.
- `utpMeta` — опциональный versioned-объект; его отсутствие нормально для старых
  проектов.
- `utp.md` должен обновляться вместе с канонической строкой в будущем save-adapter.
- Непринятое AI-предложение не попадает ни в `generatedData.utp`, ни в `utp.md`.
- Legacy `Project.utpData` не удаляется и не перезаписывается в пакете A.

### `utpMeta` version 1

```ts
type UtpMeta = {
  version: 1;
  usedEvidence: Array<{ key: string; label: string; source: string }>;
  missingData: Array<{ key: string; label: string; editPath: string | null }>;
  updatedAt?: string;
};
```

Поле добавлено в whitelist frontend/backend, но пакет A не создаёт и не сохраняет
такие объекты.

## Риски и решения

- Два material-only проекта нельзя считать пустыми. Adapter читает `utp.md`.
- Два generated-only проекта не имеют knowledge-base копии. Синхронизация будет добавлена
  в пакете E, но не в аудите.
- Миграция БД не нужна: все новые метаданные аддитивно помещаются в
  `strategyData.generatedData`.
- Production не содержит legacy-данных, но fixtures сохраняют read-совместимость с
  ранее поддерживавшимися форматами.

## Проверки

- `utp-compatibility-contract.test.ts`;
- `project-strategy-fields.test.ts`;
- `project-context.service.test.ts`;
- 64 целевых теста прошли;
- полный backend regression: 414 тестов прошли, 1 пропущен;
- остались 2 не связанные с УТП ошибки: очистка временного аудиофайла при
  исчерпанном балансе и provider-boundary для `semeyno-ai-relay`;
- backend TypeScript build прошёл;
- frontend production build прошёл;
- `git diff --check` прошёл.

## Итог

Пакет A закрыт. Следующий пакет может опираться на формальный read contract без
миграции и без удаления старых данных.
