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

export const PROJECT_GENERATED_DATA_FIELDS = [
  'utp',
  'utpHistory',
  'social',
  'productMain',
  'productMini',
  'leadMagnet',
  'leadMagnets',
] as const;

export type ProjectGeneratedDataField = typeof PROJECT_GENERATED_DATA_FIELDS[number];

const PROJECT_STRATEGY_FIELD_SET = new Set<string>(PROJECT_STRATEGY_FIELDS);
const PROJECT_GENERATED_DATA_FIELD_SET = new Set<string>(PROJECT_GENERATED_DATA_FIELDS);

function parseFields<T extends string>(
  value: unknown,
  allowed: Set<string>,
): { fields: T[] | null; invalid: string[] } {
  if (value === undefined) return { fields: null, invalid: [] };
  if (typeof value !== 'string') return { fields: [], invalid: ['fields'] };

  const requested = [...new Set(value.split(',').map((field) => field.trim()).filter(Boolean))];
  const invalid = requested.filter((field) => !allowed.has(field));
  return {
    fields: requested.filter((field): field is T => allowed.has(field)),
    invalid,
  };
}

export function parseProjectStrategyFields(value: unknown): {
  fields: ProjectStrategyField[] | null;
  invalid: string[];
} {
  return parseFields<ProjectStrategyField>(value, PROJECT_STRATEGY_FIELD_SET);
}

export function parseProjectGeneratedDataFields(value: unknown): {
  fields: ProjectGeneratedDataField[] | null;
  invalid: string[];
} {
  return parseFields<ProjectGeneratedDataField>(value, PROJECT_GENERATED_DATA_FIELD_SET);
}

export function pickProjectStrategyFields(
  data: Record<string, unknown>,
  fields: ProjectStrategyField[] | null,
): Record<string, unknown> {
  if (fields === null) return data;
  return Object.fromEntries(fields.filter((field) => field in data).map((field) => [field, data[field]]));
}

export function pickProjectGeneratedDataFields(
  data: Record<string, unknown>,
  fields: ProjectGeneratedDataField[] | null,
): Record<string, unknown> {
  if (fields === null) return data;
  return Object.fromEntries(fields.filter((field) => field in data).map((field) => [field, data[field]]));
}
