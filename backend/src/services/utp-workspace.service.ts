import { Prisma } from '@prisma/client';
import {
  resolvePersistedUtp,
  SaveUtpWorkspaceInput,
  UTP_WORKSPACE_VERSION,
  UtpHistoryEntry,
  UtpWorkspaceState,
  utpHistoryEntrySchema,
} from '../contracts/utp-workspace.contract';
import { prisma } from '../lib/prisma';
import { sanitizeProjectStrategyData } from '../utils/demo-products';

const UTP_MATERIAL_LINKS = [
  'expert-profile.md',
  'positioning.md',
  'audience.md',
  'social.md',
  'product-main.md',
  'product-mini.md',
  'lead-magnet.md',
];

type JsonRecord = Record<string, unknown>;

export class UtpWorkspaceNotFoundError extends Error {
  constructor() {
    super('Проект не найден');
    this.name = 'UtpWorkspaceNotFoundError';
  }
}

export class UtpWorkspaceConflictError extends Error {
  constructor() {
    super('УТП было изменено в другой вкладке или запросе');
    this.name = 'UtpWorkspaceConflictError';
  }
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function finiteRevision(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

function validIso(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : fallback;
}

function normalizeHistory(value: unknown, fallbackAt: string): UtpHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    const parsed = utpHistoryEntrySchema.safeParse(entry);
    if (parsed.success) return [parsed.data];

    const record = asRecord(entry);
    const text = typeof record.value === 'string' ? record.value : '';
    if (!text) return [];
    const source: UtpHistoryEntry['source'] = record.source === 'ai' || record.source === 'restore'
      ? record.source
      : 'manual';
    return [{
      id: typeof record.id === 'string' && record.id.trim() ? record.id : `legacy-${index}`,
      title: typeof record.title === 'string' && record.title.trim() ? record.title : 'Сохранённая версия',
      createdAt: validIso(record.createdAt, fallbackAt),
      source,
      value: text.slice(0, 10_000),
    }];
  }).slice(0, 20);
}

function materialContent(text: string): string {
  return text.trim() ? `# УТП\n\n${text}` : '# УТП';
}

function materialSummary(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 1200);
}

export function mergeUtpWorkspaceStrategyData(input: {
  strategyData: unknown;
  payload: SaveUtpWorkspaceInput;
  savedAt: string;
  nextRevision: number;
}): JsonRecord {
  const strategy = sanitizeProjectStrategyData(asRecord(input.strategyData));
  const generated = asRecord(strategy.generatedData);
  const materials = Array.isArray(strategy.materialsData) ? [...strategy.materialsData] : [];
  const existingIndex = materials.findIndex((item) => {
    const record = asRecord(item);
    return record.id === 'utp.md' || record.kind === 'utp';
  });
  const existingMaterial = existingIndex >= 0 ? asRecord(materials[existingIndex]) : {};
  const utpMaterial = {
    ...existingMaterial,
    id: 'utp.md',
    kind: 'utp',
    title: 'utp.md',
    content: materialContent(input.payload.text),
    summary: materialSummary(input.payload.text),
    summaryStatus: 'fresh',
    linkedMaterialIds: Array.isArray(existingMaterial.linkedMaterialIds)
      ? existingMaterial.linkedMaterialIds
      : UTP_MATERIAL_LINKS,
    versions: Array.isArray(existingMaterial.versions) ? existingMaterial.versions : [],
    updatedAt: input.savedAt,
  };
  if (existingIndex >= 0) materials[existingIndex] = utpMaterial;
  else materials.unshift(utpMaterial);

  const nextGenerated: JsonRecord = {
    ...generated,
    utp: input.payload.text,
    utpHistory: input.payload.history,
    utpWorkspaceRevision: input.nextRevision,
    utpSavedAt: input.savedAt,
  };
  if (input.payload.meta) nextGenerated.utpMeta = input.payload.meta;
  else delete nextGenerated.utpMeta;

  return sanitizeProjectStrategyData({
    ...strategy,
    generatedData: nextGenerated,
    materialsData: materials,
  });
}

function stateFromProject(project: {
  id: string;
  strategyData: unknown;
  utpData: unknown;
  updatedAt: Date;
}): UtpWorkspaceState {
  const fallbackAt = project.updatedAt.toISOString();
  const resolved = resolvePersistedUtp({ strategyData: project.strategyData, utpData: project.utpData });
  const strategy = asRecord(project.strategyData);
  const generated = asRecord(strategy.generatedData);
  return {
    version: UTP_WORKSPACE_VERSION,
    projectId: project.id,
    text: resolved.text,
    history: normalizeHistory(resolved.history, fallbackAt),
    meta: resolved.meta,
    source: resolved.source,
    revision: finiteRevision(generated.utpWorkspaceRevision),
    savedAt: validIso(generated.utpSavedAt, fallbackAt),
  };
}

function isSerializableConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}

export const utpWorkspaceService = {
  async getOwned(userId: string, projectId: string): Promise<UtpWorkspaceState> {
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
      select: { id: true, strategyData: true, utpData: true, updatedAt: true },
    });
    if (!project) throw new UtpWorkspaceNotFoundError();
    return stateFromProject(project);
  },

  async saveOwned(userId: string, projectId: string, payload: SaveUtpWorkspaceInput): Promise<UtpWorkspaceState> {
    try {
      return await prisma.$transaction(async (tx) => {
        const project = await tx.project.findFirst({
          where: { id: projectId, userId },
          select: { id: true, strategyData: true, utpData: true, updatedAt: true },
        });
        if (!project) throw new UtpWorkspaceNotFoundError();

        const generated = asRecord(asRecord(project.strategyData).generatedData);
        const currentRevision = finiteRevision(generated.utpWorkspaceRevision);
        if (currentRevision !== payload.expectedRevision) throw new UtpWorkspaceConflictError();

        const savedAt = new Date().toISOString();
        const nextRevision = currentRevision + 1;
        const strategyData = mergeUtpWorkspaceStrategyData({
          strategyData: project.strategyData,
          payload,
          savedAt,
          nextRevision,
        });

        const updated = await tx.project.update({
          where: { id: projectId },
          data: { strategyData: strategyData as Prisma.InputJsonValue },
          select: { id: true, strategyData: true, utpData: true, updatedAt: true },
        });
        return stateFromProject(updated);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (isSerializableConflict(error)) throw new UtpWorkspaceConflictError();
      throw error;
    }
  },
};
