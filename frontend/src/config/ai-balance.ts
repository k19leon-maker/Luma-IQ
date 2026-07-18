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
};

export const SECTION_PRIMARY_ACTION: Record<string, AiActionType> = {
  ai_chat: 'ai_chat',
  content: 'content_post',
  youtube_scripts: 'youtube_script',
  longreads: 'content_article',
  strategy: 'positioning',
  products: 'product_main',
};
