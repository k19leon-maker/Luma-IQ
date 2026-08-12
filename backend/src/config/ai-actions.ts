import type { FeatureCode } from './ai-economy';

export type AiActionType =
  | 'ai_chat'
  | 'audio_transcription'
  | 'ai_chat_quick'
  | 'ai_chat_deep'
  | 'ai_chat_strategy'
  | 'strategy_about'
  | 'positioning'
  | 'audience'
  | 'audience_followup'
  | 'utp'
  | 'offer'
  | 'social'
  | 'instagram_profile_generate'
  | 'instagram_profile_improve'
  | 'instagram_highlights_generate'
  | 'instagram_highlight_scenario_generate'
  | 'instagram_highlight_improve'
  | 'instagram_story_improve'
  | 'product_strategy_audit'
  | 'product_main'
  | 'product_main_edit'
  | 'product_mini'
  | 'product_mini_edit'
  | 'lead_magnet'
  | 'lead_magnet_edit'
  | 'content_post'
  | 'content_post_edit'
  | 'content_post_regenerate'
  | 'content_reel'
  | 'content_reel_edit'
  | 'content_reel_regenerate'
  | 'content_thread'
  | 'content_thread_edit'
  | 'content_thread_regenerate'
  | 'content_article'
  | 'content_article_edit'
  | 'content_longread'
  | 'youtube_script'
  | 'youtube_script_edit'
  | 'youtube_script_selling'
  | 'selling_post'
  | 'chatbot_scenario'
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
  audio_transcription: 1,
  ai_chat_quick: 5,
  ai_chat_deep: 20,
  ai_chat_strategy: 60,
  strategy_about: 10,
  positioning: 20,
  audience: 25,
  audience_followup: 0,
  utp: 20,
  offer: 30,
  social: 15,
  instagram_profile_generate: 15,
  instagram_profile_improve: 5,
  instagram_highlights_generate: 40,
  instagram_highlight_scenario_generate: 20,
  instagram_highlight_improve: 10,
  instagram_story_improve: 3,
  product_strategy_audit: 60,
  product_main: 60,
  product_main_edit: 10,
  product_mini: 80,
  product_mini_edit: 10,
  lead_magnet: 70,
  lead_magnet_edit: 10,
  content_post: 5,
  content_post_edit: 2,
  content_post_regenerate: 5,
  content_reel: 7,
  content_reel_edit: 3,
  content_reel_regenerate: 7,
  content_thread: 20,
  content_thread_edit: 5,
  content_thread_regenerate: 20,
  content_article: 30,
  content_article_edit: 5,
  content_longread: 30,
  youtube_script: 35,
  youtube_script_edit: 5,
  youtube_script_selling: 50,
  selling_post: 10,
  chatbot_scenario: 30,
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
  audio_transcription: 'Распознавание голосового сообщения',
  ai_chat_quick: 'Быстрый ответ в диалоге',
  ai_chat_deep: 'Глубокий анализ в диалоге',
  ai_chat_strategy: 'Стратегический разбор в диалоге',
  strategy_about: 'Раздел «О себе»',
  positioning: 'Позиционирование',
  audience: 'Целевая аудитория',
  audience_followup: 'Продолжение анализа ЦА',
  utp: 'УТП',
  offer: 'Системный оффер',
  social: 'Оформление соцсетей',
  instagram_profile_generate: 'Шапка профиля Instagram',
  instagram_profile_improve: 'Доработка шапки Instagram',
  instagram_highlights_generate: 'Highlights и сценарии Instagram',
  instagram_highlight_scenario_generate: 'Сценарий Highlight Instagram',
  instagram_highlight_improve: 'Доработка Highlight Instagram',
  instagram_story_improve: 'Доработка сторис Instagram',
  product_strategy_audit: 'Аудит продуктовой стратегии',
  product_main: 'Основной продукт',
  product_main_edit: 'Доработка основного продукта',
  product_mini: 'Мини-продукт',
  product_mini_edit: 'Доработка мини-продукта',
  lead_magnet: 'Сборка лид-магнита',
  lead_magnet_edit: 'Доработка лид-магнита',
  content_post: 'Пост',
  content_post_edit: 'Доработка поста',
  content_post_regenerate: 'Пересборка поста',
  content_reel: 'Рилс',
  content_reel_edit: 'Доработка рилса',
  content_reel_regenerate: 'Пересборка рилса',
  content_thread: 'Цепочка постов',
  content_thread_edit: 'Доработка цепочки постов',
  content_thread_regenerate: 'Пересборка цепочки постов',
  content_article: 'Статья',
  content_article_edit: 'Доработка статьи',
  content_longread: 'Лонгрид',
  youtube_script: 'YouTube-сценарий',
  youtube_script_edit: 'Доработка YouTube-сценария',
  youtube_script_selling: 'Продающий видеосценарий',
  selling_post: 'Продающий пост',
  chatbot_scenario: 'Сценарий чат-бота',
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
  audio_transcription: 'Голосовой ввод',
  ai_chat_quick: 'Диалог с ИИ',
  ai_chat_deep: 'Диалог с ИИ',
  ai_chat_strategy: 'Диалог с ИИ',
  strategy_about: 'Стратегия',
  positioning: 'Стратегия',
  audience: 'Стратегия',
  audience_followup: 'Стратегия',
  utp: 'Стратегия',
  offer: 'Стратегия',
  social: 'Стратегия',
  instagram_profile_generate: 'Упаковка Instagram',
  instagram_profile_improve: 'Упаковка Instagram',
  instagram_highlights_generate: 'Упаковка Instagram',
  instagram_highlight_scenario_generate: 'Упаковка Instagram',
  instagram_highlight_improve: 'Упаковка Instagram',
  instagram_story_improve: 'Упаковка Instagram',
  product_strategy_audit: 'Конструктор продуктов',
  strategy_rebuild: 'Стратегия',
  product_main: 'Конструктор продуктов',
  product_main_edit: 'Конструктор продуктов',
  product_mini: 'Конструктор продуктов',
  product_mini_edit: 'Конструктор продуктов',
  lead_magnet: 'Конструктор продуктов',
  lead_magnet_edit: 'Конструктор продуктов',
  content_post: 'Контент',
  content_post_edit: 'Контент',
  content_post_regenerate: 'Контент',
  content_reel: 'Контент',
  content_reel_edit: 'Контент',
  content_reel_regenerate: 'Контент',
  content_thread: 'Контент',
  content_thread_edit: 'Контент',
  content_thread_regenerate: 'Контент',
  content_article: 'Контент',
  content_article_edit: 'Контент',
  content_longread: 'Контент',
  youtube_script: 'Контент',
  youtube_script_edit: 'Контент',
  youtube_script_selling: 'Контент',
  selling_post: 'Контент',
  chatbot_scenario: 'Упаковка',
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

export function featureCodeToAiAction(featureCode: string): AiActionType {
  switch (featureCode as FeatureCode) {
    case 'ai_chat': return 'ai_chat';
    case 'audio_transcription': return 'audio_transcription';
    case 'about_ai_summary': return 'strategy_about';
    case 'positioning': return 'positioning';
    case 'audience':
    case 'jtbd':
      return 'audience';
    case 'utp': return 'utp';
    case 'social': return 'social';
    case 'instagram_profile_generate': return 'instagram_profile_generate';
    case 'instagram_profile_improve': return 'instagram_profile_improve';
    case 'instagram_highlights_generate': return 'instagram_highlights_generate';
    case 'instagram_highlight_scenario_generate': return 'instagram_highlight_scenario_generate';
    case 'instagram_highlight_improve': return 'instagram_highlight_improve';
    case 'instagram_story_improve': return 'instagram_story_improve';
    case 'product_main': return 'product_main';
    case 'product_mini': return 'product_mini';
    case 'lead_magnet': return 'lead_magnet';
    case 'post': return 'content_post';
    case 'reel': return 'content_reel';
    case 'threads':
    case 'chatbot_chain':
      return 'content_thread';
    case 'article': return 'content_article';
    case 'video_script': return 'youtube_script';
    case 'content_plan': return 'content_plan';
    case 'tg_channel_plan': return 'tg_channel_plan';
    case 'tg_channel_post': return 'tg_channel_post';
    case 'tg_channel_post_edit': return 'tg_channel_post_edit';
    case 'tg_channel_post_audio_adapt': return 'tg_channel_post_audio_adapt';
    case 'tg_channel_post_video_script': return 'tg_channel_post_video_script';
    case 'castdev_transcription': return 'castdev_transcription';
    case 'castdev_analysis': return 'castdev_analysis';
    case 'castdev_synthesis': return 'castdev_synthesis';
    case 'cases_voice_transcription': return 'cases_voice_transcription';
    case 'cases_extract_case': return 'cases_extract_case';
    case 'cases_generate_marketing_insights': return 'cases_generate_marketing_insights';
    default:
      throw new Error(`UNKNOWN_AI_ACTION: ${featureCode}`);
  }
}

export function aiPointsForFeature(featureCode: string): number {
  return AI_ACTION_COSTS[featureCodeToAiAction(featureCode)];
}

function metadataField(metadata: unknown, key: string): string {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return '';
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

function metadataNumber(metadata: unknown, key: string): number | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function getCastDevTranscriptionCost(durationSec: number | null | undefined): number {
  return pointsFromTierPolicy(
    durationSec && durationSec > 0 ? durationSec : null,
    CASTDEV_TRANSCRIPTION_PRICING_POLICY,
  );
}

export function getCastDevAnalysisCost(transcriptChars: number): number {
  return pointsFromTierPolicy(transcriptChars, CASTDEV_ANALYSIS_PRICING_POLICY);
}

export type AiPointTierPolicy = {
  mode: 'tiered';
  metric: 'durationSec' | 'transcriptChars';
  defaultPoints: number;
  tiers: Array<{ max: number | null; points: number }>;
};

export const CASTDEV_TRANSCRIPTION_PRICING_POLICY: AiPointTierPolicy = {
  mode: 'tiered',
  metric: 'durationSec',
  defaultPoints: 20,
  tiers: [
    { max: 10 * 60, points: 10 },
    { max: 30 * 60, points: 20 },
    { max: 60 * 60, points: 35 },
    { max: 90 * 60, points: 50 },
    { max: null, points: 70 },
  ],
};

export const CASTDEV_ANALYSIS_PRICING_POLICY: AiPointTierPolicy = {
  mode: 'tiered',
  metric: 'transcriptChars',
  defaultPoints: 20,
  tiers: [
    { max: 10_000, points: 20 },
    { max: 30_000, points: 40 },
    { max: 60_000, points: 70 },
    { max: 100_000, points: 100 },
    { max: null, points: 140 },
  ],
};

export function pointsFromTierPolicy(
  value: number | null | undefined,
  policy: AiPointTierPolicy,
): number {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) {
    return policy.defaultPoints;
  }
  return policy.tiers.find((tier) => tier.max === null || value <= tier.max)?.points
    ?? policy.defaultPoints;
}

export function aiPointsForGeneration(featureCode: string, metadata?: unknown): number {
  const workflow = metadataField(metadata, 'workflow');
  const step = metadataField(metadata, 'step');
  const castDevAiPoints = metadataNumber(metadata, 'castdevAiPoints');

  if ((featureCode === 'castdev_transcription' || featureCode === 'cases_voice_transcription' || featureCode === 'castdev_analysis' || featureCode === 'cases_extract_case') && castDevAiPoints !== null) {
    return Math.max(0, Math.round(castDevAiPoints));
  }

  if (featureCode === 'castdev_transcription' || featureCode === 'cases_voice_transcription') {
    return getCastDevTranscriptionCost(metadataNumber(metadata, 'durationSec'));
  }

  if (featureCode === 'castdev_analysis' || featureCode === 'cases_extract_case') {
    return getCastDevAnalysisCost(metadataNumber(metadata, 'transcriptChars') ?? 0);
  }

  if (featureCode === 'audience' && workflow === 'strategy.audience') {
    const audienceStepId = metadataNumber(metadata, 'audienceStepId');
    const audienceMode = metadataField(metadata, 'audienceMode');
    return audienceStepId === 1 && audienceMode !== 'stepChat'
      ? AI_ACTION_COSTS.audience
      : AI_ACTION_COSTS.audience_followup;
  }

  if (step === 'edit') {
    if (featureCode === 'product_main' || featureCode === 'product_mini' || featureCode === 'lead_magnet') {
      return 10;
    }
  }

  if (featureCode === 'product_main' && workflow === 'product.main') {
    if (step === 'build') return AI_ACTION_COSTS.product_main;
    return 12;
  }

  if (featureCode === 'product_mini' && workflow === 'product.mini') {
    if (step === 'build') return AI_ACTION_COSTS.product_mini;
    const fivePointSteps = new Set(['bonuses', 'objections', 'landingBlock', 'telegramPosts']);
    return fivePointSteps.has(step) ? 5 : 6;
  }

  if (featureCode === 'lead_magnet' && workflow === 'leadmagnet') {
    if (step === 'build') return AI_ACTION_COSTS.lead_magnet;
    return step === 'finalCta' ? 10 : 5;
  }

  return aiPointsForFeature(featureCode);
}
