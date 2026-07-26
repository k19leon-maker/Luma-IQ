import { describe, expect, it } from 'vitest';
import {
  aiActionResolverService,
  classifyDialogAction,
} from '../../src/services/ai-action-resolver.service';
import { aiPointsForGeneration } from '../../src/config/ai-actions';

describe('aiActionResolverService', () => {
  it('honors explicit dialog classes', () => {
    expect(classifyDialogAction({ message: 'Привет', dialogMode: 'quick' })).toBe('ai_chat_quick');
    expect(classifyDialogAction({ message: 'Привет', dialogMode: 'deep' })).toBe('ai_chat_deep');
    expect(classifyDialogAction({ message: 'Привет', dialogMode: 'strategy' })).toBe('ai_chat_strategy');
  });

  it('classifies auto mode deterministically', () => {
    expect(classifyDialogAction({ message: 'Как дела?', dialogMode: 'auto' })).toBe('ai_chat_quick');
    expect(classifyDialogAction({ message: 'Проанализируй подробно причины слабой конверсии', dialogMode: 'auto' })).toBe('ai_chat_deep');
    expect(classifyDialogAction({
      message: 'Разработай стратегию позиционирования и воронку запуска продукта для целевой аудитории',
      dialogMode: 'auto',
    })).toBe('ai_chat_strategy');
  });

  it('separates regeneration from initial content generation', () => {
    expect(aiActionResolverService.resolve({
      featureCode: 'threads',
      workflow: 'threads.post',
      step: 'regenerate',
      inputs: {},
    })).toBe('content_thread_regenerate');
    expect(aiActionResolverService.resolve({
      featureCode: 'threads',
      workflow: 'threads.plan',
      step: 'generate',
      inputs: {},
    })).toBe('content_thread');
  });

  it('uses lower-cost action keys for product edits', () => {
    expect(aiActionResolverService.resolve({
      featureCode: 'product_main',
      workflow: 'product.main',
      step: 'edit',
      inputs: {},
    })).toBe('product_main_edit');
    expect(aiActionResolverService.resolve({
      featureCode: 'product_mini',
      workflow: 'product.mini',
      step: 'edit',
      inputs: {},
    })).toBe('product_mini_edit');
    expect(aiActionResolverService.resolve({
      featureCode: 'lead_magnet',
      workflow: 'leadmagnet',
      step: 'edit',
      inputs: {},
    })).toBe('lead_magnet_edit');
  });

  it('routes selling posts and video scripts to their own pipelines', () => {
    expect(aiActionResolverService.resolve({
      featureCode: 'post',
      workflow: 'posts.post',
      step: 'write',
      inputs: { goal: 'Продажа консультации' },
    })).toBe('selling_post');
    expect(aiActionResolverService.resolve({
      featureCode: 'video_script',
      workflow: 'video.script',
      step: 'write',
      inputs: { intent: 'selling' },
    })).toBe('youtube_script_selling');
    expect(aiActionResolverService.resolve({
      featureCode: 'video_script',
      workflow: 'video.script',
      step: 'write',
      inputs: { intent: 'education' },
    })).toBe('youtube_script');
  });

  it('routes strategic offer, rebuild and product audit explicitly', () => {
    expect(aiActionResolverService.resolve({
      featureCode: 'utp',
      workflow: 'strategy.offer',
      step: 'generate',
      inputs: {},
    })).toBe('offer');
    expect(aiActionResolverService.resolve({
      featureCode: 'positioning',
      workflow: 'strategy.rebuild',
      step: 'generate',
      inputs: {},
    })).toBe('strategy_rebuild');
    expect(aiActionResolverService.resolve({
      featureCode: 'product_main',
      workflow: 'product.strategy',
      step: 'audit',
      inputs: {},
    })).toBe('product_strategy_audit');
  });

  it('charges the audience wizard once and treats later steps as included followups', () => {
    expect(aiActionResolverService.resolve({
      featureCode: 'audience',
      workflow: 'strategy.audience',
      step: 'generate',
      inputs: { stepId: 1 },
    })).toBe('audience');
    expect(aiActionResolverService.resolve({
      featureCode: 'audience',
      workflow: 'strategy.audience',
      step: 'generate',
      inputs: { stepId: 2 },
    })).toBe('audience_followup');
    expect(aiActionResolverService.resolve({
      featureCode: 'audience',
      workflow: 'strategy.audience',
      step: 'generate',
      inputs: { stepId: 1, mode: 'stepChat' },
    })).toBe('audience_followup');

    expect(aiPointsForGeneration('audience', {
      workflow: 'strategy.audience',
      audienceStepId: 1,
    })).toBe(25);
    expect(aiPointsForGeneration('audience', {
      workflow: 'strategy.audience',
      audienceStepId: 2,
    })).toBe(0);
  });
});
