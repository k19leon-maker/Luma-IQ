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

    if (rules.maxLength && text.length > rules.maxLength) {
      errors.push(`Output is too long: ${text.length}/${rules.maxLength}`);
    }

    for (const required of rules.requiredIncludes ?? []) {
      if (!text.includes(required)) {
        errors.push(`Missing required block: ${required}`);
      }
    }

    for (const forbidden of rules.forbiddenIncludes ?? []) {
      if (text.includes(forbidden)) {
        errors.push(`Forbidden fragment found: ${forbidden}`);
      }
    }

    for (const pattern of rules.requiredPatterns ?? []) {
      const regex = new RegExp(pattern, 'im');
      if (!regex.test(text)) {
        errors.push(`Missing required pattern: ${pattern}`);
      }
    }

    for (const pattern of rules.forbiddenPatterns ?? []) {
      const regex = new RegExp(pattern, 'im');
      if (regex.test(text)) {
        errors.push(`Forbidden pattern found: ${pattern}`);
      }
    }

    const headings = text.split('\n').filter((line) => /^\s{0,3}#{2,4}\s+\S+/.test(line));
    if (rules.minHeadings && headings.length < rules.minHeadings) {
      errors.push(`Expected at least ${rules.minHeadings} markdown headings, got ${headings.length}`);
    }

    const listLikeLines = text.split('\n').filter((line) => /^\s*(?:[-*]|\d+[\).\]])\s+/.test(line));
    if (rules.minListItems && listLikeLines.length < rules.minListItems) {
      errors.push(`Expected at least ${rules.minListItems} list items, got ${listLikeLines.length}`);
    }

    if (rules.structuredOutput === 'list') {
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
