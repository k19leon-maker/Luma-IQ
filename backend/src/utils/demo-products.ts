const DEMO_PRODUCT_PATTERNS = [
  /8\s+недель\s+к\s+близости/i,
  /5\s+фраз.*разрушают\s+доверие/i,
  /5\s+причин\s+почему\s+пары\s+ссорятся/i,
  /первый\s+шаг.*пар\s+в\s+кризис/i,
  /групповая\s+программа\s+для\s+пар.*восстановить\s+доверие/i,
];

export function isDemoProductText(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return DEMO_PRODUCT_PATTERNS.some((pattern) => pattern.test(text));
}

function isProductMaterial(value: Record<string, unknown>): boolean {
  return ['product-main', 'product-mini', 'lead-magnet'].includes(String(value.kind ?? ''));
}

function sanitizeGeneratedData(value: Record<string, unknown>): Record<string, unknown> {
  const next = { ...value };
  for (const key of ['productMain', 'productMini', 'leadMagnet']) {
    if (isDemoProductText(next[key])) delete next[key];
  }
  return next;
}

export function sanitizeProjectStrategyData<T>(data: T): T {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;

  const record = { ...(data as Record<string, unknown>) };
  if (Array.isArray(record.materialsData)) {
    record.materialsData = record.materialsData.filter((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return true;
      const material = item as Record<string, unknown>;
      return !(isProductMaterial(material) && isDemoProductText(material));
    });
  }

  if (record.generatedData && typeof record.generatedData === 'object' && !Array.isArray(record.generatedData)) {
    record.generatedData = sanitizeGeneratedData(record.generatedData as Record<string, unknown>);
  }

  return record as T;
}
