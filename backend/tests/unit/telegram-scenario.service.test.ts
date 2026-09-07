import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  botFindFirst: vi.fn(),
  projectFindFirst: vi.fn(),
  scenarioFindFirst: vi.fn(),
  scenarioFindMany: vi.fn(),
  scenarioUpdateMany: vi.fn(),
  versionFindFirst: vi.fn(),
  versionUpdateMany: vi.fn(),
  assetFindMany: vi.fn(),
  getVerifiedRecipient: vi.fn(),
  startTestRun: vi.fn(),
}));

vi.mock('../../src/config/env', () => ({
  env: {
    TELEGRAM_RUNTIME_V2_ENABLED: true,
    TELEGRAM_RUNTIME_V2_ALLOWED_BOT_IDS: 'bot-a',
  },
}));

vi.mock('../../src/services/telegram-test-recipient.service', () => ({
  telegramTestRecipientService: { getVerifiedRecipient: mocks.getVerifiedRecipient },
}));

vi.mock('../../src/services/telegram-runtime-v2.service', () => ({
  telegramRuntimeV2Service: { startTestRun: mocks.startTestRun },
}));

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    telegramBot: { findFirst: mocks.botFindFirst },
    project: { findFirst: mocks.projectFindFirst },
    botScenario: {
      findFirst: mocks.scenarioFindFirst,
      findMany: mocks.scenarioFindMany,
      updateMany: mocks.scenarioUpdateMany,
    },
    botScenarioVersion: {
      findFirst: mocks.versionFindFirst,
      updateMany: mocks.versionUpdateMany,
    },
    botAsset: { findMany: mocks.assetFindMany },
  },
}));

import { TelegramScenarioError, telegramScenarioService } from '../../src/services/telegram-scenario.service';

const validDefinition = {
  schemaVersion: '1.0',
  name: 'Welcome',
  timezone: 'Europe/Moscow',
  entrypoints: [{ id: 'start', type: 'start', targetNodeId: 'welcome' }],
  variables: [],
  nodes: [
    { id: 'welcome', type: 'send_message', text: 'Привет!', parseMode: 'plain', disableWebPreview: false },
    { id: 'end', type: 'end' },
  ],
  edges: [{ id: 'to_end', fromNodeId: 'welcome', toNodeId: 'end' }],
  goals: [],
  metadata: { locale: 'ru', source: 'manual' },
};

function scenario(overrides: Record<string, unknown> = {}) {
  return {
    id: 'scenario-a',
    userId: 'user-a',
    botId: 'bot-a',
    projectId: 'project-a',
    draftVersionId: 'version-a',
    publishedVersionId: null,
    draftVersion: {
      id: 'version-a',
      definition: validDefinition,
      publishedAt: null,
      updatedAt: new Date('2026-09-07T10:00:00.000Z'),
    },
    publishedVersion: null,
    ...overrides,
  };
}

describe('telegramScenarioService safety', () => {
  beforeEach(() => vi.clearAllMocks());

  it('scopes scenario lists to owner, bot and project', async () => {
    mocks.botFindFirst.mockResolvedValue({ id: 'bot-a', status: 'ACTIVE' });
    mocks.projectFindFirst.mockResolvedValue({ id: 'project-a' });
    mocks.scenarioFindMany.mockResolvedValue([]);

    await telegramScenarioService.list('user-a', 'bot-a', 'project-a');

    expect(mocks.botFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'bot-a', userId: 'user-a', deletedAt: null },
    }));
    expect(mocks.projectFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'project-a', userId: 'user-a', status: { not: 'ARCHIVED' } },
    }));
    expect(mocks.scenarioFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-a', botId: 'bot-a', projectId: 'project-a', archivedAt: null },
    }));
  });

  it('never mutates a published version as a draft', async () => {
    mocks.scenarioFindFirst.mockResolvedValue(scenario({
      publishedVersionId: 'version-a',
      draftVersion: {
        id: 'version-a',
        definition: validDefinition,
        publishedAt: new Date('2026-09-07T10:05:00.000Z'),
        updatedAt: new Date('2026-09-07T10:00:00.000Z'),
      },
    }));

    await expect(telegramScenarioService.updateDraft('user-a', 'bot-a', 'scenario-a', {
      expectedDraftVersionId: 'version-a',
      expectedUpdatedAt: new Date('2026-09-07T10:00:00.000Z'),
      definition: validDefinition,
    })).rejects.toMatchObject<TelegramScenarioError>({ code: 'TELEGRAM_SCENARIO_NEW_VERSION_REQUIRED' });
    expect(mocks.versionUpdateMany).not.toHaveBeenCalled();
  });

  it('uses optimistic locking and owner scope when saving a draft', async () => {
    const current = scenario();
    mocks.scenarioFindFirst.mockResolvedValue(current);
    mocks.versionUpdateMany.mockResolvedValue({ count: 1 });

    await telegramScenarioService.updateDraft('user-a', 'bot-a', 'scenario-a', {
      expectedDraftVersionId: 'version-a',
      expectedUpdatedAt: current.draftVersion.updatedAt,
      definition: validDefinition,
    });

    expect(mocks.versionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'version-a',
        scenarioId: 'scenario-a',
        publishedAt: null,
        updatedAt: current.draftVersion.updatedAt,
        scenario: { userId: 'user-a', botId: 'bot-a', archivedAt: null },
      },
    }));
  });

  it('runs tests only for the server-confirmed owner recipient', async () => {
    mocks.botFindFirst.mockResolvedValue({ id: 'bot-a', status: 'ACTIVE' });
    mocks.scenarioFindFirst.mockResolvedValue(scenario());
    mocks.getVerifiedRecipient.mockResolvedValue({ id: 'subscriber-owner' });
    mocks.versionFindFirst.mockResolvedValue({ id: 'version-a', definition: validDefinition });
    mocks.startTestRun.mockResolvedValue({ enrollmentId: 'run-a' });

    await telegramScenarioService.testRun('user-a', 'bot-a', 'scenario-a', { confirmed: true });

    expect(mocks.getVerifiedRecipient).toHaveBeenCalledWith('user-a', 'bot-a');
    expect(mocks.startTestRun).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-a',
      botId: 'bot-a',
      scenarioId: 'scenario-a',
      subscriberId: 'subscriber-owner',
    }));
  });
});
