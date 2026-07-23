import type { FeatureCode } from './ai-economy';

export type AiActionType =
  | 'ai_chat'
  | 'strategy_about'
  | 'positioning'
  | 'audience'
  | 'utp'
  | 'social'
  | 'product_main'
  | 'product_mini'
  | 'lead_magnet'
  | 'content_post'
  | 'content_reel'
  | 'content_thread'
  | 'content_article'
  | 'content_longread'
  | 'youtube_script'
  | 'content_plan'
  | 'tg_channel_plan'
  | 'tg_channel_post'
  | 'tg_channel_post_edit'
  | 'tg_channel_post_audio_adapt'
  | 'tg_channel_post_video_script'
  | 'castdev_analysis'
  | 'strategy_rebuild';

export const AI_ACTION_COSTS: Record<AiActionType, number> = {
  ai_chat: 1,
  strategy_about: 10,
  positioning: 20,
  audience: 25,
  utp: 20,
  social: 15,
  product_main: 60,
  product_mini: 80,
  lead_magnet: 70,
  content_post: 5,
  content_reel: 7,
  content_thread: 20,
  content_article: 30,
  content_longread: 30,
  youtube_script: 35,
  content_plan: 40,
  tg_channel_plan: 40,
  tg_channel_post: 5,
  tg_channel_post_edit: 2,
  tg_channel_post_audio_adapt: 3,
  tg_channel_post_video_script: 5,
  castdev_analysis: 40,
  strategy_rebuild: 100,
};

export const AI_ACTION_LABELS: Record<AiActionType, string> = {
  ai_chat: 'Сообщение в диалоге',
  strategy_about: 'Раздел «О себе»',
  positioning: 'Позиционирование',
  audience: 'Целевая аудитория',
  utp: 'УТП',
  social: 'Оформление соцсетей',
  product_main: 'Основной продукт',
  product_mini: 'Мини-продукт',
  lead_magnet: 'Сборка лид-магнита',
  content_post: 'Пост',
  content_reel: 'Рилс',
  content_thread: 'Цепочка постов',
  content_article: 'Статья',
  content_longread: 'Лонгрид',
  youtube_script: 'YouTube-сценарий',
  content_plan: 'Контент-план',
  tg_channel_plan: 'План ТГ-канала',
  tg_channel_post: 'Пост для ТГ-канала',
  tg_channel_post_edit: 'Доработка поста ТГ-канала',
  tg_channel_post_audio_adapt: 'Адаптация поста под аудио',
  tg_channel_post_video_script: 'Сценарий видео для ТГ-канала',
  castdev_analysis: 'Анализ CustDev',
  strategy_rebuild: 'Пересборка стратегии',
};

export const AI_ACTION_SECTIONS: Record<AiActionType, string> = {
  ai_chat: 'Диалог с ИИ',
  strategy_about: 'Стратегия',
  positioning: 'Стратегия',
  audience: 'Стратегия',
  utp: 'Стратегия',
  social: 'Стратегия',
  strategy_rebuild: 'Стратегия',
  product_main: 'Конструктор продуктов',
  product_mini: 'Конструктор продуктов',
  lead_magnet: 'Конструктор продуктов',
  content_post: 'Контент',
  content_reel: 'Контент',
  content_thread: 'Контент',
  content_article: 'Контент',
  content_longread: 'Контент',
  youtube_script: 'Контент',
  content_plan: 'Контент',
  tg_channel_plan: 'Контент',
  tg_channel_post: 'Контент',
  tg_channel_post_edit: 'Контент',
  tg_channel_post_audio_adapt: 'Контент',
  tg_channel_post_video_script: 'Контент',
  castdev_analysis: 'Стратегия',
};

export function featureCodeToAiAction(featureCode: string): AiActionType {
  switch (featureCode as FeatureCode) {
    case 'ai_chat': return 'ai_chat';
    case 'about_ai_summary': return 'strategy_about';
    case 'positioning': return 'positioning';
    case 'audience':
    case 'jtbd':
      return 'audience';
    case 'utp': return 'utp';
    case 'social': return 'social';
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
    case 'castdev_analysis': return 'castdev_analysis';
    default:
      return 'ai_chat';
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

export function aiPointsForGeneration(featureCode: string, metadata?: unknown): number {
  const workflow = metadataField(metadata, 'workflow');
  const step = metadataField(metadata, 'step');

  if (step === 'edit') {
    if (featureCode === 'product_main' || featureCode === 'product_mini' || featureCode === 'lead_magnet') {
      return 10;
    }
  }

  if (featureCode === 'product_main' && workflow === 'product.main') {
    return 12;
  }

  if (featureCode === 'product_mini' && workflow === 'product.mini') {
    const fivePointSteps = new Set(['bonuses', 'objections', 'landingBlock', 'telegramPosts']);
    return fivePointSteps.has(step) ? 5 : 6;
  }

  if (featureCode === 'lead_magnet' && workflow === 'leadmagnet') {
    return step === 'finalCta' ? 10 : 5;
  }

  return aiPointsForFeature(featureCode);
}
