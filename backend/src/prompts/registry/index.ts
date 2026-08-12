import { CONTENT_WORKFLOW_PROMPTS } from './content-workflows';
import { CASE_STUDY_WORKFLOW_PROMPTS } from './case-study-workflows';
import { PromptConfig } from './types';

const PROMPTS = [...CONTENT_WORKFLOW_PROMPTS, ...CASE_STUDY_WORKFLOW_PROMPTS];

function key(workflow: string, step: string): string {
  return `${workflow}.${step}`;
}

const BY_WORKFLOW_STEP = new Map<string, PromptConfig>(
  PROMPTS.map((prompt) => [key(prompt.workflow, prompt.step), prompt]),
);

export const promptRegistry = {
  list(): PromptConfig[] {
    return PROMPTS;
  },

  get(workflow: string, step: string): PromptConfig {
    const config = BY_WORKFLOW_STEP.get(key(workflow, step));
    if (!config) {
      throw new Error(`Prompt config not found for workflow=${workflow} step=${step}`);
    }
    return config;
  },
};

export type { PromptConfig, ValidationRules } from './types';
