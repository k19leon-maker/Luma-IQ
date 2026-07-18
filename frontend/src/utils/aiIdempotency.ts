function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, current]) => `${JSON.stringify(key)}:${stableStringify(current)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function hash(input: string): string {
  let result = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    result ^= input.charCodeAt(i);
    result = Math.imul(result, 0x01000193);
  }
  return (result >>> 0).toString(16).padStart(8, '0');
}

export function makeAiIdempotencyKey(input: {
  projectId: string;
  workflow: string;
  step?: string;
  inputs?: Record<string, unknown>;
  scope?: string;
}): string {
  return [
    'workflow',
    input.projectId,
    input.workflow,
    input.step ?? '',
    input.scope ?? '',
    hash(stableStringify(input.inputs ?? {})),
  ].join(':');
}
