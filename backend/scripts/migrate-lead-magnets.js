/* eslint-disable no-console */
require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const APPLY = process.argv.includes('--apply');
const SESSION_GAP_MS = 30 * 60 * 1000;

const STEPS = {
  'video-lesson': ['concept', 'hook', 'script', 'practice', 'cta'],
  'pdf-guide': ['concept', 'structure', 'content', 'checklist', 'cta'],
  'sales-longread': [
    'headline', 'subheadline', 'leadText', 'articleMap', 'expertIntro',
    'misunderstanding', 'problemCause', 'triedSolutions', 'failedSolutions',
    'bigShift', 'methodModel', 'methodDemo', 'usefulConclusion', 'articleLimits',
    'nextStepBridge', 'nextStepSale', 'firstCta', 'objections', 'extraFormat',
    'urgency', 'finalSummary', 'finalPs', 'finalCta',
  ],
};

const LABELS = {
  'video-lesson': 'Видеоурок',
  'pdf-guide': 'PDF-гайд',
  'sales-longread': 'Продающий лонгрид',
};

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function formatFromText(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('видео')) return 'video-lesson';
  if (text.includes('pdf') || text.includes('гайд')) return 'pdf-guide';
  return 'sales-longread';
}

function artifactFormat(artifact) {
  const structured = record(artifact.structured);
  const inputs = record(structured.inputs);
  if (inputs.format) return formatFromText(inputs.format);
  if (STEPS['sales-longread'].includes(artifact.step)) return 'sales-longread';
  if (['structure', 'content', 'checklist'].includes(artifact.step)) return 'pdf-guide';
  return 'video-lesson';
}

function titleFromContent(content, fallback) {
  const lines = String(content || '')
    .replace(/```(?:json|markdown|md)?/gi, '')
    .split('\n')
    .map((line) => line.replace(/^#{1,6}\s+/, '').replace(/[*_`>]/g, '').trim())
    .filter(Boolean);
  const candidate = lines.find((line) => !/^(формат|лид-магнит|тема и обещание)$/i.test(line));
  return (candidate || fallback).replace(/^[-–—]\s*/, '').slice(0, 100);
}

function normalizeLegacy(value, projectUpdatedAt) {
  const legacy = record(value);
  if (!Object.keys(legacy).length) return null;
  const format = legacy.selectedFormat || formatFromText(legacy.format || legacy.description);
  const now = new Date(projectUpdatedAt || Date.now()).toISOString();
  return {
    ...legacy,
    id: legacy.id || `lead-magnet-legacy-${legacy.artifactId || now.replace(/\D/g, '')}`,
    createdAt: legacy.createdAt || now,
    updatedAt: legacy.updatedAt || now,
    generationStatus: legacy.generationStatus || (legacy.generated ? 'ready' : 'draft'),
    selectedFormat: format,
    format: legacy.format || LABELS[format],
    chatMessages: Array.isArray(legacy.chatMessages)
      ? legacy.chatMessages
      : legacy.description
        ? [{ role: 'assistant', content: legacy.description, stepTitle: LABELS[format] }]
        : [],
    stepStatuses: record(legacy.stepStatuses),
  };
}

function groupArtifacts(artifacts) {
  const groups = [];
  for (const artifact of artifacts) {
    const format = artifactFormat(artifact);
    const last = groups[groups.length - 1];
    const gap = last ? new Date(artifact.createdAt).getTime() - new Date(last.updatedAt).getTime() : Infinity;
    const stepRepeated = last?.steps.has(artifact.step);
    if (!last || last.format !== format || gap > SESSION_GAP_MS || stepRepeated) {
      groups.push({
        format,
        artifacts: [artifact],
        steps: new Set([artifact.step]),
        createdAt: artifact.createdAt,
        updatedAt: artifact.updatedAt,
      });
    } else {
      last.artifacts.push(artifact);
      last.steps.add(artifact.step);
      last.updatedAt = artifact.updatedAt;
    }
  }
  return groups;
}

function fromArtifactGroup(group) {
  const first = group.artifacts[0];
  const last = group.artifacts[group.artifacts.length - 1];
  const expectedSteps = STEPS[group.format];
  const complete = expectedSteps.every((step) => group.steps.has(step));
  const chatMessages = group.artifacts.map((artifact) => ({
    role: 'assistant',
    content: artifact.content,
    stepId: artifact.step,
    stepTitle: artifact.title || artifact.step,
  }));
  const description = [
    '# Лид-магнит',
    `## Формат\n${LABELS[group.format]}`,
    ...chatMessages.map((message) => message.content),
  ].join('\n\n');
  return {
    id: `lead-magnet-recovered-${first.id}`,
    name: titleFromContent(first.content, LABELS[group.format]),
    price: 'Бесплатно',
    format: LABELS[group.format],
    duration: '',
    description,
    currentMarkdown: description,
    generated: true,
    selectedFormat: group.format,
    chatMessages,
    stepStatuses: Object.fromEntries(expectedSteps.map((step) => [step, group.steps.has(step) ? 'done' : 'idle'])),
    generationStatus: complete ? 'ready' : 'draft',
    workflowRunId: last.workflowRunId || undefined,
    workflowStepId: last.workflowStepId || undefined,
    artifactId: last.id,
    generationId: last.generationId || undefined,
    createdAt: new Date(group.createdAt).toISOString(),
    updatedAt: new Date(group.updatedAt).toISOString(),
    recoveredArtifactIds: group.artifacts.map((artifact) => artifact.id),
  };
}

function fromMaterial(material, projectUpdatedAt) {
  const content = String(material.content || '');
  if (!content.trim()) return null;
  const format = formatFromText(content);
  const updatedAt = material.updatedAt || new Date(projectUpdatedAt || Date.now()).toISOString();
  return {
    id: `lead-magnet-material-${material.id || updatedAt.replace(/\D/g, '')}`,
    name: material.title && material.title !== 'Лид-магнит'
      ? material.title
      : titleFromContent(content, LABELS[format]),
    price: 'Бесплатно',
    format: LABELS[format],
    duration: '',
    description: content,
    currentMarkdown: content,
    generated: true,
    selectedFormat: format,
    chatMessages: [{ role: 'assistant', content, stepTitle: material.title || LABELS[format] }],
    stepStatuses: Object.fromEntries(STEPS[format].map((step) => [step, 'done'])),
    generationStatus: 'ready',
    createdAt: updatedAt,
    updatedAt,
  };
}

function isDuplicate(items, candidate) {
  const recoveredIds = new Set(candidate.recoveredArtifactIds || []);
  return items.some((item) => {
    if (item.id === candidate.id) return true;
    if (item.artifactId && recoveredIds.has(item.artifactId)) return true;
    if (candidate.artifactId && item.artifactId === candidate.artifactId) return true;
    if (item.generationId && candidate.generationId && item.generationId === candidate.generationId) return true;
    return item.currentMarkdown && candidate.currentMarkdown && item.currentMarkdown === candidate.currentMarkdown;
  });
}

function isCreatedLeadMagnet(item) {
  return Boolean(
    item
    && (
      item.generated
      || String(item.currentMarkdown || '').trim()
      || (Array.isArray(item.chatMessages) && item.chatMessages.length)
    )
  );
}

async function main() {
  const projects = await prisma.project.findMany({
    select: {
      id: true,
      userId: true,
      name: true,
      updatedAt: true,
      strategyData: true,
      aiArtifacts: {
        where: { workflow: 'leadmagnet' },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          userId: true,
          step: true,
          title: true,
          content: true,
          structured: true,
          workflowRunId: true,
          workflowStepId: true,
          generationId: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  const report = [];
  for (const project of projects) {
    const strategy = record(project.strategyData);
    const generated = record(strategy.generatedData);
    const existing = Array.isArray(generated.leadMagnets)
      ? generated.leadMagnets.filter(isCreatedLeadMagnet)
      : [];
    const rawLegacy = record(generated.leadMagnet);
    const legacy = isCreatedLeadMagnet(rawLegacy) ? normalizeLegacy(rawLegacy, project.updatedAt) : null;
    if (legacy && !isDuplicate(existing, legacy)) existing.push(legacy);

    const ownedArtifacts = project.aiArtifacts.filter((artifact) => artifact.userId === project.userId);
    for (const group of groupArtifacts(ownedArtifacts)) {
      const candidate = fromArtifactGroup(group);
      if (!isDuplicate(existing, candidate)) existing.push(candidate);
    }

    if (!existing.length) {
      const materials = Array.isArray(strategy.materialsData)
        ? strategy.materialsData.filter((item) => record(item).kind === 'lead-magnet')
        : [];
      for (const material of materials) {
        const candidate = fromMaterial(record(material), project.updatedAt);
        if (candidate && !isDuplicate(existing, candidate)) existing.push(candidate);
      }
    }

    existing.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    const previousCount = Array.isArray(generated.leadMagnets) ? generated.leadMagnets.length : 0;
    if (existing.length === previousCount) continue;

    report.push({ projectId: project.id, project: project.name, before: previousCount, after: existing.length });
    if (APPLY) {
      await prisma.project.update({
        where: { id: project.id },
        data: {
          strategyData: {
            ...strategy,
            generatedData: { ...generated, leadMagnets: existing },
          },
        },
      });
    }
  }

  console.log(JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', projects: report }, null, 2));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
