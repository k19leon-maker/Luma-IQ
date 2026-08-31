import { describe, expect, it } from 'vitest';
import type { UtpFoundation } from '../../src/contracts/utp-foundation.contract';
import type { UtpAiResult } from '../../src/contracts/utp-workspace.contract';
import { promptRegistry } from '../../src/prompts/registry';
import { workflowOutputValidationService } from '../../src/services/workflow-output-validation.service';

const LABELS = {
  niche: 'Ниша',
  audience: 'Аудитория',
  jtbd: 'Задача клиента',
  pains: 'Боли',
  desiredOutcome: 'Желаемый результат',
  product: 'Продукт',
  mechanism: 'Механизм',
  differentiation: 'Отличие',
  proofs: 'Доказательства',
  constraints: 'Ограничения',
} as const;

function longUsp(subject: string, result: string): string {
  return `${subject} помогает выбранной аудитории перейти от разрозненных действий к понятному результату: ${result}. `
    + 'Работа начинается с реальной задачи клиента и причин, которые мешают решить её привычным способом. '
    + 'Продукт соединяет последовательную методику, практическую работу и понятные точки контроля, поэтому человек видит логику движения и может принимать осознанные решения. '
    + 'Подход учитывает ограничения проекта, не подменяет работу клиента пустыми обещаниями и опирается на уже зафиксированные факты. '
    + 'В результате предложение объясняет, кому оно подходит, какую задачу решает, какой способ используется и почему этому способу можно доверять.';
}

function foundation(input: { niche: string; audience: string; product: string; proof?: string }): UtpFoundation {
  const ready = (value: string, source: string, editPath: string) => ({
    status: 'ready' as const,
    value,
    source,
    editPath,
  });
  return {
    version: 1,
    projectId: 'project-1',
    niche: ready(input.niche, 'project.niche', '/app/strategy/about'),
    audience: ready(input.audience, 'strategy.answers.chosenSegment', '/app/strategy/audience'),
    jtbd: ready('Решить ключевую задачу без хаотичных действий', 'strategy.answers.chosenRequest', '/app/strategy/audience'),
    pains: {
      status: 'ready',
      values: [
        { value: 'Нет понятного маршрута', source: 'strategy.answers.corePains[0]' },
        { value: 'Сложно связать решения', source: 'strategy.answers.corePains[1]' },
        { value: 'Не хватает уверенности в следующем шаге', source: 'strategy.answers.corePains[2]' },
      ],
      editPath: '/app/strategy/audience',
    },
    desiredOutcome: ready('Понятная система работы и следующий шаг', 'strategy.answers.finalResult', '/app/strategy/audience'),
    product: ready(input.product, 'product:product-1', '/app/products/main'),
    mechanism: ready('Последовательная методика и единый контекст', 'strategy.positioningData.mechanism', '/app/strategy/positioning'),
    differentiation: ready('Решения связаны между собой и не начинаются заново', 'strategy.positioningData.differentiation', '/app/strategy/positioning'),
    proofs: input.proof
      ? {
        status: 'ready',
        values: [{ value: input.proof, source: 'caseStudy:case-1.afterText' }],
        editPath: '/app/strategy/cases',
      }
      : {
        status: 'missing',
        values: [],
        editPath: '/app/strategy/cases',
        missingReason: 'not_provided',
      },
    constraints: {
      status: 'ready',
      values: [{ value: 'Без гарантии коммерческого результата', source: 'strategy.expertProfileData.antiPreferences[0]' }],
      editPath: '/app/strategy/about',
    },
  };
}

function validResult(current: UtpFoundation, usp: string): UtpAiResult {
  const usedEvidence: UtpAiResult['usedEvidence'] = [
    { key: 'niche', label: LABELS.niche, source: current.niche.source! },
    { key: 'audience', label: LABELS.audience, source: current.audience.source! },
    { key: 'jtbd', label: LABELS.jtbd, source: current.jtbd.source! },
    { key: 'pains', label: LABELS.pains, source: current.pains.values[0]!.source },
    { key: 'desiredOutcome', label: LABELS.desiredOutcome, source: current.desiredOutcome.source! },
    { key: 'product', label: LABELS.product, source: current.product.source! },
    { key: 'mechanism', label: LABELS.mechanism, source: current.mechanism.source! },
    { key: 'differentiation', label: LABELS.differentiation, source: current.differentiation.source! },
    { key: 'constraints', label: LABELS.constraints, source: current.constraints.values[0]!.source },
  ];
  if (current.proofs.status === 'ready') {
    usedEvidence.push({ key: 'proofs', label: LABELS.proofs, source: current.proofs.values[0]!.source });
  }
  const missingData: UtpAiResult['missingData'] = current.proofs.status === 'missing'
    ? [{ key: 'proofs', label: LABELS.proofs, editPath: current.proofs.editPath }]
    : [];
  return { usp, usedEvidence, missingData };
}

describe('strict UTP AI contract and grounding', () => {
  it('uses separate generate and improve prompts with one strict JSON contract', () => {
    const context = {
      rendered: 'UtpFoundation version: 1\n- Ниша: Маркетинг',
      contextVersion: 'utp-foundation-v1',
      approxTokens: 100,
    } as never;
    const generate = promptRegistry.get('strategy.utp', 'generate');
    const improve = promptRegistry.get('strategy.utp', 'improve');
    const generatePrompt = generate.userPromptBuilder({ inputs: { inputText: 'Сделай конкретнее' }, context });
    const improvePrompt = improve.userPromptBuilder({
      inputs: { currentUtp: 'Текущее УТП', inputText: 'Убери общие слова' },
      context,
    });

    expect(generate.id).toBe('strategy.utp.generate.v2');
    expect(improve.id).toBe('strategy.utp.improve.v1');
    expect(generate.validationRules.structuredOutput).toBe('json');
    expect(improve.validationRules.structuredOutput).toBe('json');
    expect(generate.systemPrompt(context)).toContain('семь вопросов');
    expect(generatePrompt).toContain('"usedEvidence"');
    expect(generatePrompt).toContain('Сделай конкретнее');
    expect(improvePrompt).toContain('Текущее УТП');
    expect(improvePrompt).toContain('Убери общие слова');
  });

  it.each([
    ['психолог', 'Психологическая практика', 'Консультационная программа'],
    ['маркетолог', 'Маркетинг для экспертов', 'Система запуска'],
    ['образование', 'Дополнительное образование', 'Практический учебный курс'],
  ])('accepts grounded JSON for the %s fixture without niche substitution', (_name, niche, product) => {
    const current = foundation({ niche, audience: 'Взрослые клиенты', product, proof: 'Клиент выстроил понятный процесс работы' });
    const result = validResult(current, longUsp(product, 'понятная система действий'));

    expect(workflowOutputValidationService.validate(
      'strategy.utp',
      'generate',
      JSON.stringify(result),
      {},
      current,
    )).toEqual({ ok: true, errors: [] });
  });

  it('accepts a project without proof only when the missing proof is returned explicitly', () => {
    const current = foundation({ niche: 'Консалтинг', audience: 'Владельцы проектов', product: 'Стратегическая сессия' });
    const result = validResult(current, longUsp('Стратегическая сессия', 'согласованный план действий'));

    expect(workflowOutputValidationService.validate(
      'strategy.utp',
      'generate',
      JSON.stringify(result),
      {},
      current,
    )).toEqual({ ok: true, errors: [] });

    expect(workflowOutputValidationService.validate(
      'strategy.utp',
      'generate',
      JSON.stringify({ ...result, missingData: [] }),
      {},
      current,
    ).errors).toContain('missingData.proofs: missing required entry');
  });

  it('rejects an unsupported number and accepts it when a used ready case contains it', () => {
    const unsupported = foundation({ niche: 'Консалтинг', audience: 'Эксперты', product: 'Программа', proof: 'Клиент наладил процесс' });
    const unsupportedResult = validResult(unsupported, longUsp('Программа за 30 дней', 'системная работа'));
    expect(workflowOutputValidationService.validate(
      'strategy.utp', 'generate', JSON.stringify(unsupportedResult), {}, unsupported,
    ).errors.join(' ')).toContain('number "30" is not grounded');

    const grounded = foundation({ niche: 'Консалтинг', audience: 'Эксперты', product: 'Программа', proof: '20 клиентов наладили процесс' });
    const groundedResult = validResult(grounded, longUsp('Программа для 20 клиентов', 'системная работа'));
    expect(workflowOutputValidationService.validate(
      'strategy.utp', 'generate', JSON.stringify(groundedResult), {}, grounded,
    )).toEqual({ ok: true, errors: [] });
  });

  it('does not ground a deadline with an unrelated number and checks education and experience sources', () => {
    const wrongNumberMeaning = foundation({
      niche: 'Консалтинг',
      audience: 'Эксперты',
      product: 'Программа',
      proof: '30 клиентов наладили процесс',
    });
    const deadlineResult = validResult(wrongNumberMeaning, longUsp('Программа за 30 дней', 'системная работа'));
    const deadlineValidation = workflowOutputValidationService.validate(
      'strategy.utp', 'generate', JSON.stringify(deadlineResult), {}, wrongNumberMeaning,
    );
    expect(deadlineValidation.errors.join(' ')).toContain('timeframe "30 дней" is not grounded');

    const unsupportedProfile = foundation({ niche: 'Консалтинг', audience: 'Эксперты', product: 'Программа' });
    const profileResult = validResult(
      unsupportedProfile,
      longUsp('Дипломированный эксперт с 15 лет опыта', 'системная работа'),
    );
    const profileValidation = workflowOutputValidationService.validate(
      'strategy.utp', 'generate', JSON.stringify(profileResult), {}, unsupportedProfile,
    );
    expect(profileValidation.errors.join(' ')).toContain('experience claim is not grounded');
    expect(profileValidation.errors.join(' ')).toContain('education claim is not grounded');

    const groundedDeadline = foundation({
      niche: 'Консалтинг', audience: 'Эксперты', product: 'Программа', proof: 'Клиент получил результат за 30 дней',
    });
    const groundedDeadlineResult = validResult(groundedDeadline, longUsp('Программа за 30 дней', 'системная работа'));
    expect(workflowOutputValidationService.validate(
      'strategy.utp', 'generate', JSON.stringify(groundedDeadlineResult), {}, groundedDeadline,
    )).toEqual({ ok: true, errors: [] });
  });

  it('rejects unknown source refs, wrong section keys and unsupported strong claims', () => {
    const current = foundation({ niche: 'Консалтинг', audience: 'Эксперты', product: 'Программа', proof: 'Клиент наладил процесс' });
    const result = validResult(current, longUsp('Программа гарантирует результат', 'системная работа'));
    result.usedEvidence[0] = { key: 'product', label: LABELS.product, source: 'invented.source' };
    result.usedEvidence[1] = { key: 'product', label: LABELS.product, source: current.audience.source! };
    const validation = workflowOutputValidationService.validate(
      'strategy.utp', 'improve', JSON.stringify(result), {}, current,
    );

    expect(validation.ok).toBe(false);
    expect(validation.errors.join(' ')).toContain('source does not exist');
    expect(validation.errors.join(' ')).toContain('expected key audience, got product');
    expect(validation.errors.join(' ')).toContain('unsupported strong claim');
  });

  it('accepts an explicit disclaimer that no result guarantee is provided', () => {
    const current = foundation({ niche: 'Консалтинг', audience: 'Эксперты', product: 'Программа' });
    const result = validResult(
      current,
      longUsp('Программа без гарантии коммерческого результата', 'системная работа'),
    );

    expect(workflowOutputValidationService.validate(
      'strategy.utp', 'generate', JSON.stringify(result), {}, current,
    )).toEqual({ ok: true, errors: [] });
  });

  it('rejects malformed JSON, extra keys and a result without foundation', () => {
    const current = foundation({ niche: 'Консалтинг', audience: 'Эксперты', product: 'Программа', proof: 'Клиент наладил процесс' });
    const result = validResult(current, longUsp('Программа', 'системная работа'));

    expect(workflowOutputValidationService.validate('strategy.utp', 'generate', '{bad-json', {}, current).ok).toBe(false);
    expect(workflowOutputValidationService.validate(
      'strategy.utp', 'generate', JSON.stringify({ ...result, extra: true }), {}, current,
    ).ok).toBe(false);
    expect(workflowOutputValidationService.validate(
      'strategy.utp', 'generate', JSON.stringify(result), {}, undefined,
    ).errors).toContain('UTP foundation is required for grounding validation');
  });
});
