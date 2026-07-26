# Model availability matrix

Проверка OpenAI project: 26 июля 2026  
Метод: Models API с существующим server-side key; ключ не выводился и не копировался в артефакт.

## Целевые профили V2

| Alias | Actual API model ID | Доступен проекту | Официальная standard price / 1M | Роль |
|---|---|---:|---|---|
| `SOL` | `gpt-5.6-sol` | Да | input $5.00, cached $0.50, output $30.00 | Стратегический синтез |
| `TERRA` | `gpt-5.6-terra` | Да | input $2.50, cached $0.25, output $15.00 | Анализ и конструирование |
| `LUNA` | `gpt-5.6-luna` | Да | input $1.00, cached $0.10, output $6.00 | Массовая генерация и форматирование |
| `TRANSCRIBE_MINI` | `gpt-4o-mini-transcribe` | Да | audio input $1.25, output $5.00 | Обычная транскрибация |
| `TRANSCRIBE_DIARIZE` | `gpt-4o-transcribe-diarize` | Да | audio input $2.50, output $10.00 | Транскрибация с говорящими |

Целевые идентификаторы подтверждены, временные профили не требуются.

## Legacy models

| Model ID | Где используется | Доступен |
|---|---|---:|
| `gpt-5.5` | Prompt registry strategy/product/TG/Threads/CustDev | Да |
| `gpt-5.4` | Prompt registry content/chat и env default | Да |
| `gpt-5.4-mini` | Frontend selector и pricing DB | Да |
| `gpt-4o` | Frontend legacy selector | Да |
| `gpt-4o-mini-transcribe` | Voice и CustDev | Да |
| `claude-opus-4-6` | Frontend selector, pricing | Configured, live availability не проверялась |
| `claude-sonnet-4-6` | Frontend selector, pricing | Configured, production usage подтверждено |
| `claude-haiku-4-5-20251001` | Frontend/default/JTBD | Configured, production usage подтверждено |

## Где model IDs размазаны сейчас

- `frontend/src/store/model.store.ts`
- `backend/src/config/env.ts`
- `backend/.env.example`
- `backend/src/services/ai.service.ts`
- `backend/src/prompts/registry/content-workflows.ts`
- `backend/src/controllers/jtbd.controller.ts`
- `backend/src/controllers/b2c-psychologist.controller.ts`
- `backend/src/controllers/audio.controller.ts`
- `backend/src/services/castdev-transcription.service.ts`
- Production `AIModelPricing`
- Prompt CMS versions/experiments

Frontend отправляет `openaiModel` и `claudeModel`; workflow выбирает request override раньше prompt registry. В V2 браузер должен отправлять только action/workflow, а model profile выбирает backend.

## Production pricing registry

На момент аудита активны:

- OpenAI `gpt-5.5`: 5 / 0.5 / 30 USD
- OpenAI `gpt-5.4`: 2.5 / 0.25 / 15 USD
- OpenAI `gpt-5.4-mini`: 0.75 / 0.075 / 4.5 USD
- Anthropic Opus 4.6: 5 / 0.5 / 25 USD
- Anthropic Sonnet 4.6: 3 / 0.3 / 15 USD
- Anthropic Haiku 4.5: 1 / 0.1 / 5 USD

Перед переключением V2 добавить versioned records для `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna` и отдельные audio price fields/records. Иначе `aiGenerationService` остановит запрос с `MODEL_PRICING_MISSING`.

## Важные условия цены

- Указанные цены относятся к standard processing.
- Для очень большого контекста GPT-5.6 действует повышающий коэффициент согласно model docs.
- Cached input нельзя одновременно считать как обычный input и cached input.
- Batch API даёт скидку 50%, но имеет асинхронный SLA до 24 часов.
- Reasoning tokens входят в output usage и не должны добавляться второй раз.

## Официальные источники

- [OpenAI model catalog](https://developers.openai.com/api/docs/models)
- [GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra)
- [OpenAI API pricing](https://openai.com/api/pricing/)
- [GPT-4o mini Transcribe](https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe)
- [GPT-4o Transcribe Diarize](https://developers.openai.com/api/docs/models/gpt-4o-transcribe-diarize)

