import { sanitizeProjectStrategyData } from '../utils/demo-products';
import {
  UTP_FOUNDATION_VERSION,
  UtpFoundation,
  UtpFoundationListSection,
  UtpFoundationSection,
  utpFoundationSchema,
} from '../contracts/utp-foundation.contract';
import { prisma } from '../lib/prisma';
import { caseStudyContextService } from './case-study-context.service';

const SECTION_LIMITS = {
  niche: 320,
  audience: 700,
  jtbd: 900,
  desiredOutcome: 700,
  product: 1_000,
  mechanism: 750,
  differentiation: 750,
  listItem: 420,
} as const;
const MAX_AUDIENCE_OPTIONS = 12;
const MAX_LIST_ITEMS = 6;
const TRUNCATED_SUFFIX = '...[сокращено]';

type RecordValue = Record<string, unknown>;

interface TextCandidate {
  value: string;
  source: string;
}

interface AudienceSelection {
  section: UtpFoundationSection;
  avatarId: string | null;
}

export class UtpFoundationNotFoundError extends Error {
  constructor() {
    super('Проект не найден');
    this.name = 'UtpFoundationNotFoundError';
  }
}

function asRecord(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue
    : {};
}

function firstRecord(candidates: Array<{ value: unknown; path: string }>): { record: RecordValue; path: string } {
  for (const candidate of candidates) {
    const record = asRecord(candidate.value);
    if (Object.keys(record).length) return { record, path: candidate.path };
  }
  return { record: {}, path: 'strategy.expertProfileData' };
}

function normalize(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function truncate(value: string, maxChars: number): string {
  const normalized = normalize(value);
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - TRUNCATED_SUFFIX.length).trim()}${TRUNCATED_SUFFIX}`;
}

function firstCandidate(candidates: Array<TextCandidate | null | undefined>): TextCandidate | null {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const value = normalize(candidate.value);
    if (value) return { value, source: candidate.source };
  }
  return null;
}

function fromField(source: RecordValue, path: string, keys: string[]): TextCandidate | null {
  for (const key of keys) {
    const value = normalize(source[key]);
    if (value) return { value, source: `${path}.${key}` };
  }
  return null;
}

function readySection(candidate: TextCandidate, editPath: string, maxChars: number): UtpFoundationSection {
  return {
    status: 'ready',
    value: truncate(candidate.value, maxChars),
    source: candidate.source,
    editPath,
  };
}

function missingSection(
  editPath: string,
  reason: 'not_provided' | 'ambiguous' = 'not_provided',
  options?: Array<{ id: string; label: string }>,
): UtpFoundationSection {
  return {
    status: 'missing',
    value: '',
    source: null,
    editPath,
    missingReason: reason,
    ...(options?.length ? { options } : {}),
  };
}

function itemText(value: unknown): string[] {
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) return [];
    const lines = normalized
      .split(/\r?\n|\s*[;•]\s*/)
      .map((item) => item.replace(/^[-–—\d.)\s]+/, '').trim())
      .filter(Boolean);
    return lines.length > 1 ? lines : [normalize(normalized)];
  }
  if (Array.isArray(value)) return value.flatMap(itemText);
  const record = asRecord(value);
  if (!Object.keys(record).length) return [];
  const title = normalize(record.title ?? record.name ?? record.label ?? record.value);
  const detail = normalize(record.quote ?? record.text ?? record.description ?? record.summary);
  if (title && detail && title !== detail) return [`${title}: ${detail}`];
  return [title || detail].filter(Boolean);
}

function listCandidates(value: unknown, source: string): TextCandidate[] {
  return itemText(value).map((item, index) => ({
    value: item,
    source: `${source}${Array.isArray(value) ? `[${index}]` : ''}`,
  }));
}

function readyList(candidates: TextCandidate[], editPath: string, minReadyItems = 1): UtpFoundationListSection {
  const seen = new Set<string>();
  const values = candidates
    .map((candidate) => ({
      value: truncate(candidate.value, SECTION_LIMITS.listItem),
      source: candidate.source,
    }))
    .filter((candidate) => {
      const key = candidate.value.toLocaleLowerCase('ru-RU');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_LIST_ITEMS);

  return values.length >= minReadyItems
    ? { status: 'ready', values, editPath }
    : { status: 'missing', values, editPath, missingReason: 'not_provided' };
}

function audienceLabel(avatar: { name: string; segment: string | null; subsegment: string | null }): string {
  return normalize(avatar.name || avatar.subsegment || avatar.segment);
}

function audienceValue(avatar: {
  name: string;
  segment: string | null;
  subsegment: string | null;
  profileSummary: string | null;
}): string {
  return [audienceLabel(avatar), normalize(avatar.profileSummary)].filter(Boolean).join('. ');
}

function normalizedMatch(value: unknown): string {
  return normalize(value).toLocaleLowerCase('ru-RU');
}

function selectAudience(input: {
  explicit: TextCandidate | null;
  general: TextCandidate | null;
  avatars: Array<{
    id: string;
    name: string;
    segment: string | null;
    subsegment: string | null;
    profileSummary: string | null;
  }>;
}): AudienceSelection {
  if (input.explicit) {
    const selected = normalizedMatch(input.explicit.value);
    const avatar = input.avatars.find((item) => {
      const labels = [item.name, item.segment, item.subsegment].map(normalizedMatch).filter(Boolean);
      return labels.some((label) => label === selected || label.includes(selected) || selected.includes(label));
    });
    const value = avatar
      ? [input.explicit.value, normalize(avatar.profileSummary)].filter(Boolean).join('. ')
      : input.explicit.value;
    return {
      section: readySection({ value, source: input.explicit.source }, '/app/strategy/audience', SECTION_LIMITS.audience),
      avatarId: avatar?.id ?? null,
    };
  }

  if (input.avatars.length === 1) {
    const avatar = input.avatars[0]!;
    return {
      section: readySection(
        { value: audienceValue(avatar), source: `audienceAvatar:${avatar.id}` },
        '/app/strategy/audience',
        SECTION_LIMITS.audience,
      ),
      avatarId: avatar.id,
    };
  }

  if (input.avatars.length > 1) {
    return {
      section: missingSection(
        '/app/strategy/audience',
        'ambiguous',
        input.avatars.slice(0, MAX_AUDIENCE_OPTIONS).map((avatar) => ({
          id: avatar.id,
          label: audienceLabel(avatar),
        })).filter((option) => option.label),
      ),
      avatarId: null,
    };
  }

  return {
    section: input.general
      ? readySection(input.general, '/app/strategy/audience', SECTION_LIMITS.audience)
      : missingSection('/app/strategy/audience'),
    avatarId: null,
  };
}

function productValue(product: {
  title: string;
  format: string | null;
  shortDescription: string | null;
  transformation: string | null;
  offer: string | null;
}): string {
  return [product.title, product.offer, product.transformation, product.shortDescription, product.format]
    .map(normalize)
    .filter(Boolean)
    .join('. ');
}

function generatedProduct(generated: RecordValue): TextCandidate | null {
  for (const [key, label] of [['productMain', 'Основной продукт'], ['productMini', 'Мини-продукт'], ['leadMagnet', 'Лид-магнит']] as const) {
    const product = asRecord(generated[key]);
    if (!Object.keys(product).length) continue;
    const value = [
      normalize(product.name ?? product.title) || label,
      normalize(product.offer),
      normalize(product.transformation),
      normalize(product.description ?? product.shortDescription),
      normalize(product.format),
    ].filter(Boolean).join('. ');
    if (value) return { value, source: `strategy.generatedData.${key}` };
  }
  return null;
}

function renderFoundationSection(label: string, section: UtpFoundationSection): string {
  if (section.status === 'missing') {
    return `- ${label}: [missing:${section.missingReason ?? 'not_provided'}]\n  editPath: ${section.editPath ?? 'null'}`;
  }
  return `- ${label}: ${section.value}\n  source: ${section.source}`;
}

function renderFoundationList(label: string, section: UtpFoundationListSection): string {
  if (section.status === 'missing') {
    const existing = section.values.map((item) => `  - ${item.value} [source: ${item.source}]`);
    return [
      `- ${label}: [missing:${section.missingReason ?? 'not_provided'}]`,
      `  editPath: ${section.editPath ?? 'null'}`,
      ...existing,
    ].join('\n');
  }
  return [`- ${label}:`, ...section.values.map((item) => `  - ${item.value} [source: ${item.source}]`)].join('\n');
}

export function renderUtpFoundationForPrompt(foundation: UtpFoundation): string {
  return [
    `UtpFoundation version: ${foundation.version}`,
    renderFoundationSection('Ниша', foundation.niche),
    renderFoundationSection('Аудитория', foundation.audience),
    renderFoundationSection('JTBD', foundation.jtbd),
    renderFoundationList('Боли', foundation.pains),
    renderFoundationSection('Желаемый результат', foundation.desiredOutcome),
    renderFoundationSection('Продукт', foundation.product),
    renderFoundationSection('Механизм', foundation.mechanism),
    renderFoundationSection('Отличие', foundation.differentiation),
    renderFoundationList('Доказательства', foundation.proofs),
    renderFoundationList('Ограничения', foundation.constraints),
  ].join('\n');
}

export const utpFoundationService = {
  async buildOwned(userId: string, projectId: string): Promise<{ foundation: UtpFoundation; projectName: string }> {
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
      include: {
        audienceAvatars: {
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
          take: MAX_AUDIENCE_OPTIONS,
        },
        jtbdSessions: {
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
          take: 8,
        },
        products: {
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
          take: 12,
        },
        castDevRecords: {
          where: { status: 'completed' },
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
          take: 4,
          select: { id: true, analysis: true },
        },
      },
    });
    if (!project) throw new UtpFoundationNotFoundError();

    const strategy = sanitizeProjectStrategyData(asRecord(project.strategyData));
    const answers = asRecord(strategy.answers);
    const positioning = asRecord(strategy.positioningData);
    const aboutSelection = firstRecord([
      { value: strategy.expertProfileData, path: 'strategy.expertProfileData' },
      { value: strategy.aboutExpert, path: 'strategy.aboutExpert' },
      { value: strategy.about, path: 'strategy.about' },
      { value: strategy.expertProfile, path: 'strategy.expertProfile' },
    ]);
    const about = aboutSelection.record;
    const aboutPath = aboutSelection.path;
    const generated = asRecord(strategy.generatedData);

    const nicheCandidate = firstCandidate([
      normalize(project.niche) ? { value: project.niche!, source: 'project.niche' } : null,
      fromField(about, aboutPath, ['niche', 'sphere', 'specialization', 'role']),
    ]);
    const niche = nicheCandidate
      ? readySection(nicheCandidate, '/app/strategy/about', SECTION_LIMITS.niche)
      : missingSection('/app/strategy/about');

    const explicitAudience = firstCandidate([
      fromField(answers, 'strategy.answers', ['chosenSegment', 'chosenSubsegment']),
      fromField(strategy, 'strategy', ['chosenSegment', 'chosenSubsegment']),
    ]);
    const generalAudience = firstCandidate([
      fromField(positioning, 'strategy.positioningData', ['audience', 'targetAudience']),
      fromField(about, aboutPath, ['targetAudience', 'audience', 'clients']),
    ]);
    const audienceSelection = selectAudience({
      explicit: explicitAudience,
      general: generalAudience,
      avatars: project.audienceAvatars,
    });

    const selectedAvatar = audienceSelection.avatarId
      ? project.audienceAvatars.find((avatar) => avatar.id === audienceSelection.avatarId) ?? null
      : null;
    const castDevPains = audienceSelection.section.status === 'ready'
      ? project.castDevRecords.flatMap((record) => {
        const analysis = asRecord(record.analysis);
        return listCandidates(analysis.fearsProblemsObjections, `castdev:${record.id}.analysis.fearsProblemsObjections`);
      })
      : [];
    const pains = readyList([
      ...listCandidates(answers.corePains, 'strategy.answers.corePains'),
      ...listCandidates(answers.painfulQuestions, 'strategy.answers.painfulQuestions'),
      ...(selectedAvatar ? listCandidates(selectedAvatar.pains, `audienceAvatar:${selectedAvatar.id}.pains`) : []),
      ...castDevPains,
    ], '/app/strategy/audience', 3);

    const linkedJtbdIds = new Set(
      project.products
        .filter((product) => audienceSelection.avatarId && product.audienceAvatarId === audienceSelection.avatarId)
        .map((product) => product.jtbdSessionId)
        .filter((value): value is string => Boolean(value)),
    );
    const linkedJtbd = project.jtbdSessions.filter((session) => linkedJtbdIds.has(session.id));
    const explicitJtbd = firstCandidate([
      fromField(answers, 'strategy.answers', ['chosenRequest', 'finalJob', 'jtbd']),
    ]);
    const selectedJtbd = linkedJtbd.length === 1
      ? linkedJtbd[0]
      : project.jtbdSessions.length === 1
        ? project.jtbdSessions[0]
        : null;
    const jtbdCandidate = explicitJtbd ?? (selectedJtbd
      ? firstCandidate([
        normalize(selectedJtbd.finalJob) ? { value: selectedJtbd.finalJob!, source: `jtbdSession:${selectedJtbd.id}.finalJob` } : null,
        normalize(selectedJtbd.summary) ? { value: selectedJtbd.summary!, source: `jtbdSession:${selectedJtbd.id}.summary` } : null,
      ])
      : null);
    const jtbdAmbiguous = !explicitJtbd && !selectedJtbd && project.jtbdSessions.length > 1;
    const jtbd = jtbdCandidate
      ? readySection(jtbdCandidate, '/app/strategy/audience', SECTION_LIMITS.jtbd)
      : missingSection('/app/strategy/audience', jtbdAmbiguous ? 'ambiguous' : 'not_provided');

    const castDevDesired = audienceSelection.section.status === 'ready'
      ? project.castDevRecords.flatMap((record) => {
        const analysis = asRecord(record.analysis);
        return listCandidates(analysis.desiresGoalsResults, `castdev:${record.id}.analysis.desiresGoalsResults`);
      })[0] ?? null
      : null;
    const avatarDesire = selectedAvatar
      ? listCandidates(selectedAvatar.desires, `audienceAvatar:${selectedAvatar.id}.desires`)[0] ?? null
      : null;
    const desiredCandidate = firstCandidate([
      fromField(answers, 'strategy.answers', ['finalResult', 'deepDesires', 'wants']),
      fromField(positioning, 'strategy.positioningData', ['result', 'desiredOutcome']),
      avatarDesire,
      castDevDesired,
    ]);
    const desiredOutcome = desiredCandidate
      ? readySection(desiredCandidate, '/app/strategy/audience', SECTION_LIMITS.desiredOutcome)
      : missingSection('/app/strategy/audience');

    const typeRank: Record<string, number> = { MAIN: 0, MINI: 1, FREE: 2 };
    const relevantProducts = project.products
      .filter((product) => !audienceSelection.avatarId || product.audienceAvatarId === audienceSelection.avatarId)
      .sort((a, b) => (typeRank[a.type] ?? 9) - (typeRank[b.type] ?? 9) || a.id.localeCompare(b.id));
    const selectedProduct = relevantProducts[0] ?? project.products
      .slice()
      .sort((a, b) => (typeRank[a.type] ?? 9) - (typeRank[b.type] ?? 9) || a.id.localeCompare(b.id))[0];
    const productCandidate = selectedProduct
      ? { value: productValue(selectedProduct), source: `product:${selectedProduct.id}` }
      : generatedProduct(generated);
    const product = productCandidate
      ? readySection(productCandidate, '/app/products/main', SECTION_LIMITS.product)
      : missingSection('/app/products/main');

    const mechanismCandidate = firstCandidate([
      fromField(positioning, 'strategy.positioningData', ['mechanism', 'uniqueApproach', 'approach', 'method']),
      fromField(strategy, 'strategy', ['mechanism', 'uniqueApproach', 'approach', 'method']),
      fromField(about, aboutPath, ['uniqueApproach', 'approach', 'method']),
    ]);
    const mechanism = mechanismCandidate
      ? readySection(mechanismCandidate, '/app/strategy/positioning', SECTION_LIMITS.mechanism)
      : missingSection('/app/strategy/positioning');

    const differentiationCandidate = firstCandidate([
      fromField(positioning, 'strategy.positioningData', ['differentiation', 'difference', 'uniqueValue']),
      fromField(strategy, 'strategy', ['differentiation', 'difference', 'uniqueValue']),
    ]);
    const differentiation = differentiationCandidate
      ? readySection(differentiationCandidate, '/app/strategy/positioning', SECTION_LIMITS.differentiation)
      : missingSection('/app/strategy/positioning');

    const readyCases = await caseStudyContextService.getReadyCasesForProject(userId, projectId);
    const proofs = readyList([
      ...readyCases.map((record) => ({
        value: `${record.title}: ${record.afterText}`,
        source: `caseStudy:${record.id}.afterText`,
      })),
      ...listCandidates(about.trustProofs, `${aboutPath}.trustProofs`),
      ...listCandidates(about.achievements, `${aboutPath}.achievements`),
      ...listCandidates(about.credentials, `${aboutPath}.credentials`),
      ...listCandidates(about.education, `${aboutPath}.education`),
      ...listCandidates(about.experienceYears, `${aboutPath}.experienceYears`),
    ], '/app/strategy/cases');

    const constraints = readyList([
      ...listCandidates(about.antiPreferences, `${aboutPath}.antiPreferences`),
      ...listCandidates(about.notFor, `${aboutPath}.notFor`),
      ...listCandidates(about.constraints, `${aboutPath}.constraints`),
      ...listCandidates(about.limitations, `${aboutPath}.limitations`),
    ], '/app/strategy/about');

    const foundation = utpFoundationSchema.parse({
      version: UTP_FOUNDATION_VERSION,
      projectId: project.id,
      niche,
      audience: audienceSelection.section,
      jtbd,
      pains,
      desiredOutcome,
      product,
      mechanism,
      differentiation,
      proofs,
      constraints,
    });

    return { foundation, projectName: project.name };
  },
};
