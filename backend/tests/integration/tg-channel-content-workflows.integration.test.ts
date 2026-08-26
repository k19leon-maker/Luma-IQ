import { describe, expect, it } from 'vitest';
import { AI_ACTION_COSTS } from '../../src/config/ai-actions';
import { AI_ACTION_DEFINITIONS } from '../../src/config/ai-action-registry';
import { promptRegistry } from '../../src/prompts/registry';
import { aiActionResolverService } from '../../src/services/ai-action-resolver.service';
import { workflowOutputValidationService } from '../../src/services/workflow-output-validation.service';

function planItem(position: number) {
  return {
    id: `tg-${position}`,
    position,
    role: `Роль ${position}`,
    readerTask: `Задача ${position}`,
    topic: `Тема ${position}`,
    keyMessage: `Мысль ${position}`,
    cta: 'Следующий шаг',
    status: 'idea',
  };
}

describe('Telegram plan, idea and post workflow contracts', () => {
  it('accepts only a sequential 12-15 item plan with key messages', () => {
    const valid = { title: 'План ТГ-канала', strategySummary: 'Логика цепочки', items: Array.from({ length: 12 }, (_, index) => planItem(index + 1)) };
    expect(workflowOutputValidationService.validate('tg-channel', 'plan', JSON.stringify(valid))).toEqual({ ok: true, errors: [] });
    expect(workflowOutputValidationService.validate('tg-channel', 'plan', JSON.stringify({ ...valid, items: valid.items.slice(0, 11) })).ok).toBe(false);
    expect(workflowOutputValidationService.validate('tg-channel', 'plan', JSON.stringify({ ...valid, items: valid.items.map((item, index) => index === 2 ? { ...item, position: 8 } : item) })).ok).toBe(false);
  });

  it('routes idea improvement to its own visible price and retry policy', () => {
    const prompt = promptRegistry.get('tg-channel', 'idea-improve');
    const actionKey = aiActionResolverService.resolve({ featureCode: prompt.feature, workflow: prompt.workflow, step: prompt.step, inputs: {} });
    expect(actionKey).toBe('tg_channel_idea_improve');
    expect(AI_ACTION_COSTS[actionKey]).toBe(2);
    expect(AI_ACTION_DEFINITIONS[actionKey].retryPolicy.maxAttempts).toBeGreaterThanOrEqual(2);
  });

  it('requires structured idea and post proposals', () => {
    expect(workflowOutputValidationService.validate('tg-channel', 'idea-improve', JSON.stringify({
      role: 'Роль', readerTask: 'Задача', topic: 'Тема', keyMessage: 'Мысль', cta: '',
    })).ok).toBe(true);
    expect(workflowOutputValidationService.validate('tg-channel', 'edit', JSON.stringify({
      title: 'Заголовок', text: 'Текст', callToAction: '', authorComment: '', status: 'ready',
    })).ok).toBe(true);
    expect(workflowOutputValidationService.validate('tg-channel', 'edit', '{"text":"без заголовка"}').ok).toBe(false);
  });
});

