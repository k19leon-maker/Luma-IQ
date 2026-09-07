import { Prisma } from '@prisma/client';
import {
  ChatbotScenarioDefinitionV1,
  ChatbotScenarioValidationIssue,
  validateChatbotScenarioDefinition,
} from '../contracts/chatbot-scenario.contract';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { telegramRuntimeV2Service } from './telegram-runtime-v2.service';
import { telegramTestRecipientService } from './telegram-test-recipient.service';

export class TelegramScenarioError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, options: { status: number; code: string; details?: Record<string, unknown> }) {
    super(message);
    this.name = 'TelegramScenarioError';
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}

const versionSelect = {
  id: true,
  version: true,
  schemaVersion: true,
  definition: true,
  source: true,
  validationReport: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.BotScenarioVersionSelect;

function defaultDefinition(name: string, description?: string): ChatbotScenarioDefinitionV1 {
  return {
    schemaVersion: '1.0',
    name,
    ...(description ? { description } : {}),
    timezone: 'Europe/Moscow',
    entrypoints: [{ id: 'start', type: 'start', targetNodeId: 'welcome' }],
    variables: [],
    nodes: [
      {
        id: 'welcome',
        type: 'send_message',
        text: 'Здравствуйте! Это черновик первого сообщения.',
        parseMode: 'plain',
        disableWebPreview: false,
      },
      { id: 'end', type: 'end' },
    ],
    edges: [{ id: 'welcome_to_end', fromNodeId: 'welcome', toNodeId: 'end' }],
    goals: [],
    metadata: { locale: 'ru', source: 'manual' },
  };
}

function storedValidationReport(input: unknown): {
  valid: boolean;
  issues: ChatbotScenarioValidationIssue[];
  stats?: { nodeCount: number; edgeCount: number; maximumHorizonSeconds: number };
  definition?: ChatbotScenarioDefinitionV1;
} {
  const report = validateChatbotScenarioDefinition(input);
  return report;
}

async function validationForProject(userId: string, projectId: string, input: unknown) {
  const report = storedValidationReport(input);
  if (!report.valid || !report.definition) return report;

  const assetIds = [...new Set(report.definition.nodes
    .filter((node) => node.type === 'send_media')
    .map((node) => node.assetId))];
  if (assetIds.length === 0) return report;

  const assets = await prisma.botAsset.findMany({
    where: { id: { in: assetIds }, userId, projectId, deletedAt: null },
    select: { id: true },
  });
  const found = new Set(assets.map((asset) => asset.id));
  const issues = assetIds
    .filter((assetId) => !found.has(assetId))
    .map((assetId) => ({
      code: 'media.asset_unavailable',
      path: 'nodes',
      message: `Media asset is unavailable for this project: ${assetId}`,
    }));
  return issues.length > 0 ? { ...report, valid: false, issues: [...report.issues, ...issues] } : report;
}

function requireValidDefinition(report: Awaited<ReturnType<typeof validationForProject>>): ChatbotScenarioDefinitionV1 {
  if (!report.valid || !report.definition) {
    throw new TelegramScenarioError('Сценарий не прошёл проверку', {
      status: 422,
      code: 'TELEGRAM_SCENARIO_INVALID',
      details: { validation: { valid: false, issues: report.issues, stats: report.stats } },
    });
  }
  return report.definition;
}

function reportJson(report: Awaited<ReturnType<typeof validationForProject>>): Prisma.InputJsonValue {
  return {
    valid: report.valid,
    issues: report.issues,
    ...(report.stats ? { stats: report.stats } : {}),
  } as unknown as Prisma.InputJsonValue;
}

async function assertOwnedBot(userId: string, botId: string) {
  const bot = await prisma.telegramBot.findFirst({
    where: { id: botId, userId, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!bot) throw new TelegramScenarioError('Бот не найден', { status: 404, code: 'TELEGRAM_BOT_NOT_FOUND' });
  return bot;
}

async function assertOwnedProject(userId: string, projectId: string): Promise<void> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId, status: { not: 'ARCHIVED' } },
    select: { id: true },
  });
  if (!project) throw new TelegramScenarioError('Проект не найден', { status: 404, code: 'PROJECT_NOT_FOUND' });
}

async function ownedScenario(userId: string, botId: string, scenarioId: string) {
  const scenario = await prisma.botScenario.findFirst({
    where: { id: scenarioId, userId, botId, archivedAt: null },
    include: {
      draftVersion: { select: versionSelect },
      publishedVersion: { select: versionSelect },
    },
  });
  if (!scenario) {
    throw new TelegramScenarioError('Сценарий не найден', { status: 404, code: 'TELEGRAM_SCENARIO_NOT_FOUND' });
  }
  return scenario;
}

function triggerKeys(definition: ChatbotScenarioDefinitionV1): Set<string> {
  return new Set(definition.entrypoints.flatMap((entrypoint) => {
    if (entrypoint.type === 'manual') return [];
    if (entrypoint.type === 'start') return ['start'];
    if (entrypoint.type === 'start_parameter') return [`start_parameter:${entrypoint.value}`];
    const value = entrypoint.caseSensitive
      ? entrypoint.value
      : entrypoint.value.toLocaleLowerCase('ru-RU');
    return [`keyword:${entrypoint.match}:${entrypoint.caseSensitive ? 'case' : 'nocase'}:${value}`];
  }));
}

async function assertNoPublishedTriggerConflicts(
  userId: string,
  botId: string,
  scenarioId: string,
  definition: ChatbotScenarioDefinitionV1,
): Promise<void> {
  const keys = triggerKeys(definition);
  if (keys.size === 0) return;
  const others = await prisma.botScenario.findMany({
    where: {
      userId,
      botId,
      id: { not: scenarioId },
      status: 'PUBLISHED',
      archivedAt: null,
      publishedVersionId: { not: null },
    },
    select: { id: true, name: true, publishedVersion: { select: { definition: true } } },
  });
  const conflicts: Array<{ scenarioId: string; name: string; triggers: string[] }> = [];
  for (const other of others) {
    const report = validateChatbotScenarioDefinition(other.publishedVersion?.definition);
    if (!report.valid || !report.definition) continue;
    const overlap = [...triggerKeys(report.definition)].filter((key) => keys.has(key));
    if (overlap.length > 0) conflicts.push({ scenarioId: other.id, name: other.name, triggers: overlap });
  }
  if (conflicts.length > 0) {
    throw new TelegramScenarioError('Точки входа конфликтуют с опубликованным сценарием', {
      status: 409,
      code: 'TELEGRAM_SCENARIO_TRIGGER_CONFLICT',
      details: { conflicts },
    });
  }
}

function runtimeAllowsBot(botId: string): boolean {
  if (!env.TELEGRAM_RUNTIME_V2_ENABLED) return false;
  const values = env.TELEGRAM_RUNTIME_V2_ALLOWED_BOT_IDS
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return values.includes('*') || values.includes(botId);
}

function explicitConfirmation(confirmed: boolean): void {
  if (!confirmed) {
    throw new TelegramScenarioError('Требуется явное подтверждение действия', {
      status: 400,
      code: 'TELEGRAM_SCENARIO_CONFIRMATION_REQUIRED',
    });
  }
}

export const telegramScenarioService = {
  async list(userId: string, botId: string, projectId: string) {
    await Promise.all([assertOwnedBot(userId, botId), assertOwnedProject(userId, projectId)]);
    return prisma.botScenario.findMany({
      where: { userId, botId, projectId, archivedAt: null },
      select: {
        id: true,
        botId: true,
        projectId: true,
        name: true,
        description: true,
        status: true,
        draftVersionId: true,
        publishedVersionId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  },

  async create(userId: string, botId: string, input: {
    projectId: string;
    name: string;
    description?: string;
    definition?: unknown;
  }) {
    await Promise.all([assertOwnedBot(userId, botId), assertOwnedProject(userId, input.projectId)]);
    const report = await validationForProject(
      userId,
      input.projectId,
      input.definition ?? defaultDefinition(input.name, input.description),
    );
    const definition = requireValidDefinition(report);
    return prisma.$transaction(async (tx) => {
      const scenario = await tx.botScenario.create({
        data: {
          userId,
          botId,
          projectId: input.projectId,
          name: input.name,
          description: input.description,
          status: 'DRAFT',
        },
      });
      const version = await tx.botScenarioVersion.create({
        data: {
          scenarioId: scenario.id,
          createdByUserId: userId,
          version: 1,
          schemaVersion: definition.schemaVersion,
          definition: definition as Prisma.InputJsonValue,
          source: 'MANUAL',
          validationReport: reportJson(report),
        },
        select: versionSelect,
      });
      await tx.botScenario.update({ where: { id: scenario.id }, data: { draftVersionId: version.id } });
      return { ...scenario, draftVersionId: version.id, draftVersion: version, publishedVersion: null };
    });
  },

  async get(userId: string, botId: string, scenarioId: string) {
    const scenario = await ownedScenario(userId, botId, scenarioId);
    const versions = await prisma.botScenarioVersion.findMany({
      where: { scenarioId, scenario: { userId, botId, archivedAt: null } },
      select: versionSelect,
      orderBy: { version: 'desc' },
    });
    return { ...scenario, versions };
  },

  async updateMetadata(userId: string, botId: string, scenarioId: string, input: {
    name?: string;
    description?: string | null;
  }) {
    await ownedScenario(userId, botId, scenarioId);
    const updated = await prisma.botScenario.updateMany({
      where: { id: scenarioId, userId, botId, archivedAt: null },
      data: input,
    });
    if (updated.count !== 1) {
      throw new TelegramScenarioError('Сценарий изменился, обновите страницу', {
        status: 409,
        code: 'TELEGRAM_SCENARIO_CONFLICT',
      });
    }
    return ownedScenario(userId, botId, scenarioId);
  },

  async updateDraft(userId: string, botId: string, scenarioId: string, input: {
    expectedDraftVersionId: string;
    expectedUpdatedAt: Date;
    definition: unknown;
  }) {
    const scenario = await ownedScenario(userId, botId, scenarioId);
    const draft = scenario.draftVersion;
    if (!draft || draft.id !== input.expectedDraftVersionId) {
      throw new TelegramScenarioError('Черновик изменился, обновите страницу', {
        status: 409,
        code: 'TELEGRAM_SCENARIO_DRAFT_CONFLICT',
      });
    }
    if (draft.publishedAt || draft.id === scenario.publishedVersionId) {
      throw new TelegramScenarioError('Опубликованную версию нельзя изменять. Создайте новый черновик.', {
        status: 409,
        code: 'TELEGRAM_SCENARIO_NEW_VERSION_REQUIRED',
      });
    }
    const report = await validationForProject(userId, scenario.projectId, input.definition);
    const definition = requireValidDefinition(report);
    const updated = await prisma.botScenarioVersion.updateMany({
      where: {
        id: draft.id,
        scenarioId,
        publishedAt: null,
        updatedAt: input.expectedUpdatedAt,
        scenario: { userId, botId, archivedAt: null },
      },
      data: {
        schemaVersion: definition.schemaVersion,
        definition: definition as Prisma.InputJsonValue,
        validationReport: reportJson(report),
      },
    });
    if (updated.count !== 1) {
      throw new TelegramScenarioError('Черновик уже изменён в другой вкладке', {
        status: 409,
        code: 'TELEGRAM_SCENARIO_DRAFT_CONFLICT',
      });
    }
    return ownedScenario(userId, botId, scenarioId);
  },

  async createDraftVersion(userId: string, botId: string, scenarioId: string, input: {
    confirmed: boolean;
    sourceVersionId?: string;
  }) {
    explicitConfirmation(input.confirmed);
    const scenario = await ownedScenario(userId, botId, scenarioId);
    if (scenario.draftVersion && !scenario.draftVersion.publishedAt) {
      throw new TelegramScenarioError('У сценария уже есть рабочий черновик', {
        status: 409,
        code: 'TELEGRAM_SCENARIO_DRAFT_EXISTS',
      });
    }
    const sourceId = input.sourceVersionId ?? scenario.publishedVersionId ?? scenario.draftVersionId;
    if (!sourceId) throw new TelegramScenarioError('Исходная версия не найдена', { status: 409, code: 'TELEGRAM_SCENARIO_VERSION_REQUIRED' });
    const source = await prisma.botScenarioVersion.findFirst({
      where: { id: sourceId, scenarioId, scenario: { userId, botId, archivedAt: null } },
      select: versionSelect,
    });
    if (!source) throw new TelegramScenarioError('Версия не найдена', { status: 404, code: 'TELEGRAM_SCENARIO_VERSION_NOT_FOUND' });
    const latest = await prisma.botScenarioVersion.findFirst({
      where: { scenarioId, scenario: { userId, botId, archivedAt: null } },
      select: { version: true },
      orderBy: { version: 'desc' },
    });
    try {
      return await prisma.$transaction(async (tx) => {
        const version = await tx.botScenarioVersion.create({
          data: {
            scenarioId,
            createdByUserId: userId,
            version: (latest?.version ?? 0) + 1,
            schemaVersion: source.schemaVersion,
            definition: source.definition as Prisma.InputJsonValue,
            source: 'MANUAL',
            validationReport: source.validationReport as Prisma.InputJsonValue | undefined,
          },
          select: versionSelect,
        });
        const changed = await tx.botScenario.updateMany({
          where: { id: scenarioId, userId, botId, archivedAt: null, draftVersionId: scenario.draftVersionId },
          data: { draftVersionId: version.id },
        });
        if (changed.count !== 1) {
          throw new TelegramScenarioError('Сценарий изменился, обновите страницу', {
            status: 409,
            code: 'TELEGRAM_SCENARIO_CONFLICT',
          });
        }
        return version;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new TelegramScenarioError('Новая версия уже была создана', {
          status: 409,
          code: 'TELEGRAM_SCENARIO_VERSION_CONFLICT',
        });
      }
      throw error;
    }
  },

  async publish(userId: string, botId: string, scenarioId: string, input: {
    confirmed: boolean;
    expectedDraftVersionId: string;
  }) {
    explicitConfirmation(input.confirmed);
    const scenario = await ownedScenario(userId, botId, scenarioId);
    const draft = scenario.draftVersion;
    if (!draft || draft.id !== input.expectedDraftVersionId) {
      throw new TelegramScenarioError('Черновик изменился, обновите страницу', {
        status: 409,
        code: 'TELEGRAM_SCENARIO_DRAFT_CONFLICT',
      });
    }
    const report = await validationForProject(userId, scenario.projectId, draft.definition);
    const definition = requireValidDefinition(report);
    await assertNoPublishedTriggerConflicts(userId, botId, scenarioId, definition);
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      if (!draft.publishedAt) {
        const sealed = await tx.botScenarioVersion.updateMany({
          where: { id: draft.id, scenarioId, publishedAt: null },
          data: { publishedAt: now, validationReport: reportJson(report) },
        });
        if (sealed.count !== 1) {
          throw new TelegramScenarioError('Версия уже изменилась', {
            status: 409,
            code: 'TELEGRAM_SCENARIO_VERSION_CONFLICT',
          });
        }
      }
      const changed = await tx.botScenario.updateMany({
        where: { id: scenarioId, userId, botId, archivedAt: null, draftVersionId: draft.id },
        data: { publishedVersionId: draft.id, status: 'PUBLISHED' },
      });
      if (changed.count !== 1) {
        throw new TelegramScenarioError('Сценарий изменился, обновите страницу', {
          status: 409,
          code: 'TELEGRAM_SCENARIO_CONFLICT',
        });
      }
    });
    return ownedScenario(userId, botId, scenarioId);
  },

  async pause(userId: string, botId: string, scenarioId: string, confirmed: boolean) {
    explicitConfirmation(confirmed);
    await ownedScenario(userId, botId, scenarioId);
    const changed = await prisma.botScenario.updateMany({
      where: { id: scenarioId, userId, botId, archivedAt: null, status: 'PUBLISHED' },
      data: { status: 'PAUSED' },
    });
    if (changed.count !== 1) {
      throw new TelegramScenarioError('Опубликованный сценарий не найден', {
        status: 409,
        code: 'TELEGRAM_SCENARIO_NOT_PUBLISHED',
      });
    }
    return ownedScenario(userId, botId, scenarioId);
  },

  async rollback(userId: string, botId: string, scenarioId: string, input: {
    confirmed: boolean;
    versionId: string;
  }) {
    explicitConfirmation(input.confirmed);
    const scenario = await ownedScenario(userId, botId, scenarioId);
    const version = await prisma.botScenarioVersion.findFirst({
      where: {
        id: input.versionId,
        scenarioId,
        publishedAt: { not: null },
        scenario: { userId, botId, archivedAt: null },
      },
      select: versionSelect,
    });
    if (!version) {
      throw new TelegramScenarioError('Опубликованная версия не найдена', {
        status: 404,
        code: 'TELEGRAM_SCENARIO_VERSION_NOT_FOUND',
      });
    }
    const report = await validationForProject(userId, scenario.projectId, version.definition);
    const definition = requireValidDefinition(report);
    await assertNoPublishedTriggerConflicts(userId, botId, scenarioId, definition);
    const changed = await prisma.botScenario.updateMany({
      where: { id: scenarioId, userId, botId, archivedAt: null },
      data: { publishedVersionId: version.id, status: 'PUBLISHED' },
    });
    if (changed.count !== 1) {
      throw new TelegramScenarioError('Сценарий изменился, обновите страницу', {
        status: 409,
        code: 'TELEGRAM_SCENARIO_CONFLICT',
      });
    }
    return ownedScenario(userId, botId, scenarioId);
  },

  async archive(userId: string, botId: string, scenarioId: string, confirmed: boolean): Promise<void> {
    explicitConfirmation(confirmed);
    await ownedScenario(userId, botId, scenarioId);
    const active = await prisma.botScenarioEnrollment.count({
      where: { userId, botId, scenarioId, status: { in: ['ACTIVE', 'WAITING'] } },
    });
    if (active > 0) {
      throw new TelegramScenarioError('Сначала завершите активные запуски сценария', {
        status: 409,
        code: 'TELEGRAM_SCENARIO_HAS_ACTIVE_ENROLLMENTS',
        details: { activeEnrollments: active },
      });
    }
    const changed = await prisma.botScenario.updateMany({
      where: { id: scenarioId, userId, botId, archivedAt: null },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
    if (changed.count !== 1) throw new TelegramScenarioError('Сценарий не найден', { status: 404, code: 'TELEGRAM_SCENARIO_NOT_FOUND' });
  },

  async testRun(userId: string, botId: string, scenarioId: string, input: {
    confirmed: boolean;
    versionId?: string;
    entrypointId?: string;
  }) {
    explicitConfirmation(input.confirmed);
    const [bot, scenario, recipient] = await Promise.all([
      assertOwnedBot(userId, botId),
      ownedScenario(userId, botId, scenarioId),
      telegramTestRecipientService.getVerifiedRecipient(userId, botId),
    ]);
    if (bot.status !== 'ACTIVE') {
      throw new TelegramScenarioError('Webhook бота не подключён', { status: 409, code: 'TELEGRAM_BOT_WEBHOOK_REQUIRED' });
    }
    if (!runtimeAllowsBot(botId)) {
      throw new TelegramScenarioError('Runtime пока не включён для этого бота', {
        status: 409,
        code: 'TELEGRAM_RUNTIME_NOT_ENABLED_FOR_BOT',
      });
    }
    const versionId = input.versionId ?? scenario.draftVersionId ?? scenario.publishedVersionId;
    if (!versionId) throw new TelegramScenarioError('Версия для теста не найдена', { status: 409, code: 'TELEGRAM_SCENARIO_VERSION_REQUIRED' });
    const version = await prisma.botScenarioVersion.findFirst({
      where: { id: versionId, scenarioId, scenario: { userId, botId, archivedAt: null } },
      select: versionSelect,
    });
    if (!version) throw new TelegramScenarioError('Версия не найдена', { status: 404, code: 'TELEGRAM_SCENARIO_VERSION_NOT_FOUND' });
    const report = await validationForProject(userId, scenario.projectId, version.definition);
    const definition = requireValidDefinition(report);
    return telegramRuntimeV2Service.startTestRun({
      userId,
      botId,
      scenarioId,
      scenarioVersionId: version.id,
      subscriberId: recipient.id,
      definition,
      entrypointId: input.entrypointId,
    });
  },
};

export const telegramScenarioInternals = {
  defaultDefinition,
  triggerKeys,
  runtimeAllowsBot,
};
