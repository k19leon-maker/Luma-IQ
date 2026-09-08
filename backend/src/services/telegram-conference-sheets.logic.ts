export function sheetBoolean(value: unknown): boolean {
  return ['true', '1', 'yes', 'да'].includes(String(value ?? '').trim().toLowerCase());
}

export function normalizeUsername(value: unknown): string {
  return String(value ?? '').trim().replace(/^@+/, '').toLowerCase();
}

export function normalizePhone(value: unknown): string {
  const raw = String(value ?? '').trim();
  let digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  return `+${digits}`;
}

export function telegramMembershipConfirmed(member: { status?: string; is_member?: boolean }): boolean {
  if (['creator', 'administrator', 'member'].includes(member.status ?? '')) return true;
  return member.status === 'restricted' && member.is_member === true;
}

export function testAccountAllowed(input: {
  telegramUserId: string;
  username: string | null;
  allowedUserIds: string;
  allowedUsernames: string;
}): boolean {
  const ids = new Set(input.allowedUserIds.split(',').map((value) => value.trim()).filter(Boolean));
  const usernames = new Set(input.allowedUsernames.split(',').map(normalizeUsername).filter(Boolean));
  return ids.has(input.telegramUserId) || Boolean(input.username && usernames.has(normalizeUsername(input.username)));
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderConferenceMessage(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => (
    escapeHtml(variables[key] ?? '')
  ));
}

export function formatMoscow(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}:${part('second')}`;
}

export function addSheetTags(current: string, ...tags: string[]): string {
  const values = [...current.split(/[;,]/), ...tags]
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set(values)].join(';');
}

export function validTelegramJoinUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['t.me', 'telegram.me'].includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}
