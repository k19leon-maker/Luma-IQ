import { ValidationRules } from '../prompts/registry';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export const aiValidationService = {
  validate(content: string, rules: ValidationRules): ValidationResult {
    const errors: string[] = [];
    const text = content.trim();

    if (rules.minLength && text.length < rules.minLength) {
      errors.push(`Output is too short: ${text.length}/${rules.minLength}`);
    }

    for (const required of rules.requiredIncludes ?? []) {
      if (!text.includes(required)) {
        errors.push(`Missing required block: ${required}`);
      }
    }

    if (rules.structuredOutput === 'list') {
      const listLikeLines = text.split('\n').filter((line) => /^\s*(?:[-*]|\d+[\).\]])\s+/.test(line));
      if (listLikeLines.length < 3) errors.push('Expected list-like output');
    }

    if (rules.structuredOutput === 'article') {
      if (!/^#/.test(text) && !text.includes('##')) errors.push('Expected markdown headings');
    }

    if (rules.structuredOutput === 'script') {
      if (!text.toLowerCase().includes('сцен')) errors.push('Expected scene-based script');
    }

    return { ok: errors.length === 0, errors };
  },
};
