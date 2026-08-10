import { describe, expect, it } from 'vitest';
import { promptRegistry } from '../../src/prompts/registry';

const context = {
  base: '',
  project: null,
  selective: '',
  includedSections: [],
};

const cases = [
  ['positioning.variants', 'generate', { currentHypothesis: 'Гипотеза', instruction: 'Подчеркни практический опыт' }],
  ['positioning.final', 'generate', { selectedVariant: 'Вариант', currentDraft: 'Черновик', instruction: 'Сделай короче' }],
  ['strategy.utp', 'generate', { mode: 'improve', currentUtp: 'Текущее УТП', inputText: 'Добавь конкретный результат' }],
  ['instagram.profile', 'improve', { currentProfile: {}, instruction: 'Усиль следующий шаг' }],
  ['instagram.highlights', 'generate', { currentHighlights: [], instruction: 'Добавь раздел о продукте' }],
  ['instagram.highlight', 'scenario', { highlight: {}, neighborHighlights: [], instruction: 'Сделай живее' }],
  ['instagram.highlight', 'improve', { highlight: {}, instruction: 'Убери повторы' }],
  ['instagram.story', 'improve', { highlight: {}, story: {}, neighborStories: [], instruction: 'Сократи речь' }],
] as const;

describe('P2 product form voice instruction contracts', () => {
  it.each(cases)('%s.%s includes the editable user instruction in the OpenAI prompt', (workflow, step, inputs) => {
    const prompt = promptRegistry.get(workflow, step).userPromptBuilder({ inputs, context });
    const instruction = 'instruction' in inputs ? inputs.instruction : inputs.inputText;

    expect(prompt).toContain(instruction);
  });
});
