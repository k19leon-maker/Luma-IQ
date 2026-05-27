import { FeatureCode } from '../../config/ai-economy';
import { ProjectContextBundle } from '../../services/project-context.service';

export interface WorkflowPromptInput {
  inputs: Record<string, unknown>;
  context: ProjectContextBundle;
}

export interface ValidationRules {
  requiredIncludes?: string[];
  forbiddenIncludes?: string[];
  requiredPatterns?: string[];
  forbiddenPatterns?: string[];
  minLength?: number;
  maxLength?: number;
  minHeadings?: number;
  minListItems?: number;
  structuredOutput?: 'text' | 'list' | 'article' | 'script';
}

export interface PromptConfig {
  id: string;
  version: string;
  feature: FeatureCode;
  workflow: string;
  step: string;
  model: string;
  temperature: number;
  maxTokens: number;
  artifactType: string;
  systemPrompt: (context: ProjectContextBundle) => string;
  userPromptBuilder: (input: WorkflowPromptInput) => string;
  validationRules: ValidationRules;
}
