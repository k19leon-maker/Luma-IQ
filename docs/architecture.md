# Архитектура LumaIQ

## Схема взаимодействия

```
[Browser] → [Frontend :5173] → [Backend API :3001]
                                      ↓
                              [PostgreSQL :5432]
                              [Redis :6379]
                                      ↓
                              [AI APIs: OpenAI / Claude / Gemini / Grok]
```

## API Эндпоинты (v1)

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/v1/auth/register` | Регистрация |
| POST | `/api/v1/auth/login` | Вход по email/пароль |
| GET | `/api/v1/auth/google` | OAuth через Google |
| POST | `/api/v1/auth/refresh` | Обновление токена |
| GET | `/api/v1/jtbd/chat` | JTBD-чат (WebSocket) |
| GET | `/api/v1/products` | Список продуктов |
| POST | `/api/v1/products` | Создать продукт |
| POST | `/api/v1/generate/text` | Генерация текста |
| GET | `/api/v1/audience` | Аватары ЦА |
| GET | `/api/v1/plans` | Тарифные планы |

## Модели БД

- `users` — пользователи (психологи)
- `projects` — проекты психолога
- `audience_avatars` — аватары целевой аудитории
- `jtbd_sessions` — сессии JTBD-чата
- `products` — продукты (лид-магнит / мини / основной)
- `generated_texts` — сгенерированные тексты
- `subscriptions` — подписки и тарифы
