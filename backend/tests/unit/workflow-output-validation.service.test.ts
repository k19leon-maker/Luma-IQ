import { describe, expect, it } from 'vitest';
import { workflowOutputValidationService } from '../../src/services/workflow-output-validation.service';

const validProfile = {
  username: 'expert.name',
  displayName: 'Анна · нутрициолог',
  category: 'Нутрициология',
  bio: 'Помогаю наладить питание без жёстких диет',
  callToAction: 'Запись на разбор по ссылке',
  link: 'https://example.com',
  logicExplanation: 'Шапка называет аудиторию, результат и один следующий шаг.',
};

const validStory = {
  title: 'Задача клиента',
  role: 'Доверие',
  goal: 'Показать подход',
  format: 'talking_head',
  customFormat: '',
  frame: 'Эксперт в кадре',
  screenText: 'Как мы решаем задачу',
  speech: 'Короткое объяснение подхода',
  interactive: '',
  callToAction: 'Открыть следующую сторис',
  transition: 'Дальше покажу пример',
};

const validHighlight = {
  title: 'Обо мне',
  goal: 'Познакомить',
  description: 'Подход и опыт',
  icon: 'ОБ',
  stories: Array.from({ length: 5 }, (_, index) => ({ ...validStory, title: `Сторис ${index + 1}` })),
};

describe('workflow output validation', () => {
  it('accepts a strict Instagram profile result', () => {
    expect(workflowOutputValidationService.validate(
      'instagram.profile',
      'generate',
      JSON.stringify(validProfile),
      { currentProfile: { username: 'expert.name', link: 'https://example.com' } },
    )).toEqual({ ok: true, errors: [] });
  });

  it('rejects unknown fields and Instagram limit violations', () => {
    const result = workflowOutputValidationService.validate(
      'instagram.profile',
      'improve',
      JSON.stringify({ ...validProfile, bio: 'а'.repeat(151), inventedFact: '100 клиентов' }),
      { currentProfile: { username: 'expert.name', link: 'https://example.com' } },
    );

    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('bio');
    expect(result.errors.join(' ')).toContain('Unrecognized key');
  });

  it('does not impose Instagram schema on unrelated workflows', () => {
    expect(workflowOutputValidationService.validate('posts.post', 'generate', 'Текст'))
      .toEqual({ ok: true, errors: [] });
  });

  it('rejects invented username and link values', () => {
    const result = workflowOutputValidationService.validate(
      'instagram.profile',
      'generate',
      JSON.stringify({ ...validProfile, username: 'invented', link: 'https://invented.test' }),
      { currentProfile: { username: 'expert.name', link: 'https://example.com' } },
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'username: AI must preserve the current value',
      'link: AI must preserve the current value',
    ]));
  });

  it('validates all Instagram Highlights workflow outputs', () => {
    const full = {
      highlights: Array.from({ length: 6 }, (_, index) => ({ ...validHighlight, title: `Highlight ${index + 1}` })),
      missingFacts: [],
    };
    expect(workflowOutputValidationService.validate(
      'instagram.highlights',
      'generate',
      JSON.stringify(full),
    )).toEqual({ ok: true, errors: [] });
    expect(workflowOutputValidationService.validate(
      'instagram.highlight',
      'scenario',
      JSON.stringify({ stories: validHighlight.stories, missingFacts: [] }),
    )).toEqual({ ok: true, errors: [] });
    expect(workflowOutputValidationService.validate(
      'instagram.highlight',
      'improve',
      JSON.stringify({ highlight: validHighlight, missingFacts: [] }),
    )).toEqual({ ok: true, errors: [] });
    expect(workflowOutputValidationService.validate(
      'instagram.story',
      'improve',
      JSON.stringify({ story: validStory, missingFacts: [] }),
    )).toEqual({ ok: true, errors: [] });
  });

  it('rejects unknown fields and undersized generated Highlights', () => {
    const result = workflowOutputValidationService.validate(
      'instagram.highlights',
      'generate',
      JSON.stringify({
        highlights: [{ ...validHighlight, inventedProduct: 'Курс' }],
        missingFacts: [],
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/highlights|Unrecognized key/);
  });
});
