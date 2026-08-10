import { describe, expect, it } from 'vitest';
import { promptRegistry } from '../../src/prompts/registry';
import type { ProjectContextBundle } from '../../src/services/project-context.service';

const context = {
  projectId: 'project-1',
  projectName: 'Тестовый проект',
  workflow: 'test',
  contextVersion: 'test-v1',
  base: {},
  blocks: [],
  rendered: 'Контекст тестового проекта',
  approxTokens: 10,
} as ProjectContextBundle;

describe('Main dialog edit workflow contracts', () => {
  it('keeps the free AI dialog connected to its message workflow', () => {
    const prompt = promptRegistry.get('ai.dialog', 'message');
    const userPrompt = prompt.userPromptBuilder({
      inputs: {
        message: 'Проверь мою гипотезу',
        history: [{ role: 'user', content: 'История диалога' }],
      },
      context,
    });

    expect(prompt.feature).toBe('ai_chat');
    expect(userPrompt).toContain('Проверь мою гипотезу');
    expect(userPrompt).toContain('История диалога');
  });

  it('asks for a complete updated audience step in edit mode', () => {
    const prompt = promptRegistry.get('strategy.audience', 'generate');
    const userPrompt = prompt.userPromptBuilder({
      inputs: {
        mode: 'stepEdit',
        stepId: 10,
        stepTitle: 'Болезненные вопросы',
        currentResult: 'Старый результат шага',
        question: 'Добавь страх потерять время',
      },
      context,
    });

    expect(userPrompt).toContain('Старый результат шага');
    expect(userPrompt).toContain('Добавь страх потерять время');
    expect(userPrompt).toContain('полный обновлённый результат этого шага');
  });

  it.each([
    ['product.main', 'currentProduct', '# Основной продукт'],
    ['product.mini', 'currentProduct', '# Мини-продукт'],
    ['leadmagnet', 'currentLeadMagnet', '# Лид-магнит'],
  ] as const)('%s.edit receives the current artifact and returns headed sections', (workflow, currentField, currentValue) => {
    const prompt = promptRegistry.get(workflow, 'edit');
    const userPrompt = prompt.userPromptBuilder({
      inputs: {
        [currentField]: currentValue,
        userRequest: 'Перепиши оффер',
        stepLabel: 'Редактирование',
        stepTask: 'Выполни правку текущего документа',
      },
      context,
    });

    expect(userPrompt).toContain(currentValue);
    expect(userPrompt).toContain('Перепиши оффер');
    expect(userPrompt).toMatch(/заголовк(?:а|ами) ##/);
  });
});
