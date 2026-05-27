import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

type StructuredDomain = 'positioning' | 'product' | 'content' | 'chat' | 'strategy' | 'other';

interface BuildStructuredInput {
  userId: string;
  projectId: string;
  artifactId: string;
  workflow: string;
  step?: string | null;
  type: string;
  title?: string | null;
  content: string;
  inputs: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

interface StructuredResult {
  domain: StructuredDomain;
  kind: string;
  key?: string;
  title?: string | null;
  content: string;
  data: Record<string, unknown>;
}

function firstText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function domainFor(workflow: string, type: string): StructuredDomain {
  if (workflow.startsWith('positioning.') || type.startsWith('positioning_')) return 'positioning';
  if (workflow.startsWith('product.') || workflow === 'leadmagnet' || type.startsWith('product_') || type.startsWith('leadmagnet')) return 'product';
  if (
    workflow.startsWith('posts.') ||
    workflow.startsWith('reels.') ||
    workflow.startsWith('articles.') ||
    workflow.startsWith('video.') ||
    workflow.startsWith('chatbot.')
  ) return 'content';
  if (workflow.startsWith('ai.dialog')) return 'chat';
  if (workflow.startsWith('strategy.')) return 'strategy';
  return 'other';
}

function parseHeadings(markdown: string): Array<{ level: number; title: string; body: string }> {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const sections: Array<{ level: number; title: string; body: string[] }> = [];
  let current: { level: number; title: string; body: string[] } | null = null;

  for (const line of lines) {
    const match = /^(#{1,4})\s+(.+?)\s*$/.exec(line);
    if (match) {
      current = { level: match[1].length, title: match[2].trim(), body: [] };
      sections.push(current);
      continue;
    }
    if (current) current.body.push(line);
  }

  return sections.map((section) => ({
    level: section.level,
    title: section.title,
    body: section.body.join('\n').trim(),
  }));
}

function parseColonFields(text: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let currentKey = '';

  for (const line of lines) {
    const match = /^[-*]?\s*([^:\n]{2,80}):\s*(.*)$/.exec(line.trim());
    if (match) {
      currentKey = match[1].trim().toLowerCase();
      fields[currentKey] = match[2].trim();
      continue;
    }
    if (currentKey && line.trim()) {
      fields[currentKey] = `${fields[currentKey]}\n${line.trim()}`.trim();
    }
  }

  return fields;
}

function parseNumberedItems(text: string): Array<{ title: string; body: string; fields: Record<string, string> }> {
  const chunks = text
    .split(/\n(?=\s*(?:\d+[\).]|[-*])\s+)/g)
    .map((item) => item.trim())
    .filter(Boolean);

  return chunks.map((chunk) => {
    const cleaned = chunk.replace(/^\s*(?:\d+[\).]|[-*])\s+/, '').trim();
    const [firstLine = '', ...rest] = cleaned.split('\n');
    return {
      title: firstLine.replace(/\*\*/g, '').trim(),
      body: rest.join('\n').trim() || cleaned,
      fields: parseColonFields(cleaned),
    };
  });
}

function parseJsonIfPresent(text: string): Record<string, unknown> | null {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) return null;
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? { items: parsed } : parsed;
  } catch {
    return null;
  }
}

function normalizePositioning(input: BuildStructuredInput): Record<string, unknown> {
  const sections = parseHeadings(input.content);
  const fields = parseColonFields(input.content);
  const variants = sections
    .filter((section) => section.level === 3)
    .map((section) => ({
      title: section.title,
      ...parseColonFields(section.body),
      body: section.body,
    }));

  return {
    kind: input.type,
    workflow: input.workflow,
    step: input.step,
    sections,
    fields,
    variants,
    scores: {
      clarity: fields['ясность'],
      differentiation: fields['отличие от конкурентов'],
      trust: fields['доверие'],
      premiumPotential: fields['премиальный потенциал'],
      specificity: fields['конкретика'],
      marketSaturation: fields['насыщенность рынка'],
    },
    finalPositioning: firstText(input.inputs.finalPositioning) || fields['формулировка'] || null,
  };
}

function normalizeProduct(input: BuildStructuredInput): Record<string, unknown> {
  const sections = parseHeadings(input.content);
  const fields = parseColonFields(input.content);
  const modules = sections
    .filter((section) => /модул|заняти|урок|день/i.test(section.title))
    .map((section) => ({ title: section.title, body: section.body, fields: parseColonFields(section.body) }));

  return {
    kind: input.type,
    workflow: input.workflow,
    step: input.step,
    title: firstText(input.inputs.title) || fields['название'] || fields['лучшее название'] || input.title,
    offer: fields['оффер'] || fields['главный оффер'] || null,
    description: fields['описание'] || fields['описание продукта'] || null,
    promise: fields['продуктовое обещание'] || fields['главный результат'] || null,
    sections,
    fields,
    modules,
  };
}

function normalizeContent(input: BuildStructuredInput): Record<string, unknown> {
  const sections = parseHeadings(input.content);
  const fields = parseColonFields(input.content);
  return {
    kind: input.type,
    workflow: input.workflow,
    step: input.step,
    title: firstText(input.inputs.topic) || fields['заголовок'] || sections[0]?.title || input.title,
    platform: firstText(input.inputs.platform) || null,
    goal: firstText(input.inputs.goal) || null,
    cta: fields['cta'] || fields['призыв к действию'] || null,
    sections,
    fields,
    items: parseNumberedItems(input.content),
  };
}

export const structuredOutputService = {
  build(input: BuildStructuredInput): StructuredResult {
    const json = parseJsonIfPresent(input.content);
    const domain = domainFor(input.workflow, input.type);
    let data: Record<string, unknown>;

    if (json) data = json;
    else if (domain === 'positioning') data = normalizePositioning(input);
    else if (domain === 'product') data = normalizeProduct(input);
    else if (domain === 'content') data = normalizeContent(input);
    else data = { kind: input.type, workflow: input.workflow, step: input.step, content: input.content };

    return {
      domain,
      kind: input.type,
      key: `${input.workflow}.${input.step ?? 'result'}`,
      title: input.title ?? firstText(input.inputs.topic) ?? firstText(input.inputs.title) ?? input.type,
      content: input.content,
      data,
    };
  },

  async save(input: BuildStructuredInput): Promise<void> {
    const structured = this.build(input);
    await prisma.projectStructuredOutput.create({
      data: {
        userId: input.userId,
        projectId: input.projectId,
        artifactId: input.artifactId,
        domain: structured.domain,
        kind: structured.kind,
        key: structured.key,
        title: structured.title ?? null,
        content: structured.content,
        data: structured.data as Prisma.InputJsonValue,
        source: 'ai_artifact',
      },
    });
  },
};
