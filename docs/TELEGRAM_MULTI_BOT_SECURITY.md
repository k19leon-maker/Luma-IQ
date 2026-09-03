# Telegram multi-bot backend: безопасность и API

Статус: реализовано локально, выключено до настройки production secrets и применения миграции.
Дата: 2 сентября 2026.

## Секреты

Новый контур не сохраняет Telegram-токен открытым текстом.

```env
TELEGRAM_WEBHOOK_BASE_URL=https://api.lumaiq.ru/api/v1/telegram-bots/webhooks
TELEGRAM_TOKEN_ENCRYPTION_KEYS={"1":"BASE64_32_BYTE_KEY"}
TELEGRAM_TOKEN_ACTIVE_KEY_VERSION=1
```

Правила:

- ключ — 32 случайных байта в base64;
- реальные ключи не добавляются в Git и не передаются в AI-контекст;
- токен шифруется AES-256-GCM со случайным IV и AAD;
- ciphertext содержит номер ключа, IV, auth tag и шифротекст;
- старые ключи остаются в keyring, пока записи не перешифрованы;
- UI/API получают только маску `••••1234`;
- webhook secret хранится только как SHA-256 hash;
- ошибки проходят через Telegram token redaction.
- при архивировании бота ciphertext и маска токена удаляются из записи.

Сгенерировать ключ можно штатным криптографическим генератором секретов. Не вставлять пример `BASE64_32_BYTE_KEY` в production.

## Authenticated API

Все маршруты ниже требуют обычный JWT Luma IQ. `userId` берётся только из JWT и не принимается в body.

| Метод | Маршрут | Назначение |
| --- | --- | --- |
| `GET` | `/api/v1/telegram-bots` | Список ботов владельца |
| `POST` | `/api/v1/telegram-bots` | Проверить токен через `getMe/getWebhookInfo` и создать запись |
| `GET` | `/api/v1/telegram-bots/:botId` | Получить безопасную карточку бота |
| `PATCH` | `/api/v1/telegram-bots/:botId` | Изменить проект по умолчанию |
| `PUT` | `/api/v1/telegram-bots/:botId/token` | Заменить токен только на токен того же Telegram-бота |
| `GET` | `/api/v1/telegram-bots/:botId/diagnostics` | Проверить текущее состояние Telegram |
| `POST` | `/api/v1/telegram-bots/:botId/webhook` | Настроить персональный webhook |
| `DELETE` | `/api/v1/telegram-bots/:botId/webhook` | Отключить webhook |
| `DELETE` | `/api/v1/telegram-bots/:botId` | Отключить webhook и мягко архивировать бота |

Запрос подключения webhook:

```json
{
  "replaceExistingWebhook": false,
  "dropPendingUpdates": false
}
```

Если Telegram уже указывает на BotHelp или другой сервис, API возвращает `409 TELEGRAM_WEBHOOK_CONFLICT` и безопасный hostname. Замена выполняется только при повторном запросе с `replaceExistingWebhook: true`.

## Public webhook

```text
POST /api/v1/telegram-bots/webhooks/:publicBotKey
X-Telegram-Bot-Api-Secret-Token: <per-bot-secret>
```

- `publicBotKey` случайный и не является database id;
- неизвестный ключ и неверный secret дают одинаковую ошибку `401`;
- бот определяется сервером, а не параметрами Telegram payload;
- `userId` для очереди берётся из найденного бота;
- update дедуплицируется по `(botId, telegramUpdateId)`;
- повторный update подтверждается `200`, но второй раз не ставится в очередь;
- токен бота не нужен и не читается при webhook ingest;
- обработка сценария будет выполняться будущим worker из `BotInboundUpdate`.

Старый `/api/v1/telegram-bots/webhook` оставлен временно для обратной совместимости Google Sheets spike. Новый multi-bot UI должен использовать только маршрут `/webhooks/:publicBotKey`.

## Изоляция

Операции списка, чтения, изменения и удаления включают `userId` в серверный фильтр. Чужой существующий ID и несуществующий ID дают одинаковый `404 TELEGRAM_BOT_NOT_FOUND`. Admin bypass в обычном management service отсутствует.

Перед production rollout обязательны:

1. backup PostgreSQL;
2. secret keyring в окружении backend;
3. проверка `TELEGRAM_WEBHOOK_BASE_URL`;
4. применение Prisma migration;
5. smoke test на отдельном тестовом боте;
6. только затем явное переключение webhook рабочего бота.
