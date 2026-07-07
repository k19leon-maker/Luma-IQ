const DEMO_TEXT_PATTERNS = [
  /8\s+недель\s+к\s+близости/i,
  /5\s+фраз.*разрушают\s+доверие/i,
  /5\s+причин\s+почему\s+пары\s+ссорятся/i,
  /первый\s+шаг.*пар\s+в\s+кризис/i,
  /групповая\s+программа\s+для\s+пар/i,
  /вы\s+ссоритесь\s+об\s+одном\s+и\s+том\s+же/i,
  /большинство\s+пар\s+ссорятся/i,
  /ко\s+мне\s+пришла\s+она.*34\s+года/i,
  /почему\s+пары\s+ссорятся\s+об\s+одном\s+и\s+том\s+же/i,
  /интеллект\s+не\s+помогает\s+договориться/i,
  /3\s+техники\s+снятия\s+тревоги/i,
  /тревога\s+не\s+всегда\s+просит/i,
  /миф:\s*к\s+специалисту\s+ходят/i,
  /история\s+клиентки.*тревога/i,
  /маша\s+и\s+игор/i,
  /невысказанные\s+ожидания\s+разрушают\s+отношения/i,
  /пост-боль\s*·\s*telegram/i,
  /пост-инсайт\s*·\s*instagram/i,
  /пост-история\s*·\s*telegram/i,
];

const CLEANUP_VERSION_KEY = 'lumaiq_demo_content_cleanup_v2';

export function isDemoContentText(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return DEMO_TEXT_PATTERNS.some((pattern) => pattern.test(text));
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
      if (value && isDemoContentText(value)) keysToRemove.push(key);
    }

    keysToRemove.forEach((key) => window.localStorage.removeItem(key));
    window.localStorage.setItem(CLEANUP_VERSION_KEY, 'done');
  } catch {
    // Some browsers can block storage access; app should still boot normally.
  }
}
