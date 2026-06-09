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
  threads: ['THREADS'],
};

const EMPTY = 'Не заполнено.';

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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function field(source: Record<string, unknown>, keys: string[], fallback = ''): string {
  for (const key of keys) {
    const value = source[key];
    const text = stringify(value).trim();
    if (text) return text;
  }
  return fallback;
}

function lines(items: Array<[string, unknown]>, maxChars = 2200): string {
  const text = items
    .map(([label, value]) => {
      const rendered = stringify(value).trim();
      return rendered ? `- ${label}: ${rendered}` : '';
    })
    .filter(Boolean)
    .join('\n');
  return compact(text || EMPTY, maxChars);
}

function shortList(values: unknown[], maxItems: number, render: (item: unknown, index: number) => string): string {
  const text = values
    .slice(0, maxItems)
    .map(render)
    .filter(Boolean)
    .join('\n\n');
  return text || EMPTY;
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
  if (workflow.startsWith('threads.')) {
    return step === 'regenerate' ? 9000 : 12000;
  }
  if (workflow.startsWith('positioning.')) {
    if (workflow === 'positioning.variants') return 5200;
    return 4200;
  }
  return 8000;
}

function workflowGroup(workflow: string): string {
  return workflow.split('.')[0] ?? workflow;
}

function shouldInclude(blockKey: string, workflow: string): boolean {
  const group = workflowGroup(workflow);
  const common = new Set(['project', 'expert_profile', 'workflow_inputs']);
  if (common.has(blockKey)) return true;

  if (workflow.startsWith('positioning.')) {
    return ['strategy_summary', 'audience_summary', 'products_summary'].includes(blockKey);
  }

  if (group === 'posts') {
    return ['positioning_summary', 'utp_summary', 'audience_summary', 'products_summary', 'content_history'].includes(blockKey);
  }

  if (group === 'threads') {
    return ['positioning_summary', 'utp_summary', 'audience_summary', 'products_summary', 'content_history'].includes(blockKey);
  }

  if (group === 'reels') {
    return ['positioning_summary', 'audience_summary', 'products_summary', 'content_history'].includes(blockKey);
  }

  if (group === 'articles') {
    return ['positioning_summary', 'audience_summary', 'products_summary', 'content_history'].includes(blockKey);
  }

  if (group === 'chatbot' || group === 'video') {
    return ['positioning_summary', 'utp_summary', 'audience_summary', 'products_summary', 'content_history'].includes(blockKey);
  }

  if (group === 'product' || group === 'leadmagnet') {
    return ['positioning_summary', 'utp_summary', 'audience_summary', 'products_summary'].includes(blockKey);
  }

  if (group === 'strategy') {
    return ['positioning_summary', 'utp_summary', 'audience_summary', 'products_summary'].includes(blockKey);
  }

  return ['positioning_summary', 'utp_summary', 'audience_summary', 'products_summary', 'content_history'].includes(blockKey);
}

function summarizeProject(project: {
  name: string;
  niche: string | null;
  description: string | null;
  strategySummary: string | null;
}): string {
  return lines([
    ['Название', project.name],
    ['Ниша', project.niche],
    ['Описание', project.description],
    ['Краткая стратегия', project.strategySummary],
  ], 1200);
}

function summarizeExpert(about: Record<string, unknown>, projectName: string, projectNiche?: string | null): string {
  return lines([
    ['Имя / обращение', field(about, ['expertName', 'name', 'displayName'])],
    ['Профессия / роль', field(about, ['profession', 'role', 'specialization'], projectNiche ?? projectName)],
    ['Ниша', field(about, ['niche', 'sphere'], projectNiche ?? '')],
    ['Опыт', field(about, ['experienceYears', 'experience', 'yearsInProfession'])],
    ['Формат работы', field(about, ['workFormat', 'format', 'currentFormat'])],
    ['Текущие продукты и цены', field(about, ['productsAndPrices', 'products', 'services'])],
    ['Компетенции', field(about, ['competencies', 'strongTopics', 'expertise'])],
    ['Не хочет делать / с кем не работает', field(about, ['dontWant', 'antiAudience', 'notFor'])],
    ['Важно в работе', field(about, ['values', 'workValues', 'importantInWork'])],
    ['Образование / регалии', field(about, ['education', 'certificates', 'credentials'])],
    ['Опыт / достижения / цифры', field(about, ['achievements', 'cases', 'results', 'numbers'])],
    ['Дополнительные материалы', field(about, ['uploadedFilesSummary', 'additionalMaterials', 'notes'])],
  ], 2400);
}

function summarizeStrategy(strategyData: Record<string, unknown>, projectSummary?: string | null): string {
  const finalPositioning = field(strategyData, [
    'finalPositioning',
    'selectedPositioning',
    'positioning',
    'positioningFormula',
    'strategyPositioning',
  ]);
  const selectedVariant = field(strategyData, ['selectedVariant', 'chosenVariant', 'positioningVariant']);
  return lines([
    ['Финальное позиционирование', finalPositioning || projectSummary],
    ['Выбранный стратегический вариант', selectedVariant],
    ['Целевой сегмент / клиент', field(strategyData, ['chosenSegment', 'typicalClient', 'audience', 'targetAudience'])],
    ['Ключевая проблема', field(strategyData, ['problem', 'mainProblem', 'clientProblem'])],
    ['Результат для клиента', field(strategyData, ['keyResult', 'finalResult', 'result'])],
    ['Механизм / подход', field(strategyData, ['mechanism', 'uniqueApproach', 'approach', 'method'])],
    ['Дифференциация', field(strategyData, ['differentiation', 'difference', 'uniqueValue'])],
    ['Доказательства доверия', field(strategyData, ['proof', 'trustProof', 'cases'])],
  ], 2200);
}

function summarizeUtp(value: unknown): string {
  const data = asRecord(value);
  if (!Object.keys(data).length) return EMPTY;
  return lines([
    ['Главное УТП', field(data, ['finalUtp', 'utp', 'statement', 'formula'])],
    ['Ключевая выгода', field(data, ['benefit', 'keyBenefit', 'result'])],
    ['Механизм', field(data, ['mechanism', 'approach'])],
    ['Доказательства', field(data, ['proof', 'reasonsToBelieve'])],
    ['Возражения', field(data, ['objections', 'barriers'])],
  ], 1600);
}

function summarizeAudience(avatars: unknown[], jtbdSessions: unknown[]): string {
  const avatarText = shortList(avatars, 3, (item, index) => {
    const avatar = asRecord(item);
    return lines([
      [`Сегмент ${index + 1}`, field(avatar, ['name', 'segment', 'subsegment'])],
      ['Профиль', field(avatar, ['profileSummary', 'description'])],
      ['Боли', field(avatar, ['pains'])],
      ['Желания', field(avatar, ['desires'])],
      ['Возражения / барьеры', field(avatar, ['objections', 'barriers', 'notes'])],
    ], 900);
  });

  const jtbdText = shortList(jtbdSessions, 2, (item, index) => {
    const session = asRecord(item);
    return lines([
      [`JTBD ${index + 1}`, field(session, ['title', 'finalJob'])],
      ['Итоговый job', field(session, ['finalJob'])],
      ['Summary', field(session, ['summary'])],
      ['Ключевые ответы', compact(session.answers, 650)],
    ], 900);
  });

  return compact(`Аватары / сегменты:\n${avatarText}\n\nJTBD:\n${jtbdText}`, 3000);
}

function summarizeProducts(products: unknown[]): string {
  return shortList(products, 5, (item, index) => {
    const product = asRecord(item);
    return lines([
      [`Продукт ${index + 1}`, field(product, ['title'])],
      ['Тип', field(product, ['type'])],
      ['Формат', field(product, ['format'])],
      ['Краткое описание', field(product, ['shortDescription', 'description'])],
      ['Трансформация', field(product, ['transformation'])],
      ['Оффер', field(product, ['offer'])],
      ['Цена', field(product, ['priceText', 'price'])],
    ], 900);
  });
}

function summarizeContentHistory(items: unknown[], workflow: string): string {
  const group = workflowGroup(workflow);
  const label = group === 'reels' ? 'Reels' : group === 'articles' ? 'Статья' : group === 'posts' ? 'Пост' : 'Контент';
  return shortList(items, 5, (item, index) => {
    const content = asRecord(item);
    const metadata = asRecord(content.metadata);
    return lines([
      [`${label} ${index + 1}`, field(content, ['title'])],
      ['Тип', field(content, ['type'])],
      ['Тема / цель', field(metadata, ['topic', 'goal', 'platform'])],
      ['Краткий фрагмент', compact(field(content, ['content']), 420)],
    ], 700);
  });
}

function summarizeWorkflowInputs(inputs: Record<string, unknown> | undefined, workflow: string): string {
  const source = asRecord(inputs ?? {});
  if (!Object.keys(source).length) return EMPTY;

  const group = workflowGroup(workflow);
  const allowByGroup: Record<string, string[]> = {
    posts: ['platform', 'postType', 'goal', 'topic', 'cta', 'facture', 'selectedTopic'],
    reels: ['platform', 'goal', 'tone', 'intensity', 'hook', 'cta', 'facture', 'selectedHook'],
    articles: ['articleType', 'platform', 'tone', 'depth', 'topic', 'cta', 'facture', 'selectedTopic', 'outline'],
    threads: ['goal', 'formatMix', 'salesIntensity', 'tone', 'missingSections', 'sourceSnapshot', 'existingPost', 'dayNumber', 'rewriteAction'],
    chatbot: ['botName', 'segment', 'leadMagnetFormat', 'meetingSchedule', 'goal', 'facture'],
    video: ['duration', 'topic', 'segment', 'facture', 'cta'],
    product: ['currentProduct', 'userRequest', 'prompt', 'selectedOption'],
    leadmagnet: ['format', 'stepLabel', 'currentLeadMagnet', 'userRequest', 'prompt'],
    positioning: ['currentHypothesis', 'analysis', 'variants', 'finalPositioning', 'selectedVariant'],
    strategy: ['prompt', 'platform', 'section', 'selectedSegment'],
  };

  const allowed = allowByGroup[group] ?? Object.keys(source);
  const selected = Object.fromEntries(
    allowed
      .filter((key) => source[key] !== undefined && source[key] !== null && stringify(source[key]).trim())
      .map((key) => [key, source[key]]),
  );

  return compact(Object.keys(selected).length ? selected : source, group === 'product' || group === 'leadmagnet' ? 2400 : 1800);
}

export const projectContextService = {
  async build(input: BuildContextInput): Promise<ProjectContextBundle> {
    const workflowGroupName = workflowGroup(input.workflow);
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
          where: CONTENT_TYPE_BY_WORKFLOW[workflowGroupName]
            ? { type: { in: CONTENT_TYPE_BY_WORKFLOW[workflowGroupName] } }
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
    const projectSummary = summarizeProject(project);
    const expertSummary = summarizeExpert(about, project.name, project.niche);
    const strategySummary = summarizeStrategy(strategyData, project.strategySummary);
    const audienceSummary = summarizeAudience(project.audienceAvatars, project.jtbdSessions);
    const productsSummary = summarizeProducts(project.products);
    const contentHistorySummary = summarizeContentHistory(project.generatedTexts, input.workflow);
    const workflowInputSummary = summarizeWorkflowInputs(input.inputs, input.workflow);
    const profile = {
      expertName: stringify(about.expertName ?? about.name ?? about.displayName),
      expertProfileSummary: expertSummary,
      specialization: stringify(about.specialization ?? about.role ?? project.niche ?? project.name),
      niche: stringify(about.niche ?? project.niche ?? project.name),
      typicalClient: stringify(strategyData.chosenSegment ?? strategyData.typicalClient ?? strategyData.audience ?? ''),
      uniqueApproach: stringify(strategyData.uniqueApproach ?? strategyData.approach ?? ''),
      keyResult: stringify(strategyData.keyResult ?? strategyData.finalResult ?? ''),
      positioning: stringify(strategyData.positioning ?? project.strategySummary ?? ''),
    };
    const base = buildProjectContext(profile, project.name);

    const allBlocks: ContextBlock[] = [
      {
        key: 'project',
        title: 'Проект',
        priority: 'critical',
        content: projectSummary,
      },
      {
        key: 'expert_profile',
        title: 'О себе / профиль эксперта',
        priority: 'critical',
        content: expertSummary,
      },
      {
        key: 'strategy_summary',
        title: 'Краткая стратегия проекта',
        priority: 'high',
        content: strategySummary,
      },
      {
        key: 'positioning_summary',
        title: 'Позиционирование',
        priority: 'high',
        content: strategySummary,
      },
      {
        key: 'utp_summary',
        title: 'УТП',
        priority: workflowGroupName === 'posts' || workflowGroupName === 'reels' || workflowGroupName === 'product' || workflowGroupName === 'leadmagnet' ? 'high' : 'medium',
        content: summarizeUtp(project.utpData),
      },
      {
        key: 'audience_summary',
        title: 'ЦА / JTBD / боли',
        priority: 'high',
        content: audienceSummary,
      },
      {
        key: 'products_summary',
        title: 'Продукты и офферы',
        priority: workflowGroupName === 'product' || workflowGroupName === 'leadmagnet' ? 'high' : 'medium',
        content: productsSummary,
      },
      {
        key: 'content_history',
        title: 'Предыдущий контент этого типа',
        priority: workflowGroupName === 'articles' || workflowGroupName === 'reels' || workflowGroupName === 'posts' ? 'medium' : 'low',
        content: contentHistorySummary,
      },
      {
        key: 'workflow_inputs',
        title: 'Входные параметры текущего workflow',
        priority: 'critical',
        content: workflowInputSummary,
      },
    ];
    const blocks = allBlocks.filter((block) => shouldInclude(block.key, input.workflow));

    const selectedBlocks = selectBlocks(blocks, tokenBudget);
    const rendered = renderBlocks(selectedBlocks);

    return {
      projectId: project.id,
      projectName: project.name,
      workflow: input.workflow,
      step: input.step,
      contextVersion: 'project-context-v2',
      base,
      blocks: selectedBlocks,
      rendered,
      approxTokens: estimateTokens(rendered),
    };
  },
};
