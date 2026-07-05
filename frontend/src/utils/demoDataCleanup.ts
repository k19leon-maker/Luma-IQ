const DEMO_TEXT_PATTERNS = [
  /8\s+недель\s+к\s+близости/i,
  /5\s+фраз.*разрушают\s+доверие/i,
  /5\s+причин\s+почему\s+пары\s+ссорятся/i,
  /первый\s+шаг.*пар\s+в\s+кризис/i,
  /групповая\s+программа\s+для\s+пар/i,
];

const CLEANUP_VERSION_KEY = 'lumaiq_demo_product_cleanup_v1';

function hasDemoProductText(value: string): boolean {
  return DEMO_TEXT_PATTERNS.some((pattern) => pattern.test(value));
}

export function cleanupDemoProductStorage(): void {
  if (typeof window === 'undefined') return;

  try {
    if (window.localStorage.getItem(CLEANUP_VERSION_KEY) === 'done') return;

    const keysToRemove: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || key === CLEANUP_VERSION_KEY) continue;
      const value = window.localStorage.getItem(key);
      if (value && hasDemoProductText(value)) keysToRemove.push(key);
    }

    keysToRemove.forEach((key) => window.localStorage.removeItem(key));
    window.localStorage.setItem(CLEANUP_VERSION_KEY, 'done');
  } catch {
    // Some browsers can block storage access; app should still boot normally.
  }
}
