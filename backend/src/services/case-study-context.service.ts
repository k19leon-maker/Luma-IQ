import { prisma } from '../lib/prisma';

const MAX_READY_CASES = 5;
const MAX_FIELD_CHARS = 420;
const MAX_CASE_CHARS = 1_650;
const MAX_TOTAL_CHARS = 9_000;

export interface ReadyCaseForContext {
  id: string;
  title: string;
  beforeText: string;
  actionsText: string;
  afterText: string;
  clientTask: string | null;
  clientProblem: string | null;
  desiredResult: string | null;
  marketingInsight: string | null;
  updatedAt: Date;
}

function truncate(value: string | null, maxChars = MAX_FIELD_CHARS): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (normalized.length <= maxChars) return normalized;
  const suffix = '...[сокращено]';
  if (maxChars <= suffix.length) return normalized.slice(0, maxChars);
  return `${normalized.slice(0, maxChars - suffix.length).trim()}${suffix}`;
}

function limitCase(record: ReadyCaseForContext): ReadyCaseForContext {
  const limited = {
    ...record,
    title: truncate(record.title, 240) ?? '',
    beforeText: truncate(record.beforeText) ?? '',
    actionsText: truncate(record.actionsText) ?? '',
    afterText: truncate(record.afterText) ?? '',
    clientTask: truncate(record.clientTask),
    clientProblem: truncate(record.clientProblem),
    desiredResult: truncate(record.desiredResult),
    marketingInsight: truncate(record.marketingInsight),
  };

  let remaining = MAX_CASE_CHARS;
  const take = (value: string | null): string | null => {
    if (!value || remaining <= 0) return value ? '[сокращено]' : null;
    const next = truncate(value, remaining);
    remaining -= next?.length ?? 0;
    return next;
  };

  return {
    ...limited,
    title: take(limited.title) ?? '',
    beforeText: take(limited.beforeText) ?? '',
    actionsText: take(limited.actionsText) ?? '',
    afterText: take(limited.afterText) ?? '',
    clientTask: take(limited.clientTask),
    clientProblem: take(limited.clientProblem),
    desiredResult: take(limited.desiredResult),
    marketingInsight: take(limited.marketingInsight),
  };
}

function renderCase(record: ReadyCaseForContext, index: number): string {
  const optional = [
    record.clientTask ? `Задача клиента: ${record.clientTask}` : '',
    record.clientProblem ? `Проблема клиента: ${record.clientProblem}` : '',
    record.desiredResult ? `Желаемый результат: ${record.desiredResult}` : '',
    record.marketingInsight ? `Вывод для маркетинга: ${record.marketingInsight}` : '',
  ].filter(Boolean);

  return [
    `### Кейс ${index + 1}: ${record.title}`,
    `Что было: ${record.beforeText}`,
    `Что сделали: ${record.actionsText}`,
    `Что стало: ${record.afterText}`,
    ...optional,
  ].join('\n');
}

export const caseStudyContextService = {
  async getReadyCasesForProject(
    userId: string,
    projectId: string,
    limit = MAX_READY_CASES,
  ): Promise<ReadyCaseForContext[]> {
    const take = Math.max(0, Math.min(Math.floor(limit), MAX_READY_CASES));
    if (take === 0) return [];

    const records = await prisma.caseStudy.findMany({
      where: { userId, projectId, status: 'ready' },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take,
      select: {
        id: true,
        title: true,
        beforeText: true,
        actionsText: true,
        afterText: true,
        clientTask: true,
        clientProblem: true,
        desiredResult: true,
        marketingInsight: true,
        updatedAt: true,
      },
    });

    return records.map((record) => limitCase(record));
  },

  renderForPrompt(records: ReadyCaseForContext[]): string {
    const header = [
      'Используй эти готовые кейсы только как внутреннюю фактуру проекта и доказательства результата.',
      'Не называй кейс опубликованным или согласованным отзывом и не придумывай цитаты, цифры или разрешение клиента на публикацию.',
    ].join('\n');
    if (records.length === 0) return '';

    const rendered: string[] = [header];
    let used = header.length;
    for (const [index, record] of records.entries()) {
      const next = renderCase(record, index);
      if (used + next.length > MAX_TOTAL_CHARS) break;
      rendered.push(next);
      used += next.length;
    }
    return rendered.join('\n\n');
  },
};
