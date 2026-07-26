# Этап 5. Пилот LUNA-действий и AI-диалога

Дата реализации: 26 июля 2026.

## Что реализовано

- Пилотные action keys `content_post`, `content_reel`, `content_thread`, `tg_channel_post` и `tg_channel_post_edit` поддерживают orchestrator V2.
- Добавлены отдельные ключи для редактирования и полной регенерации постов, рилсов и цепочек.
- AI-диалог разделён на три класса:
  - `ai_chat_quick` — 5 AI-баллов;
  - `ai_chat_deep` — 20 AI-баллов;
  - `ai_chat_strategy` — 60 AI-баллов.
- Режим `auto` выбирает класс детерминированно по длине и маркерам запроса. Для классификации не вызывается AI.
- `POST /api/v1/ai/workflows/:workflow/quote` возвращает серверную стоимость до запуска.
- Workflow-запросы frontend больше не передают provider и model IDs.
- Workflow-ответ пользователю больше не содержит model и provider.
- Цена на кнопках постов, рилсов, Threads и ТГ-канала загружается с backend.
- Оркестратор передаёт явный `actionKey` в единый generation/billing слой. Резерв, capture и история используют один и тот же ключ.
- Пилот ограничен администраторами и allowlist пользователей.
- `GET /api/v1/admin/ai-config/pilot-metrics` считает runs, error rate, cost, points, P50/P90 latency и P50/P90 cost per point.

## Включение пилота

Нужны одновременно:

1. Feature flags `AI_POINTS_V2=true` и `AI_ORCHESTRATION_V2=true`.
2. `AI_ORCHESTRATION_V2_ACTIONS=ai_chat,content_post,tg_channel_post,tg_channel_post_edit,content_reel,content_thread`.
3. Для обычных пользователей: `AI_ORCHESTRATION_V2_USERS` со списком UUID или email через запятую.

Администратор считается участником пилота автоматически. Пустой action allowlist оставляет весь трафик на legacy runtime.

## Rollback

- Выключить `AI_ORCHESTRATION_V2`, либо
- удалить action key из `AI_ORCHESTRATION_V2_ACTIONS`, либо
- удалить пользователя из `AI_ORCHESTRATION_V2_USERS`.

Миграция данных для rollback не требуется. Legacy workflow остаётся рабочим.

## Проверки

- Backend TypeScript build: успешно.
- Frontend TypeScript/Vite build: успешно.
- Backend full test suite: 75 успешно, 1 staging test пропущен.
- Rollback flag и action allowlist покрыты unit test.

## Что измерять на пилоте

- `p90CostPerPointUsd` по каждому action key.
- error rate и P90 latency.
- долю повторных генераций.
- ручную оценку качества результата относительно baseline этапа 0.

Фактическое сравнение качества и экономики заполняется после накопления пилотных production runs.
