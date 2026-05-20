import { GeneratedTextType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ProjectContext, buildProjectContext } from '../utils/buildProjectContext';

export type ContextPriority = 'critical' | 'high' | 'medium' | 'low';

export interface ContextBlock {
  key: string;
  title: string;
  priority: ContextPriority;
  content: string;
}

export interface ProjectContextBundle {
  projectId: string;
  projectName: string;
  workflow: string;
  step?: string;
  contextVersion: string;
  base: ProjectContext;
  blocks: ContextBlock[];
  rendered: string;
  approxTokens: number;
}

interface BuildContextInput {
  userId: string;
  projectId: string;
  workflow: string;
  step?: string;
  inputs?: Record<string, unknown>;
  tokenBudget?: number;
}

const CONTENT_TYPE_BY_WORKFLOW: Record<string, GeneratedTextType[]> = {
  posts: ['POST'],
  reels: ['REEL'],
  articles: ['ARTICLE'],
};

function stringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(stringify).filter(Boolean).join('\n');
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function compact(value: unknown, maxChars = 2200): string {
  const text = stringify(value).trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n...[сокращено]`;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function priorityWeight(priority: ContextPriority): number {
  if (priority === 'critical') return 4;
  if (priority === 'high') return 3;
  if (priority === 'medium') return 2;
  return 1;
}

function renderBlocks(blocks: ContextBlock[]): string {
  return blocks
    .filter((block) => block.content.trim().length > 0)
    .map((block) => `## ${block.title}\n${block.content.trim()}`)
    .join('\n\n');
}

function selectBlocks(blocks: ContextBlock[], tokenBudget: number): ContextBlock[] {
  const sorted = [...blocks].sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority));
  const selected: ContextBlock[] = [];
  let used = 0;

  for (const block of sorted) {
    const cost = estimateTokens(block.content);
    if (used + cost > tokenBudget && block.priority !== 'critical') continue;
    selected.push(block);
    used += cost;
  }

  return selected.sort((a, b) => blocks.indexOf(a) - blocks.indexOf(b));
}

function contextBudgetFor(workflow: string, step?: string): number {
  if (workflow === 'product.main') {
    if (step === 'modules' || step === 'edit') return 7000;
    if (step === 'names' || step === 'promise') return 4200;
    return 5600;
  }
  if (workflow === 'product.mini') {
    if (step === 'landingBlock' || step === 'telegramPosts' || step === 'edit') return 7600;
    if (step === 'bestName' || step === 'mainResult') return 4800;
    return 6200;
  }
  if (workflow === 'leadmagnet') {
    if (step === 'edit' || step === 'content' || step === 'script') return 8000;
    return 6200;
  }
  if (workflow.startsWith('positioning.')) {
    if (workflow === 'positioning.variants') return 5200;
    return 4200;
  }
  return 8000;
}

export const projectContextService = {
  async build(input: BuildContextInput): Promise<ProjectContextBundle> {
    const workflowGroup = input.workflow.split('.')[0] ?? input.workflow;
    const tokenBudget = input.tokenBudget ?? contextBudgetFor(input.workflow, input.step);

    const project = await prisma.project.findFirst({
      where: { id: input.projectId, userId: input.userId },
      include: {
        audienceAvatars: {
          orderBy: { updatedAt: 'desc' },
          take: 3,
        },
        products: {
          orderBy: { updatedAt: 'desc' },
          take: 6,
        },
        generatedTexts: {
          where: CONTENT_TYPE_BY_WORKFLOW[workflowGroup]
            ? { type: { in: CONTENT_TYPE_BY_WORKFLOW[workflowGroup] } }
            : undefined,
          orderBy: { updatedAt: 'desc' },
          take: 6,
        },
        jtbdSessions: {
          orderBy: { updatedAt: 'desc' },
          take: 2,
        },
      },
    });

    if (!project) {
      throw new Error('Проект не найден');
    }

    const strategyData = (project.strategyData ?? {}) as Record<string, unknown>;
    const about = (strategyData.aboutExpert ?? strategyData.about ?? strategyData.expertProfile ?? {}) as Record<string, unknown>;
    const profile = {
      expertName: stringify(about.expertName ?? about.name ?? about.displayName),
      expertProfileSummary: compact(about, 1800),
      specialization: stringify(about.specialization ?? about.role ?? project.niche ?? project.name),
      niche: stringify(about.niche ?? project.niche ?? project.name),
      typicalClient: stringify(strategyData.chosenSegment ?? strategyData.typicalClient ?? strategyData.audience ?? ''),
      uniqueApproach: stringify(strategyData.uniqueApproach ?? strategyData.approach ?? ''),
      keyResult: stringify(strategyData.keyResult ?? strategyData.finalResult ?? ''),
      positioning: stringify(strategyData.positioning ?? project.strategySummary ?? ''),
    };
    const base = buildProjectContext(profile, project.name);

    const blocks: ContextBlock[] = [
      {
        key: 'project',
        title: 'Проект',
        priority: 'critical',
        content: compact({
          name: project.name,
          niche: project.niche,
          description: project.description,
          strategySummary: project.strategySummary,
        }, 1400),
      },
      {
        key: 'expert_profile',
        title: 'О себе / профиль эксперта',
        priority: 'critical',
        content: compact(about, 2200),
      },
      {
        key: 'strategy',
        title: 'Стратегия и позиционирование',
        priority: 'high',
        content: compact(strategyData, 2600),
      },
      {
        key: 'utp',
        title: 'УТП',
        priority: workflowGroup === 'posts' || workflowGroup === 'reels' || workflowGroup === 'product' || workflowGroup === 'leadmagnet' ? 'high' : 'medium',
        content: compact(project.utpData, 1800),
      },
      {
        key: 'audience',
        title: 'ЦА / JTBD / боли',
        priority: 'high',
        content: compact({
          avatars: project.audienceAvatars.map((avatar) => ({
            name: avatar.name,
            segment: avatar.segment,
            subsegment: avatar.subsegment,
            profileSummary: avatar.profileSummary,
            pains: avatar.pains,
            desires: avatar.desires,
            notes: avatar.notes,
          })),
          jtbd: project.jtbdSessions.map((session) => ({
            title: session.title,
            answers: session.answers,
            summary: session.summary,
            finalJob: session.finalJob,
          })),
        }, 3000),
      },
      {
        key: 'products',
        title: 'Продукты и офферы',
        priority: workflowGroup === 'product' || workflowGroup === 'leadmagnet' ? 'high' : 'medium',
        content: compact(project.products.map((product) => ({
          type: product.type,
          title: product.title,
          format: product.format,
          shortDescription: product.shortDescription,
          transformation: product.transformation,
          offer: product.offer,
          priceText: product.priceText,
        })), 2400),
      },
      {
        key: 'content_history',
        title: 'Предыдущий контент этого типа',
        priority: workflowGroup === 'articles' || workflowGroup === 'reels' || workflowGroup === 'posts' ? 'medium' : 'low',
        content: compact(project.generatedTexts.map((item) => ({
          type: item.type,
          title: item.title,
          content: item.content.slice(0, 900),
          metadata: item.metadata,
        })), 3200),
      },
      {
        key: 'workflow_inputs',
        title: 'Входные параметры текущего workflow',
        priority: 'critical',
        content: compact(input.inputs ?? {}, workflowGroup === 'product' || workflowGroup === 'leadmagnet' ? 3600 : 2200),
      },
    ];

    const selectedBlocks = selectBlocks(blocks, tokenBudget);
    const rendered = renderBlocks(selectedBlocks);

    return {
      projectId: project.id,
      projectName: project.name,
      workflow: input.workflow,
      step: input.step,
      contextVersion: 'project-context-v1',
      base,
      blocks: selectedBlocks,
      rendered,
      approxTokens: estimateTokens(rendered),
    };
  },
};
