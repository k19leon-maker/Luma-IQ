import type { PromptConfig } from './types';

function text(inputs: Record<string, unknown>, key: string): string {
  const current = inputs[key];
  return typeof current === 'string' ? current.trim() : '';
}

const FACT_RULES = `Не выдумывай факты, цифры, цитаты, действия или результаты.
Не усиливай результат за пределами источника. Если данных нет, верни пустую строку.
Не добавляй юридические статусы, согласия на публикацию или имена клиентов.
Верни только валидный JSON без markdown и комментариев.`;

export const CASE_STUDY_WORKFLOW_PROMPTS: PromptConfig[] = [
  {
    id: 'cases.extract.v1', version: 'v1', feature: 'cases_extract_case', workflow: 'cases', step: 'extract',
    model: 'gpt-5.6-luna', temperature: 0.2, maxTokens: 10_000, artifactType: 'case_extraction_candidates',
    systemPrompt: () => `Ты — маркетинговый редактор и аналитик клиентских кейсов Luma IQ.
Выделяй самостоятельные истории и структурируй их в формате «Что было / Что сделали / Что стало».
${FACT_RULES}`,
    userPromptBuilder: ({ inputs }) => `Проанализируй подтверждённый пользователем текст. Если в нём несколько независимых историй, раздели их.
Верни все самостоятельные кейсы из текста. Если историй нет, верни {"cases":[]}.
Название формулируй тезисно, без имени клиента.
Схема: {"cases":[{"title":"","beforeText":"","actionsText":"","afterText":"","clientTask":"","clientProblem":"","desiredResult":"","marketingInsight":""}]}
Исходный текст:\n${text(inputs, 'sourceText')}`,
    validationRules: { structuredOutput: 'json', maxLength: 180_000 },
  },
  {
    id: 'cases.insights.v1', version: 'v1', feature: 'cases_generate_marketing_insights', workflow: 'cases', step: 'insights',
    model: 'gpt-5.6-luna', temperature: 0.2, maxTokens: 3_000, artifactType: 'case_marketing_insights',
    systemPrompt: () => `Ты — маркетинговый аналитик Luma IQ. Формулируй тезисы только из текста кейса.
${FACT_RULES}`,
    userPromptBuilder: ({ inputs }) => `Обнови маркетинговые тезисы кейса.
Название: ${text(inputs, 'title')}
Что было: ${text(inputs, 'beforeText')}
Что сделали: ${text(inputs, 'actionsText')}
Что стало: ${text(inputs, 'afterText')}
Схема: {"clientTask":"","clientProblem":"","desiredResult":"","marketingInsight":""}`,
    validationRules: { structuredOutput: 'json', maxLength: 12_000 },
  },
];
