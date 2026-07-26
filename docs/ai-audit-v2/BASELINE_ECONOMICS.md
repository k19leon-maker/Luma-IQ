# Baseline AI economics snapshot

Production capture: 26 июля 2026, 07:54 UTC  
Доступный период generations: 19 мая 2026 — 24 июля 2026  
Метод: read-only агрегаты, без email, prompt text и пользовательского контента.

## Общие показатели

| Период | Requests | Success | Failed | Running | Tokens | Cost USD | Technical credits | P50 tokens | P90 tokens | P50 latency | P90 latency |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Весь доступный | 391 | 389 | 1 | 1 | 1 705 104 | $15.931744 | 1 456 | 3 921 | 7 789 | 10.96 s | 52.62 s |
| Последние 30 дней | 299 | 298 | 1 | 0 | 1 426 023 | $12.096727 | 1 249 | 4 233 | 8 271 | 9.83 s | 39.73 s |

Наблюдаемая success rate по generations за 30 дней: 99.7%. Это не полный error rate сервиса: B2C, voice transcription и provider failures до создания generation в эту выборку не входят.

## Последние 30 дней по action

| Feature | Runs | Success | Failed | Tokens | Cost USD | P50 tokens | P90 tokens | P50 latency | P90 latency |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `lead_magnet` | 120 | 120 | 0 | 681 851 | $6.387405 | 5 417 | 9 844 | 13.74 s | 40.86 s |
| `audience` | 60 | 60 | 0 | 245 112 | $1.905960 | 3 921 | 5 097 | 8.78 s | 15.49 s |
| `product_mini` | 14 | 14 | 0 | 81 630 | $0.975300 | 5 706 | 7 803 | 29.16 s | 44.40 s |
| `product_main` | 21 | 21 | 0 | 81 322 | $0.888135 | 3 139 | 6 423 | 5.95 s | 48.15 s |
| `positioning` | 5 | 5 | 0 | 20 915 | $0.395675 | 4 259 | 4 477 | 41.05 s | 43.37 s |
| `social` | 10 | 10 | 0 | 34 227 | $0.327060 | 3 581 | 5 583 | 5.07 s | 24.83 s |
| `castdev_analysis` | 1 | 1 | 0 | 14 668 | $0.219915 | 14 668 | 14 668 | 72.42 s | 72.42 s |
| `ai_chat` | 35 | 34 | 1 | 126 422 | $0.200860 | 3 029 | 5 972 | 3.74 s | 7.18 s |
| `post` | 6 | 6 | 0 | 31 326 | $0.177028 | 4 698 | 5 289 | 15.44 s | 17.65 s |
| `tg_channel_plan` | 3 | 3 | 0 | 16 986 | $0.124328 | 5 750 | 5 750 | 25.91 s | 25.91 s |
| `tg_channel_post_edit` | 8 | 8 | 0 | 30 528 | $0.116895 | 3 366 | 4 699 | 3.93 s | 8.50 s |
| `utp` | 6 | 6 | 0 | 16 438 | $0.108290 | 2 043 | 3 699 | 3.67 s | 4.40 s |
| `reel` | 3 | 3 | 0 | 15 957 | $0.097867 | 5 045 | 5 045 | 19.63 s | 19.63 s |
| `chatbot_chain` | 1 | 1 | 0 | 9 946 | $0.088698 | 9 946 | 9 946 | 96.04 s | 96.04 s |
| `tg_channel_post` | 5 | 5 | 0 | 18 695 | $0.083311 | 3 233 | 4 796 | 12.39 s | 14.04 s |
| `castdev_transcription` | 1 | 1 | 0 | 0 | $0 | 0 | 0 | 51.71 s | 51.71 s |

## Последние 30 дней по модели

| Provider/model | Runs | Tokens | Cost USD | Доля cost |
|---|---:|---:|---:|---:|
| OpenAI `gpt-5.5` | 237 | 1 176 163 | $11.207740 | 92.7% |
| OpenAI `gpt-5.4` | 27 | 118 046 | $0.624101 | 5.2% |
| Anthropic Haiku 4.5 | 33 | 121 868 | $0.176188 | 1.5% |
| Anthropic Sonnet 4.6 | 1 | 9 946 | $0.088698 | 0.7% |
| OpenAI mini transcribe | 1 | 0 | $0 | Невидимая audio cost |

## Workflow health

| Status | Count |
|---|---:|
| `SUCCEEDED` | 345 |
| `SUCCEEDED_WITH_WARNINGS` | 1 |
| `FAILED` | 2 |
| `RUNNING` | 37 |

Все 37 `RUNNING` были старше одного часа на момент snapshot. Это historical/stale runs, а не активная очередь.

## Экономические оговорки baseline

1. Текущий USD cost может быть завышен для запросов с cache из-за двойного учёта cached input.
2. `totalTokens` может быть завышен по той же причине.
3. Audio transcription cost не рассчитывается.
4. `actualCostRub` и `costTotalRub` не заполняются; автоматического USD/RUB FX слоя нет.
5. `FeaturePricing` production пуст, поэтому credits берутся из `ai-economy.ts`.
6. Пользовательские AI-баллы не равны `creditsCharged`; они вычисляются повторно по успешным generations.
7. `AIRequestLog` за 30 дней пуст, поэтому error baseline строится по `AIGeneration` и workflows.
8. B2C Psychology не входит в snapshot.

## Контрольная точка для миграции

После включения V2 сравнивать по одному и тому же action:

- success/error rate;
- P50/P90 input, cached input, output и total tokens;
- P50/P90 latency;
- actual USD per completed logical action;
- число provider calls внутри pipeline;
- AI points charged;
- refund/release rate;
- долю `SOL`, `TERRA`, `LUNA`;
- stale/duplicate runs.

Допустимый rollout начинается с shadow/internal traffic. Автоматический rollback нужен при росте P90 cost/action или ошибок относительно этой baseline.

