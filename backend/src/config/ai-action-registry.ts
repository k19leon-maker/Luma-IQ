import { AI_ACTION_COSTS, type AiActionType } from './ai-actions';
import type { AIModelAlias } from './ai-v2';

export type AIActionKey =
  | AiActionType
  | 'product_strategy';

export type AIActionStage = {
  stage: string;
  modelAlias: AIModelAlias;
  reasoning: 'low' | 'medium' | 'high';
  outputLimit?: number;
};

export type AIActionDefinition = {
  actionKey: AIActionKey;
  pipeline: AIActionStage[];
  contextBudget: number;
  outputLimit: number;
  retryPolicy: { maxAttempts: number; retrySameProfile: boolean };
  fallbackPolicy: { aliases: AIModelAlias[]; allowDowngrade: boolean };
  batchEligible: boolean;
  aiPoints: number;
};

const one = (
  actionKey: AIActionKey,
  modelAlias: AIModelAlias,
  aiPoints: number,
  options: Partial<Omit<AIActionDefinition, 'actionKey' | 'pipeline' | 'aiPoints'>> = {},
): AIActionDefinition => ({
  actionKey,
  pipeline: [{ stage: 'generate', modelAlias, reasoning: 'low' }],
  contextBudget: 12_000,
  outputLimit: 4_000,
  retryPolicy: { maxAttempts: 2, retrySameProfile: true },
  fallbackPolicy: {
    aliases: modelAlias === 'SOL' || modelAlias.startsWith('TRANSCRIBE') ? [] : ['SOL'],
    allowDowngrade: false,
  },
  batchEligible: false,
  aiPoints,
  ...options,
});

const multi = (
  actionKey: AIActionKey,
  pipeline: AIActionStage[],
  aiPoints: number,
  options: Partial<Omit<AIActionDefinition, 'actionKey' | 'pipeline' | 'aiPoints'>> = {},
): AIActionDefinition => ({
  ...one(actionKey, pipeline[0]?.modelAlias ?? 'LUNA', aiPoints, options),
  pipeline,
});

export const AI_ACTION_DEFINITIONS: Record<AIActionKey, AIActionDefinition> = {
  ai_chat: one('ai_chat', 'LUNA', AI_ACTION_COSTS.ai_chat, { contextBudget: 8_000, outputLimit: 1_500 }),
  audio_transcription: one(
    'audio_transcription',
    'TRANSCRIBE_MINI',
    AI_ACTION_COSTS.audio_transcription,
    {
      contextBudget: 0,
      outputLimit: 0,
      fallbackPolicy: { aliases: [], allowDowngrade: false },
    },
  ),
  ai_chat_quick: one('ai_chat_quick', 'LUNA', AI_ACTION_COSTS.ai_chat_quick, { contextBudget: 6_000, outputLimit: 1_200 }),
  ai_chat_deep: one('ai_chat_deep', 'LUNA', AI_ACTION_COSTS.ai_chat_deep, { contextBudget: 14_000, outputLimit: 3_500 }),
  ai_chat_strategy: one('ai_chat_strategy', 'LUNA', AI_ACTION_COSTS.ai_chat_strategy, { contextBudget: 24_000, outputLimit: 7_000 }),
  strategy_about: one('strategy_about', 'LUNA', AI_ACTION_COSTS.strategy_about),
  positioning: multi('positioning', [
    { stage: 'analysis', modelAlias: 'TERRA', reasoning: 'medium', outputLimit: 5_000 },
    { stage: 'decision', modelAlias: 'SOL', reasoning: 'medium', outputLimit: 3_000 },
    { stage: 'format', modelAlias: 'LUNA', reasoning: 'low', outputLimit: 8_000 },
  ], AI_ACTION_COSTS.positioning, {
    contextBudget: 30_000,
    outputLimit: 8_000,
    fallbackPolicy: { aliases: [], allowDowngrade: false },
  }),
  audience: multi('audience', [
    { stage: 'normalize', modelAlias: 'LUNA', reasoning: 'low', outputLimit: 2_000 },
    { stage: 'analysis', modelAlias: 'TERRA', reasoning: 'medium', outputLimit: 6_000 },
    { stage: 'decision', modelAlias: 'SOL', reasoning: 'medium', outputLimit: 3_000 },
    { stage: 'format', modelAlias: 'LUNA', reasoning: 'low', outputLimit: 10_000 },
  ], AI_ACTION_COSTS.audience, {
    contextBudget: 36_000,
    outputLimit: 10_000,
    fallbackPolicy: { aliases: [], allowDowngrade: false },
  }),
  audience_followup: multi('audience_followup', [
    { stage: 'analysis', modelAlias: 'TERRA', reasoning: 'medium', outputLimit: 5_000 },
    { stage: 'format', modelAlias: 'LUNA', reasoning: 'low', outputLimit: 8_000 },
  ], AI_ACTION_COSTS.audience_followup, {
    contextBudget: 28_000,
    outputLimit: 8_000,
    fallbackPolicy: { aliases: [], allowDowngrade: false },
  }),
  utp: multi('utp', [
    { stage: 'analysis', modelAlias: 'TERRA', reasoning: 'medium', outputLimit: 2_500 },
    { stage: 'format', modelAlias: 'LUNA', reasoning: 'low', outputLimit: 2_000 },
  ], AI_ACTION_COSTS.utp, {
    fallbackPolicy: { aliases: [], allowDowngrade: false },
  }),
  social: multi('social', [
    { stage: 'architecture', modelAlias: 'TERRA', reasoning: 'medium', outputLimit: 2_500 },
    { stage: 'copy', modelAlias: 'LUNA', reasoning: 'low', outputLimit: 4_000 },
    { stage: 'review', modelAlias: 'TERRA', reasoning: 'low', outputLimit: 4_500 },
  ], AI_ACTION_COSTS.social, {
    fallbackPolicy: { aliases: [], allowDowngrade: false },
  }),
  instagram_profile_generate: one(
    'instagram_profile_generate',
    'LUNA',
    AI_ACTION_COSTS.instagram_profile_generate,
    { contextBudget: 14_000, outputLimit: 1_500 },
  ),
  instagram_profile_improve: one(
    'instagram_profile_improve',
    'LUNA',
    AI_ACTION_COSTS.instagram_profile_improve,
    { contextBudget: 9_000, outputLimit: 1_500 },
  ),
  instagram_highlights_generate: multi('instagram_highlights_generate', [
    { stage: 'architecture', modelAlias: 'TERRA', reasoning: 'medium', outputLimit: 3_000 },
    { stage: 'scenarios', modelAlias: 'LUNA', reasoning: 'low', outputLimit: 12_000 },
  ], AI_ACTION_COSTS.instagram_highlights_generate, {
    contextBudget: 30_000,
    outputLimit: 12_000,
    fallbackPolicy: { aliases: [], allowDowngrade: false },
  }),
  instagram_highlight_scenario_generate: one(
    'instagram_highlight_scenario_generate',
    'LUNA',
    AI_ACTION_COSTS.instagram_highlight_scenario_generate,
    { contextBudget: 18_000, outputLimit: 7_000 },
  ),
  instagram_highlight_improve: one(
    'instagram_highlight_improve',
    'LUNA',
    AI_ACTION_COSTS.instagram_highlight_improve,
    { contextBudget: 14_000, outputLimit: 7_000 },
  ),
  instagram_story_improve: one(
    'instagram_story_improve',
    'LUNA',
    AI_ACTION_COSTS.instagram_story_improve,
    { contextBudget: 9_000, outputLimit: 2_500 },
  ),
  product_main: multi('product_main', [
    { stage: 'architecture', modelAlias: 'TERRA', reasoning: 'medium', outputLimit: 2_500 },
    { stage: 'details', modelAlias: 'LUNA', reasoning: 'low', outputLimit: 10_000 },
    { stage: 'review', modelAlias: 'TERRA', reasoning: 'low', outputLimit: 12_000 },
  ], AI_ACTION_COSTS.product_main, { contextBudget: 40_000, outputLimit: 12_000 }),
  product_main_edit: one('product_main_edit', 'LUNA', AI_ACTION_COSTS.product_main_edit, { contextBudget: 12_000, outputLimit: 4_000 }),
  product_mini: multi('product_mini', [
    { stage: 'architecture', modelAlias: 'TERRA', reasoning: 'medium', outputLimit: 2_500 },
    { stage: 'details', modelAlias: 'LUNA', reasoning: 'low', outputLimit: 9_000 },
    { stage: 'review', modelAlias: 'TERRA', reasoning: 'low', outputLimit: 10_000 },
  ], AI_ACTION_COSTS.product_mini, { contextBudget: 36_000, outputLimit: 10_000 }),
  product_mini_edit: one('product_mini_edit', 'LUNA', AI_ACTION_COSTS.product_mini_edit, { contextBudget: 12_000, outputLimit: 4_000 }),
  lead_magnet: multi('lead_magnet', [
    { stage: 'architecture', modelAlias: 'TERRA', reasoning: 'medium', outputLimit: 2_500 },
    { stage: 'copy', modelAlias: 'LUNA', reasoning: 'low', outputLimit: 10_000 },
    { stage: 'review', modelAlias: 'TERRA', reasoning: 'low', outputLimit: 12_000 },
  ], AI_ACTION_COSTS.lead_magnet, { contextBudget: 36_000, outputLimit: 12_000 }),
  lead_magnet_edit: one('lead_magnet_edit', 'LUNA', AI_ACTION_COSTS.lead_magnet_edit, { contextBudget: 12_000, outputLimit: 4_000 }),
  content_post: one('content_post', 'LUNA', AI_ACTION_COSTS.content_post, { batchEligible: true }),
  content_post_edit: one('content_post_edit', 'LUNA', AI_ACTION_COSTS.content_post_edit, { contextBudget: 6_000, outputLimit: 2_500 }),
  content_post_regenerate: one('content_post_regenerate', 'LUNA', AI_ACTION_COSTS.content_post_regenerate, { contextBudget: 10_000, outputLimit: 4_000 }),
  content_reel: one('content_reel', 'LUNA', AI_ACTION_COSTS.content_reel, { batchEligible: true }),
  content_reel_edit: one('content_reel_edit', 'LUNA', AI_ACTION_COSTS.content_reel_edit, { contextBudget: 6_000, outputLimit: 2_500 }),
  content_reel_regenerate: one('content_reel_regenerate', 'LUNA', AI_ACTION_COSTS.content_reel_regenerate, { contextBudget: 10_000, outputLimit: 4_000 }),
  content_thread: one('content_thread', 'LUNA', AI_ACTION_COSTS.content_thread, { batchEligible: true }),
  content_thread_edit: one('content_thread_edit', 'LUNA', AI_ACTION_COSTS.content_thread_edit, { contextBudget: 8_000, outputLimit: 3_000 }),
  content_thread_regenerate: one('content_thread_regenerate', 'LUNA', AI_ACTION_COSTS.content_thread_regenerate, { contextBudget: 14_000, outputLimit: 6_000 }),
  content_article: multi('content_article', [
    { stage: 'outline', modelAlias: 'TERRA', reasoning: 'medium', outputLimit: 2_000 },
    { stage: 'draft', modelAlias: 'LUNA', reasoning: 'low', outputLimit: 10_000 },
    { stage: 'review', modelAlias: 'TERRA', reasoning: 'low', outputLimit: 12_000 },
  ], AI_ACTION_COSTS.content_article, { contextBudget: 28_000, outputLimit: 12_000 }),
  content_article_edit: one('content_article_edit', 'LUNA', AI_ACTION_COSTS.content_article_edit, { contextBudget: 18_000, outputLimit: 8_000 }),
  content_longread: multi('content_longread', [
    { stage: 'outline', modelAlias: 'TERRA', reasoning: 'medium' },
    { stage: 'draft', modelAlias: 'LUNA', reasoning: 'low' },
    { stage: 'review', modelAlias: 'TERRA', reasoning: 'low' },
  ], AI_ACTION_COSTS.content_longread, { contextBudget: 32_000, outputLimit: 16_000 }),
  youtube_script: one('youtube_script', 'LUNA', AI_ACTION_COSTS.youtube_script, { outputLimit: 12_000 }),
  youtube_script_edit: one('youtube_script_edit', 'LUNA', AI_ACTION_COSTS.youtube_script_edit, { contextBudget: 16_000, outputLimit: 7_000 }),
  youtube_script_selling: multi('youtube_script_selling', [
    { stage: 'architecture', modelAlias: 'TERRA', reasoning: 'medium', outputLimit: 1_800 },
    { stage: 'script', modelAlias: 'LUNA', reasoning: 'low', outputLimit: 9_000 },
    { stage: 'review', modelAlias: 'TERRA', reasoning: 'low', outputLimit: 10_000 },
  ], AI_ACTION_COSTS.youtube_script_selling, { contextBudget: 24_000, outputLimit: 10_000 }),
  content_plan: multi('content_plan', [
    { stage: 'strategy', modelAlias: 'TERRA', reasoning: 'medium' },
    { stage: 'items', modelAlias: 'LUNA', reasoning: 'low' },
  ], AI_ACTION_COSTS.content_plan, { batchEligible: true, contextBudget: 30_000, outputLimit: 12_000 }),
  tg_channel_description_generate: one(
    'tg_channel_description_generate',
    'LUNA',
    AI_ACTION_COSTS.tg_channel_description_generate,
    { contextBudget: 5_200, outputLimit: 1_000 },
  ),
  tg_channel_description_improve: one(
    'tg_channel_description_improve',
    'LUNA',
    AI_ACTION_COSTS.tg_channel_description_improve,
    { contextBudget: 4_200, outputLimit: 1_000 },
  ),
  tg_channel_plan: multi('tg_channel_plan', [
    { stage: 'strategy', modelAlias: 'TERRA', reasoning: 'medium', outputLimit: 2_000 },
    { stage: 'items', modelAlias: 'LUNA', reasoning: 'low', outputLimit: 8_000 },
  ], AI_ACTION_COSTS.tg_channel_plan, { batchEligible: true }),
  tg_channel_idea_improve: one('tg_channel_idea_improve', 'LUNA', AI_ACTION_COSTS.tg_channel_idea_improve, { contextBudget: 8_000, outputLimit: 2_000 }),
  tg_channel_post: one('tg_channel_post', 'LUNA', AI_ACTION_COSTS.tg_channel_post, { batchEligible: true }),
  tg_channel_post_edit: one('tg_channel_post_edit', 'LUNA', AI_ACTION_COSTS.tg_channel_post_edit, { contextBudget: 6_000 }),
  tg_channel_post_audio_adapt: one('tg_channel_post_audio_adapt', 'LUNA', AI_ACTION_COSTS.tg_channel_post_audio_adapt),
  tg_channel_post_video_script: one('tg_channel_post_video_script', 'LUNA', AI_ACTION_COSTS.tg_channel_post_video_script),
  chatbot_scenario_edit: one('chatbot_scenario_edit', 'LUNA', AI_ACTION_COSTS.chatbot_scenario_edit, { contextBudget: 8_000, outputLimit: 3_000 }),
  castdev_transcription: one('castdev_transcription', 'TRANSCRIBE_MINI', AI_ACTION_COSTS.castdev_transcription, {
    contextBudget: 0,
    outputLimit: 0,
    fallbackPolicy: { aliases: [], allowDowngrade: false },
  }),
  cases_voice_transcription: one(
    'cases_voice_transcription',
    'TRANSCRIBE_MINI',
    AI_ACTION_COSTS.cases_voice_transcription,
    {
      contextBudget: 0,
      outputLimit: 0,
      fallbackPolicy: { aliases: [], allowDowngrade: false },
    },
  ),
  castdev_analysis: multi('castdev_analysis', [
    { stage: 'normalize', modelAlias: 'LUNA', reasoning: 'low', outputLimit: 8_000 },
    { stage: 'analysis', modelAlias: 'TERRA', reasoning: 'medium', outputLimit: 12_000 },
  ], AI_ACTION_COSTS.castdev_analysis, {
    contextBudget: 60_000,
    outputLimit: 12_000,
    fallbackPolicy: { aliases: [], allowDowngrade: false },
  }),
  cases_extract_case: one('cases_extract_case', 'LUNA', AI_ACTION_COSTS.cases_extract_case, {
    contextBudget: 24_000,
    outputLimit: 10_000,
    fallbackPolicy: { aliases: [], allowDowngrade: false },
  }),
  cases_generate_marketing_insights: one(
    'cases_generate_marketing_insights',
    'LUNA',
    AI_ACTION_COSTS.cases_generate_marketing_insights,
    { contextBudget: 12_000, outputLimit: 3_000, fallbackPolicy: { aliases: [], allowDowngrade: false } },
  ),
  strategy_rebuild: multi('strategy_rebuild', [
    { stage: 'analysis', modelAlias: 'TERRA', reasoning: 'medium', outputLimit: 8_000 },
    { stage: 'decision', modelAlias: 'SOL', reasoning: 'medium', outputLimit: 4_000 },
    { stage: 'format', modelAlias: 'LUNA', reasoning: 'low', outputLimit: 16_000 },
  ], AI_ACTION_COSTS.strategy_rebuild, {
    contextBudget: 48_000,
    outputLimit: 16_000,
    fallbackPolicy: { aliases: [], allowDowngrade: false },
  }),
  offer: multi('offer', [
    { stage: 'analysis', modelAlias: 'TERRA', reasoning: 'medium', outputLimit: 4_000 },
    { stage: 'decision', modelAlias: 'SOL', reasoning: 'medium', outputLimit: 2_500 },
    { stage: 'format', modelAlias: 'LUNA', reasoning: 'low', outputLimit: 3_000 },
  ], AI_ACTION_COSTS.offer, {
    contextBudget: 30_000,
    outputLimit: 3_000,
    fallbackPolicy: { aliases: [], allowDowngrade: false },
  }),
  selling_post: multi('selling_post', [
    { stage: 'angle', modelAlias: 'TERRA', reasoning: 'medium', outputLimit: 1_500 },
    { stage: 'copy', modelAlias: 'LUNA', reasoning: 'low', outputLimit: 4_000 },
  ], AI_ACTION_COSTS.selling_post),
  chatbot_scenario: multi('chatbot_scenario', [
    { stage: 'architecture', modelAlias: 'TERRA', reasoning: 'medium', outputLimit: 2_000 },
    { stage: 'messages', modelAlias: 'LUNA', reasoning: 'low', outputLimit: 8_000 },
    { stage: 'review', modelAlias: 'TERRA', reasoning: 'low', outputLimit: 9_000 },
  ], AI_ACTION_COSTS.chatbot_scenario),
  castdev_synthesis: multi('castdev_synthesis', [
    { stage: 'aggregate', modelAlias: 'TERRA', reasoning: 'medium', outputLimit: 10_000 },
    { stage: 'synthesis', modelAlias: 'SOL', reasoning: 'medium', outputLimit: 6_000 },
  ], AI_ACTION_COSTS.castdev_synthesis, {
    contextBudget: 80_000,
    outputLimit: 10_000,
    fallbackPolicy: { aliases: [], allowDowngrade: false },
  }),
  product_strategy: multi('product_strategy', [
    { stage: 'analysis', modelAlias: 'TERRA', reasoning: 'medium' },
    { stage: 'decision', modelAlias: 'SOL', reasoning: 'medium' },
  ], 100, { contextBudget: 60_000, outputLimit: 14_000 }),
  product_strategy_audit: multi('product_strategy_audit', [
    { stage: 'analysis', modelAlias: 'TERRA', reasoning: 'medium', outputLimit: 7_000 },
    { stage: 'decision', modelAlias: 'SOL', reasoning: 'medium', outputLimit: 3_500 },
    { stage: 'report', modelAlias: 'LUNA', reasoning: 'low', outputLimit: 10_000 },
  ], AI_ACTION_COSTS.product_strategy_audit, {
    contextBudget: 44_000,
    outputLimit: 10_000,
    fallbackPolicy: { aliases: [], allowDowngrade: false },
  }),
};

export const LEGACY_FEATURE_TO_ACTION: Record<string, AIActionKey> = {
  ai_chat: 'ai_chat',
  audio_transcription: 'audio_transcription',
  about_ai_summary: 'strategy_about',
  positioning: 'positioning',
  audience: 'audience',
  jtbd: 'audience',
  utp: 'utp',
  social: 'social',
  instagram_profile_generate: 'instagram_profile_generate',
  instagram_profile_improve: 'instagram_profile_improve',
  product_main: 'product_main',
  product_mini: 'product_mini',
  lead_magnet: 'lead_magnet',
  post: 'content_post',
  reel: 'content_reel',
  threads: 'content_thread',
  chatbot_chain: 'chatbot_scenario',
  article: 'content_article',
  video_script: 'youtube_script',
  content_plan: 'content_plan',
  tg_channel_description_generate: 'tg_channel_description_generate',
  tg_channel_description_improve: 'tg_channel_description_improve',
  tg_channel_plan: 'tg_channel_plan',
  tg_channel_idea_improve: 'tg_channel_idea_improve',
  tg_channel_post: 'tg_channel_post',
  tg_channel_post_edit: 'tg_channel_post_edit',
  tg_channel_post_audio_adapt: 'tg_channel_post_audio_adapt',
  tg_channel_post_video_script: 'tg_channel_post_video_script',
  castdev_transcription: 'castdev_transcription',
  castdev_analysis: 'castdev_analysis',
  castdev_synthesis: 'castdev_synthesis',
  cases_voice_transcription: 'cases_voice_transcription',
  cases_extract_case: 'cases_extract_case',
  cases_generate_marketing_insights: 'cases_generate_marketing_insights',
};

export function actionKeyForFeature(featureCode: string): AIActionKey {
  const actionKey = LEGACY_FEATURE_TO_ACTION[featureCode];
  if (!actionKey) throw new Error(`UNKNOWN_AI_ACTION: ${featureCode}`);
  return actionKey;
}
