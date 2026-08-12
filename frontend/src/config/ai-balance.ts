export type AiActionType =
  | 'ai_chat'
  | 'strategy_about'
  | 'positioning'
  | 'audience'
  | 'utp'
  | 'social'
  | 'instagram_profile_generate'
  | 'instagram_profile_improve'
  | 'instagram_highlights_generate'
  | 'instagram_highlight_scenario_generate'
  | 'instagram_highlight_improve'
  | 'instagram_story_improve'
  | 'product_main'
  | 'product_mini'
  | 'lead_magnet'
  | 'content_post'
  | 'content_reel'
  | 'content_thread'
  | 'content_article'
  | 'content_article_edit'
  | 'content_longread'
  | 'youtube_script'
  | 'youtube_script_edit'
  | 'chatbot_scenario_edit'
  | 'content_plan'
  | 'tg_channel_plan'
  | 'tg_channel_post'
  | 'tg_channel_post_edit'
  | 'tg_channel_post_audio_adapt'
  | 'tg_channel_post_video_script'
  | 'castdev_transcription'
  | 'castdev_analysis'
  | 'castdev_synthesis'
  | 'cases_voice_transcription'
  | 'cases_extract_case'
  | 'cases_generate_marketing_insights'
  | 'strategy_rebuild';

export const AI_ACTION_COSTS: Record<AiActionType, number> = {
  ai_chat: 1,
  strategy_about: 10,
  positioning: 20,
  audience: 25,
  utp: 20,
  social: 15,
  instagram_profile_generate: 15,
  instagram_profile_improve: 5,
  instagram_highlights_generate: 40,
  instagram_highlight_scenario_generate: 20,
  instagram_highlight_improve: 10,
  instagram_story_improve: 3,
  product_main: 60,
  product_mini: 80,
  lead_magnet: 70,
  content_post: 5,
  content_reel: 7,
  content_thread: 20,
  content_article: 30,
  content_article_edit: 5,
  content_longread: 30,
  youtube_script: 35,
  youtube_script_edit: 5,
  chatbot_scenario_edit: 3,
  content_plan: 40,
  tg_channel_plan: 40,
  tg_channel_post: 5,
  tg_channel_post_edit: 2,
  tg_channel_post_audio_adapt: 3,
  tg_channel_post_video_script: 5,
  castdev_transcription: 20,
  castdev_analysis: 40,
  castdev_synthesis: 100,
  cases_voice_transcription: 20,
  cases_extract_case: 20,
  cases_generate_marketing_insights: 5,
  strategy_rebuild: 100,
};

export const AI_ACTION_LABELS: Record<AiActionType, string> = {
  ai_chat: 'Сообщение в диалоге',
  strategy_about: 'Раздел «О себе»',
  positioning: 'Позиционирование',
  audience: 'Целевая аудитория',
  utp: 'УТП',
  social: 'Оформление соцсетей',
  instagram_profile_generate: 'Шапка профиля Instagram',
  instagram_profile_improve: 'Доработка шапки Instagram',
  instagram_highlights_generate: 'Highlights и сценарии Instagram',
  instagram_highlight_scenario_generate: 'Сценарий Highlight Instagram',
  instagram_highlight_improve: 'Доработка Highlight Instagram',
  instagram_story_improve: 'Доработка сторис Instagram',
  product_main: 'Основной продукт',
  product_mini: 'Мини-продукт',
  lead_magnet: 'Сборка лид-магнита',
  content_post: 'Пост',
  content_reel: 'Рилс',
  content_thread: 'Цепочка постов',
  content_article: 'Статья',
  content_article_edit: 'Доработка статьи',
  content_longread: 'Лонгрид',
  youtube_script: 'YouTube-сценарий',
  youtube_script_edit: 'Доработка YouTube-сценария',
  chatbot_scenario_edit: 'Доработка сообщения чат-бота',
  content_plan: 'Контент-план',
  tg_channel_plan: 'План ТГ-канала',
  tg_channel_post: 'Пост для ТГ-канала',
  tg_channel_post_edit: 'Доработка поста ТГ-канала',
  tg_channel_post_audio_adapt: 'Адаптация поста под аудио',
  tg_channel_post_video_script: 'Сценарий видео для ТГ-канала',
  castdev_transcription: 'Транскрибация CustDev',
  castdev_analysis: 'AI-разбор CustDev',
  castdev_synthesis: 'Синтез интервью CustDev',
  cases_voice_transcription: 'Транскрибация голосового кейса',
  cases_extract_case: 'Извлечение кейсов из текста',
  cases_generate_marketing_insights: 'Маркетинговые тезисы кейса',
  strategy_rebuild: 'Пересборка стратегии',
};

export const AI_ACTION_SECTIONS: Record<AiActionType, string> = {
  ai_chat: 'Диалог с ИИ',
  strategy_about: 'Стратегия',
  positioning: 'Стратегия',
  audience: 'Стратегия',
  utp: 'Стратегия',
  social: 'Стратегия',
  instagram_profile_generate: 'Упаковка Instagram',
  instagram_profile_improve: 'Упаковка Instagram',
  instagram_highlights_generate: 'Упаковка Instagram',
  instagram_highlight_scenario_generate: 'Упаковка Instagram',
  instagram_highlight_improve: 'Упаковка Instagram',
  instagram_story_improve: 'Упаковка Instagram',
  strategy_rebuild: 'Стратегия',
  product_main: 'Конструктор продуктов',
  product_mini: 'Конструктор продуктов',
  lead_magnet: 'Конструктор продуктов',
  content_post: 'Контент',
  content_reel: 'Контент',
  content_thread: 'Контент',
  content_article: 'Контент',
  content_article_edit: 'Контент',
  content_longread: 'Контент',
  youtube_script: 'Контент',
  youtube_script_edit: 'Контент',
  chatbot_scenario_edit: 'Упаковка',
  content_plan: 'Контент',
  tg_channel_plan: 'Контент',
  tg_channel_post: 'Контент',
  tg_channel_post_edit: 'Контент',
  tg_channel_post_audio_adapt: 'Контент',
  tg_channel_post_video_script: 'Контент',
  castdev_transcription: 'Стратегия',
  castdev_analysis: 'Стратегия',
  castdev_synthesis: 'Стратегия',
  cases_voice_transcription: 'Кейсы',
  cases_extract_case: 'Кейсы',
  cases_generate_marketing_insights: 'Кейсы',
};

export function getCastDevTranscriptionCost(durationSec: number | null | undefined): number {
  if (!durationSec || durationSec <= 0) return 20;
  const minutes = Math.ceil(durationSec / 60);
  if (minutes <= 10) return 10;
  if (minutes <= 30) return 20;
  if (minutes <= 60) return 35;
  if (minutes <= 90) return 50;
  return 70;
}

export function getCastDevAnalysisCost(transcriptChars: number): number {
  if (transcriptChars <= 10_000) return 20;
  if (transcriptChars <= 30_000) return 40;
  if (transcriptChars <= 60_000) return 70;
  if (transcriptChars <= 100_000) return 100;
  return 140;
}

export const SECTION_PRIMARY_ACTION: Record<string, AiActionType> = {
  ai_chat: 'ai_chat',
  content: 'content_post',
  youtube_scripts: 'youtube_script',
  longreads: 'content_article',
  strategy: 'positioning',
  products: 'product_main',
};
