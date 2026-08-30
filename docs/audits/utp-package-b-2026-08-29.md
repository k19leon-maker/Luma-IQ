# УТП — пакет B — foundation и server contract

Дата: 2026-08-29

Статус: завершён

## Реализовано

- Добавлен versioned DTO `UtpFoundation v1` для UI и AI.
- Добавлен project-owned builder `utp-foundation.service.ts`.
- Контекст включает niche, audience, JTBD, 3–6 pains, desired outcome, product,
  mechanism, differentiation, proofs и constraints.
- Выбор аудитории детерминирован: явно выбранный сегмент имеет приоритет, один
  сохранённый сегмент выбирается автоматически, несколько сегментов без выбора
  возвращают `missingReason: ambiguous` и список вариантов.
- В proofs попадают только ready-кейсы и явно введённые факты профиля. Draft-кейсы,
  полные CustDev-транскрипты и неподтверждённые fallback-тексты не используются.
- Каждое значение имеет source ref и `editPath`; длина секций и списков ограничена.
- Добавлен owner-checked endpoint
  `GET /api/v1/projects/:id/utp/foundation` с
  `Cache-Control: private, no-store`.
- Workflow `strategy.utp` использует тот же foundation вместо общего project dump.
- Frontend API получил типы и метод чтения foundation для следующего UI-пакета.

## Изоляция и совместимость

- Запрос проекта всегда содержит одновременно `id` и `userId`.
- Ready-кейсы выбираются одновременно по `projectId`, `userId` и `status = ready`.
- Старые расположения профиля `about`, `aboutExpert` и `expertProfile` читаются с
  фактическими source refs.
- База данных, сохранённые УТП и канонический write-path не изменялись.

## Проверки

- 72 целевых теста прошли.
- Backend TypeScript build прошёл.
- Frontend production build прошёл.
- Полный backend regression: 421 тест прошёл, 1 пропущен.
- Осталась 1 не связанная с УТП ошибка provider-boundary для
  `semeyno-ai-relay.controller.ts`.
- `git diff --check` прошёл.

## Итог

Пакет B закрыт. UI и AI имеют один server-owned compact context текущего проекта.
Следующий этап — пакет C: строгий AI-контракт и evidence guardrails.
