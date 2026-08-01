export const PROJECT_STRATEGY_FIELDS = [
  'answers',
  'completed',
  'expertProfileData',
  'positioningData',
  'unpackingData',
  'unpackingAnswers',
  'unpackingCompleted',
  'progressFlags',
  'materialsData',
  'generatedData',
] as const;

export type ProjectStrategyField = typeof PROJECT_STRATEGY_FIELDS[number];

const PROJECT_STRATEGY_FIELD_SET = new Set<string>(PROJECT_STRATEGY_FIELDS);

export function parseProjectStrategyFields(value: unknown): {
  fields: ProjectStrategyField[] | null;
  invalid: string[];
} {
  if (value === undefined) return { fields: null, invalid: [] };
  if (typeof value !== 'string') return { fields: [], invalid: ['fields'] };

  const requested = [...new Set(value.split(',').map((field) => field.trim()).filter(Boolean))];
  const invalid = requested.filter((field) => !PROJECT_STRATEGY_FIELD_SET.has(field));
  return {
    fields: requested.filter((field): field is ProjectStrategyField => PROJECT_STRATEGY_FIELD_SET.has(field)),
    invalid,
  };
}

export function pickProjectStrategyFields(
  data: Record<string, unknown>,
  fields: ProjectStrategyField[] | null,
): Record<string, unknown> {
  if (fields === null) return data;
  return Object.fromEntries(fields.filter((field) => field in data).map((field) => [field, data[field]]));
}
