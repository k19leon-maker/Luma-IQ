# Action-key compatibility map

Дата: 26 июля 2026

## Правило совместимости

Существующие `featureCode` остаются стабильными ключами хранения и аналитики. Новый orchestrator должен принимать canonical action key и явно преобразовывать legacy keys. Неизвестный ключ должен завершаться ошибкой конфигурации, а не fallback на `ai_chat`.

| Backend featureCode сейчас | User action сейчас | Canonical V2 action | Совместимость | Комментарий |
|---|---|---|---|---|
| `ai_chat` | `ai_chat` | `ai_chat` | Прямая | AI-dialog pipeline |
| `about_ai_summary` | `strategy_about` | `strategy_about` | Alias | Сохранить старый feature в historical rows |
| `positioning` | `positioning` | `positioning` | Прямая | V2 multi-stage |
| `audience` | `audience` | `audience` | Прямая | V2 multi-stage |
| `jtbd` | `audience` | `audience` | Legacy alias | Источник `jtbd` хранить в metadata |
| `utp` | `utp` | `utp` | Прямая | Добавить отдельный `offer` |
| `social` | `social` | `social` | Прямая | V2 TERRA/LUNA/TERRA |
| `product_main` | `product_main` | `product_main` | Прямая | Шаги входят в один logical action |
| `product_mini` | `product_mini` | `product_mini` | Прямая | Шаги входят в один logical action |
| `lead_magnet` | `lead_magnet` | `lead_magnet` | Прямая | Шаги входят в один logical action |
| `post` | `content_post` | `content_post` | Alias | Historical `post` не переписывать |
| `reel` | `content_reel` | `content_reel` | Alias | Historical `reel` не переписывать |
| `threads` | `content_thread` | `content_thread` | Alias | Раздел Threads |
| `chatbot_chain` | `content_thread` | `chatbot_scenario` | Split alias | Новые runs писать как `chatbot_scenario` |
| `article` | `content_article` | `article` | Alias | `content_longread` временно маппится сюда |
| `video_script` | `youtube_script` | `video_script` | Alias | `youtube_script` остаётся UI label |
| `content_plan` | `content_plan` | `content_plan` | Прямая | Планирование |
| `tg_channel_plan` | `tg_channel_plan` | `tg_channel_plan` | Прямая | Pipeline TERRA/LUNA |
| `tg_channel_post` | `tg_channel_post` | `tg_channel_post` | Прямая | LUNA |
| `tg_channel_post_edit` | `tg_channel_post_edit` | `tg_channel_post_edit` | Прямая | LUNA, compact context |
| `tg_channel_post_audio_adapt` | тот же | тот же | Прямая | LUNA |
| `tg_channel_post_video_script` | тот же | тот же | Прямая | LUNA |
| `castdev_transcription` | тот же | тот же | Прямая | Transcription profiles |
| `castdev_analysis` | тот же | тот же | Прямая | LUNA → TERRA |

## Ключи, которые есть только в пользовательском registry

| Текущий key | Проблема | Решение V2 |
|---|---|---|
| `strategy_rebuild` | Нет backend `FeatureCode` | Добавить canonical action и pipeline |
| `content_longread` | Молча проходит через `article`/fallback | Явный alias к `article` либо отдельный action |
| `youtube_script` | Backend хранит `video_script` | Явный compatibility alias |

## Новые V2 actions

| Новый action | Legacy источник | Назначение |
|---|---|---|
| `offer` | Частично `utp` | Стратегический оффер |
| `selling_post` | Частично `post`/`tg_channel_post` | TERRA → LUNA |
| `chatbot_scenario` | `chatbot_chain` | Архитектура и тексты чат-бота |
| `castdev_synthesis` | Нет | Синтез группы интервью |
| `product_strategy` | Нет | Стратегическая проверка линейки |

## Текущие workflows и models

| Workflow family | Feature | Model registry сейчас |
|---|---|---|
| `ai.dialog` | `ai_chat` | `gpt-5.4` |
| `posts.*`, `reels.*`, `articles.*`, `chatbot.chain`, `video.*` | content features | `gpt-5.4` |
| `product.main`, `product.mini`, `leadmagnet` | product features | `gpt-5.5` |
| `positioning.*`, `strategy.*` | strategy features | `gpt-5.5` |
| `threads.*`, `tg-channel.*` | content/TG | `gpt-5.5` |
| `castdev/analysis` | `castdev_analysis` | `gpt-5.5` |

Dynamic product step configs наследуют тот же feature/model и создают отдельную generation на каждый шаг. При V2 action-level billing pipeline должен агрегировать provider calls под одним logical action.

## Запрещённый fallback

Текущая функция `featureCodeToAiAction` возвращает `ai_chat` для любого неизвестного feature. Это может превратить дорогую генерацию в списание 1 AI-балла. В этапе 1 заменить на:

1. явную compatibility table;
2. typed validation;
3. server error `UNKNOWN_AI_ACTION`;
4. admin alert без provider call и без списания.

