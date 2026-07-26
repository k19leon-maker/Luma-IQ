import {
  actionKeyForFeature,
  type AIActionKey,
} from '../config/ai-action-registry';

export type DialogMode = 'auto' | 'quick' | 'deep' | 'strategy';

const STRATEGY_MARKERS = [
  'стратег', 'позиционир', 'целевая аудитория', 'сегмент', 'воронк',
  'продуктов', 'бизнес-модель', 'запуск', 'юнит-экономик', 'аудит проекта',
];
const DEEP_MARKERS = [
  'проанализ', 'разбери', 'сравни', 'почему', 'найди слаб', 'варианты',
  'план действий', 'подробно', 'возражен', 'исследован',
];

function textInput(inputs: Record<string, unknown>): string {
  const raw = inputs.message ?? inputs.prompt ?? inputs.text ?? '';
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

export function classifyDialogAction(inputs: Record<string, unknown>): AIActionKey {
  const requested = inputs.dialogMode;
  if (requested === 'quick') return 'ai_chat_quick';
  if (requested === 'deep') return 'ai_chat_deep';
  if (requested === 'strategy') return 'ai_chat_strategy';

  const message = textInput(inputs);
  const strategyHits = STRATEGY_MARKERS.filter((marker) => message.includes(marker)).length;
  const deepHits = DEEP_MARKERS.filter((marker) => message.includes(marker)).length;

  if (strategyHits >= 2 || (strategyHits >= 1 && message.length >= 500) || message.length >= 1_800) {
    return 'ai_chat_strategy';
  }
  if (deepHits >= 1 || strategyHits >= 1 || message.length >= 450) {
    return 'ai_chat_deep';
  }
  return 'ai_chat_quick';
}

function explicitContentAction(
  workflow: string,
  step: string,
  inputs: Record<string, unknown>,
): AIActionKey | null {
  if (workflow === 'product.main' && step === 'edit') return 'product_main_edit';
  if (workflow === 'product.mini' && step === 'edit') return 'product_mini_edit';
  if (workflow === 'leadmagnet' && step === 'edit') return 'lead_magnet_edit';
  if (workflow === 'strategy.offer' && step === 'generate') return 'offer';
  if (workflow === 'strategy.rebuild' && step === 'generate') return 'strategy_rebuild';
  if (workflow === 'product.strategy' && step === 'audit') return 'product_strategy_audit';
  if (workflow === 'strategy.audience' && step === 'generate') {
    const stepId = Number(inputs.stepId);
    const mode = String(inputs.mode ?? '');
    return stepId === 1 && mode !== 'stepChat' ? 'audience' : 'audience_followup';
  }
  if (workflow === 'threads.post' && step === 'regenerate') return 'content_thread_regenerate';
  if (workflow === 'posts.post' && step === 'edit') return 'content_post_edit';
  if (workflow === 'posts.post' && step === 'regenerate') return 'content_post_regenerate';
  if (workflow === 'reels.script' && step === 'edit') return 'content_reel_edit';
  if (workflow === 'reels.script' && step === 'regenerate') return 'content_reel_regenerate';
  if (workflow === 'threads.post' && step === 'edit') return 'content_thread_edit';
  const intent = String(inputs.intent ?? inputs.goal ?? inputs.contentType ?? '').toLowerCase();
  if (workflow === 'posts.post' && step === 'write' && /продаж|sale|selling/.test(intent)) {
    return 'selling_post';
  }
  if (workflow === 'video.script' && step === 'write' && /продаж|sale|selling/.test(intent)) {
    return 'youtube_script_selling';
  }
  return null;
}

export const aiActionResolverService = {
  resolve(input: {
    featureCode: string;
    workflow: string;
    step: string;
    inputs: Record<string, unknown>;
  }): AIActionKey {
    if (input.featureCode === 'ai_chat' || input.workflow === 'ai.dialog') {
      return classifyDialogAction(input.inputs);
    }
    return explicitContentAction(input.workflow, input.step, input.inputs)
      ?? actionKeyForFeature(input.featureCode);
  },
};
