DELETE FROM "generated_texts"
WHERE "isMock" = true
   OR to_jsonb("generated_texts")::text ILIKE '%Вы ссоритесь об одном и том же%'
   OR to_jsonb("generated_texts")::text ILIKE '%Большинство пар ссорятся%'
   OR to_jsonb("generated_texts")::text ILIKE '%Ко мне пришла она%'
   OR to_jsonb("generated_texts")::text ILIKE '%Почему пары ссорятся об одном и том же%'
   OR to_jsonb("generated_texts")::text ILIKE '%Интеллект не помогает договориться%'
   OR to_jsonb("generated_texts")::text ILIKE '%3 техники снятия тревоги%'
   OR to_jsonb("generated_texts")::text ILIKE '%Тревога не всегда просит%'
   OR to_jsonb("generated_texts")::text ILIKE '%Миф: к специалисту ходят%'
   OR to_jsonb("generated_texts")::text ILIKE '%История клиентки%'
   OR to_jsonb("generated_texts")::text ILIKE '%Маша и Игор%'
   OR to_jsonb("generated_texts")::text ILIKE '%Невысказанные ожидания разрушают отношения%'
   OR to_jsonb("generated_texts")::text ILIKE '%Пост-боль · Telegram%'
   OR to_jsonb("generated_texts")::text ILIKE '%Пост-инсайт · Instagram%'
   OR to_jsonb("generated_texts")::text ILIKE '%Пост-история · Telegram%';

DELETE FROM "content_plan_items"
WHERE to_jsonb("content_plan_items")::text ILIKE '%Вы ссоритесь об одном и том же%'
   OR to_jsonb("content_plan_items")::text ILIKE '%Большинство пар ссорятся%'
   OR to_jsonb("content_plan_items")::text ILIKE '%Ко мне пришла она%'
   OR to_jsonb("content_plan_items")::text ILIKE '%Почему пары ссорятся об одном и том же%'
   OR to_jsonb("content_plan_items")::text ILIKE '%Интеллект не помогает договориться%'
   OR to_jsonb("content_plan_items")::text ILIKE '%3 техники снятия тревоги%'
   OR to_jsonb("content_plan_items")::text ILIKE '%Тревога не всегда просит%'
   OR to_jsonb("content_plan_items")::text ILIKE '%Миф: к специалисту ходят%'
   OR to_jsonb("content_plan_items")::text ILIKE '%История клиентки%'
   OR to_jsonb("content_plan_items")::text ILIKE '%Маша и Игор%'
   OR to_jsonb("content_plan_items")::text ILIKE '%Невысказанные ожидания разрушают отношения%'
   OR to_jsonb("content_plan_items")::text ILIKE '%Пост-боль · Telegram%'
   OR to_jsonb("content_plan_items")::text ILIKE '%Пост-инсайт · Instagram%'
   OR to_jsonb("content_plan_items")::text ILIKE '%Пост-история · Telegram%';
