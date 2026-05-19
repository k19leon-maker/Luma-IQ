import { ProjectContextBundle } from '../../services/project-context.service';

export function value(inputs: Record<string, unknown>, key: string, fallback = ''): string {
  const current = inputs[key];
  if (current === null || current === undefined) return fallback;
  if (typeof current === 'string') return current.trim() || fallback;
  return JSON.stringify(current);
}

export function contextAppendix(context: ProjectContextBundle): string {
  return [
    '# Selective project context',
    context.rendered,
    '',
    `Context version: ${context.contextVersion}`,
    `Approx tokens: ${context.approxTokens}`,
  ].join('\n');
}
