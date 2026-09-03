# Luma IQ — ScenarioDefinitionV1

Статус: утверждённый контракт MVP
Версия схемы: `1.0`
Дата: 2 сентября 2026

## Назначение

`ScenarioDefinitionV1` — единственный исполняемый формат Telegram-сценария. AI Builder, ручной редактор и импорт создают одинаковый JSON-документ. Runtime принимает только документ, прошедший структурную и бизнес-валидацию в `backend/src/contracts/chatbot-scenario.contract.ts`.

Текстовое описание от ИИ не исполняется. В сценарии нельзя размещать JavaScript, SQL, shell-команды, произвольные HTTP-запросы или неизвестные действия.

## Корневая структура

```json
{
  "schemaVersion": "1.0",
  "name": "Лид-магнит → консультация",
  "description": "Выдаёт бонус и продолжает прогрев в 09:00 по Москве",
  "timezone": "Europe/Moscow",
  "entrypoints": [],
  "variables": [],
  "nodes": [],
  "edges": [],
  "goals": [],
  "metadata": {
    "locale": "ru",
    "source": "manual"
  }
}
```

## Точки входа

Поддерживаются:

- `start` — команда `/start` без параметра;
- `start_parameter` — `/start <parameter>`;
- `keyword` — точное совпадение или вхождение ключевого слова;
- `manual` — ручной запуск из Luma IQ.

Каждая точка входа имеет уникальный `id` и `targetNodeId`. Ключевые слова по умолчанию сравниваются без учёта регистра. Поэтому `БОНУС` и `бонус` считаются одним триггером.

## Узлы

Разрешены только следующие `type`:

| Тип | Назначение |
| --- | --- |
| `send_message` | Отправить текст до 4096 символов |
| `send_media` | Отправить защищённый asset: изображение, документ, видео или аудио |
| `wait` | Выдержать длительность или дождаться следующего локального времени |
| `condition` | Выбрать ветку по ответу, кнопке, полю или метке |
| `collect_input` | Запросить текст, email, телефон, число или выбор |
| `set_field` | Записать значение в разрешённое поле подписчика |
| `add_tag` | Присвоить метку |
| `remove_tag` | Удалить метку |
| `goal` | Зафиксировать целевое событие |
| `handoff` | Передать пользователя менеджеру или на внешнюю запись |
| `end` | Завершить сценарий |

Кнопки бывают `url` и `callback`. Для каждой callback-кнопки обязан существовать переход с таким же `callbackData`. Telegram-ограничение `callbackData` — 64 байта.

## Ожидание и часовой пояс

Фиксированная задержка:

```json
{
  "id": "wait_one_day",
  "type": "wait",
  "schedule": {
    "type": "duration",
    "seconds": 86400
  }
}
```

Следующее наступление 09:00 по Москве:

```json
{
  "id": "wait_until_0900",
  "type": "wait",
  "schedule": {
    "type": "next_local_time",
    "localTime": "09:00",
    "timezone": "Europe/Moscow",
    "minDelaySeconds": 60
  }
}
```

`next_local_time` означает ближайшее будущее наступление указанного времени в заданной IANA timezone. Runtime не должен превращать `09:00 Europe/Moscow` в жёстко заданные `06:00 UTC`.

## Переменные

Встроенные переменные доступны без объявления:

- `first_name`, `last_name`, `username`;
- `telegram_user_id`, `language_code`;
- `phone`, `email`.

Пользовательские переменные объявляются в `variables`. Подстановка в тексте использует синтаксис `{{variable_name}}`. Запись разрешена в `first_name`, `last_name`, `phone`, `email` и объявленные пользовательские поля. Telegram ID, username и язык доступны только для чтения.

## Переходы

Каждый `edge` содержит `id`, `fromNodeId`, `toNodeId` и необязательное `condition`.

Условия V1:

- `answer_equals`, `answer_contains`;
- `button_callback`;
- `tag_present`, `tag_absent`;
- `field_equals`, `field_exists`.

Обычный узел имеет ровно один безусловный выход. `condition` имеет минимум две ветки и ровно один безусловный fallback. `end` не имеет выходов.

## Пример: ключевое слово «БОНУС» и следующее сообщение в 09:00 МСК

```json
{
  "schemaVersion": "1.0",
  "name": "Бонус и прогрев",
  "timezone": "Europe/Moscow",
  "entrypoints": [
    {
      "id": "bonus_keyword",
      "type": "keyword",
      "value": "БОНУС",
      "match": "exact",
      "caseSensitive": false,
      "targetNodeId": "send_bonus"
    }
  ],
  "variables": [],
  "nodes": [
    {
      "id": "send_bonus",
      "type": "send_message",
      "text": "Здравствуйте, {{first_name}}! Ваш бонус готов.",
      "parseMode": "plain",
      "disableWebPreview": false,
      "buttons": [
        {
          "type": "url",
          "label": "Получить бонус",
          "url": "https://lumaiq.ru/bonus"
        }
      ]
    },
    {
      "id": "wait_until_0900",
      "type": "wait",
      "schedule": {
        "type": "next_local_time",
        "localTime": "09:00",
        "timezone": "Europe/Moscow",
        "minDelaySeconds": 60
      }
    },
    {
      "id": "send_day_2",
      "type": "send_message",
      "text": "День 2. Продолжаем цепочку.",
      "parseMode": "plain",
      "disableWebPreview": false
    },
    {
      "id": "finish",
      "type": "end",
      "reason": "Цепочка завершена"
    }
  ],
  "edges": [
    { "id": "bonus_to_wait", "fromNodeId": "send_bonus", "toNodeId": "wait_until_0900" },
    { "id": "wait_to_day_2", "fromNodeId": "wait_until_0900", "toNodeId": "send_day_2" },
    { "id": "day_2_to_end", "fromNodeId": "send_day_2", "toNodeId": "finish" }
  ],
  "goals": [],
  "metadata": {
    "locale": "ru",
    "source": "manual"
  }
}
```

Для десятидневной цепочки между сообщениями добавляются девять узлов `wait` с `next_local_time = 09:00`.

## Инварианты публикации

Перед публикацией валидатор обязан подтвердить:

1. все ID уникальны и все ссылки ведут на существующие узлы;
2. все узлы достижимы из точки входа;
3. из каждого достижимого узла существует путь к `end`;
4. циклов нет;
5. шаблонные переменные и цели объявлены;
6. callback-кнопки имеют соответствующие переходы;
7. количество узлов не превышает 100, переходов — 200;
8. максимальный горизонт сценария не превышает 366 дней;
9. неизвестные поля и неизвестные типы действий отклонены.

Публикуемая версия неизменяема. Любое ручное или AI-редактирование создаёт новый draft `BotScenarioVersion`; активные исполнения продолжают ссылаться на свою опубликованную версию.
