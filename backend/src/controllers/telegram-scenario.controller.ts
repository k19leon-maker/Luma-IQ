import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.middleware';
import { TelegramRuntimeDataError } from '../services/telegram-runtime-v2.service';
import { TelegramScenarioError, telegramScenarioService } from '../services/telegram-scenario.service';
import {
  TelegramTestRecipientError,
  telegramTestRecipientService,
} from '../services/telegram-test-recipient.service';
import { safeTelegramErrorMessage } from '../services/telegram-secret.service';

const idsSchema = z.object({
  botId: z.string().uuid(),
  scenarioId: z.string().uuid().optional(),
});
const projectQuerySchema = z.object({ projectId: z.string().uuid() }).strict();
const createSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  definition: z.unknown().optional(),
}).strict();
const metadataSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
}).strict().refine((value) => value.name !== undefined || value.description !== undefined);
const draftSchema = z.object({
  expectedDraftVersionId: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  definition: z.custom<unknown>((value) => value !== undefined, 'Укажите структуру сценария'),
}).strict();
const createVersionSchema = z.object({
  confirmed: z.literal(true),
  sourceVersionId: z.string().uuid().optional(),
}).strict();
const publishSchema = z.object({
  confirmed: z.literal(true),
  expectedDraftVersionId: z.string().uuid(),
}).strict();
const confirmationSchema = z.object({ confirmed: z.literal(true) }).strict();
const rollbackSchema = confirmationSchema.extend({ versionId: z.string().uuid() }).strict();
const testRunSchema = confirmationSchema.extend({
  versionId: z.string().uuid().optional(),
  entrypointId: z.string().trim().min(1).max(64).optional(),
}).strict();

function fail(res: Response, error: unknown, fallback: string): void {
  if (error instanceof TelegramScenarioError || error instanceof TelegramTestRecipientError) {
    res.status(error.status).json({
      error: error.code,
      message: error.message,
      ...('details' in error && error.details ? { details: error.details } : {}),
    });
    return;
  }
  if (error instanceof TelegramRuntimeDataError) {
    res.status(409).json({ error: error.code, message: error.message });
    return;
  }
  console.error('[TelegramScenarios] request failed', { message: safeTelegramErrorMessage(error) });
  res.status(500).json({ error: 'TELEGRAM_SCENARIO_REQUEST_FAILED', message: fallback });
}

function ids(req: AuthRequest, res: Response, requireScenario = true) {
  const parsed = idsSchema.safeParse(req.params);
  if (!parsed.success || (requireScenario && !parsed.data.scenarioId)) {
    res.status(400).json({ error: 'INVALID_TELEGRAM_SCENARIO_ID' });
    return null;
  }
  return parsed.data;
}

function invalid(res: Response, error = 'INVALID_TELEGRAM_SCENARIO_INPUT'): void {
  res.status(400).json({ error });
}

export const telegramScenarioController = {
  async list(req: AuthRequest, res: Response): Promise<void> {
    const params = ids(req, res, false);
    const query = projectQuerySchema.safeParse(req.query);
    if (!params || !query.success) return invalid(res);
    try {
      const scenarios = await telegramScenarioService.list(req.userId!, params.botId, query.data.projectId);
      res.json({ scenarios });
    } catch (error) {
      fail(res, error, 'Не удалось загрузить сценарии');
    }
  },

  async create(req: AuthRequest, res: Response): Promise<void> {
    const params = ids(req, res, false);
    const body = createSchema.safeParse(req.body);
    if (!params || !body.success) return invalid(res);
    try {
      const scenario = await telegramScenarioService.create(req.userId!, params.botId, body.data);
      res.status(201).json({ scenario });
    } catch (error) {
      fail(res, error, 'Не удалось создать сценарий');
    }
  },

  async get(req: AuthRequest, res: Response): Promise<void> {
    const params = ids(req, res);
    if (!params?.scenarioId) return;
    try {
      const scenario = await telegramScenarioService.get(req.userId!, params.botId, params.scenarioId);
      res.json({ scenario });
    } catch (error) {
      fail(res, error, 'Не удалось загрузить сценарий');
    }
  },

  async updateMetadata(req: AuthRequest, res: Response): Promise<void> {
    const params = ids(req, res);
    const body = metadataSchema.safeParse(req.body);
    if (!params?.scenarioId || !body.success) return invalid(res);
    try {
      const scenario = await telegramScenarioService.updateMetadata(req.userId!, params.botId, params.scenarioId, body.data);
      res.json({ scenario });
    } catch (error) {
      fail(res, error, 'Не удалось обновить сценарий');
    }
  },

  async updateDraft(req: AuthRequest, res: Response): Promise<void> {
    const params = ids(req, res);
    const body = draftSchema.safeParse(req.body);
    if (!params?.scenarioId || !body.success) return invalid(res);
    try {
      const scenario = await telegramScenarioService.updateDraft(req.userId!, params.botId, params.scenarioId, {
        expectedDraftVersionId: body.data.expectedDraftVersionId,
        expectedUpdatedAt: new Date(body.data.expectedUpdatedAt),
        definition: body.data.definition,
      });
      res.json({ scenario });
    } catch (error) {
      fail(res, error, 'Не удалось сохранить черновик');
    }
  },

  async createDraftVersion(req: AuthRequest, res: Response): Promise<void> {
    const params = ids(req, res);
    const body = createVersionSchema.safeParse(req.body);
    if (!params?.scenarioId || !body.success) return invalid(res, 'TELEGRAM_SCENARIO_CONFIRMATION_REQUIRED');
    try {
      const version = await telegramScenarioService.createDraftVersion(req.userId!, params.botId, params.scenarioId, body.data);
      res.status(201).json({ version });
    } catch (error) {
      fail(res, error, 'Не удалось создать новую версию');
    }
  },

  async publish(req: AuthRequest, res: Response): Promise<void> {
    const params = ids(req, res);
    const body = publishSchema.safeParse(req.body);
    if (!params?.scenarioId || !body.success) return invalid(res, 'TELEGRAM_SCENARIO_CONFIRMATION_REQUIRED');
    try {
      const scenario = await telegramScenarioService.publish(req.userId!, params.botId, params.scenarioId, body.data);
      res.json({ scenario });
    } catch (error) {
      fail(res, error, 'Не удалось опубликовать сценарий');
    }
  },

  async pause(req: AuthRequest, res: Response): Promise<void> {
    const params = ids(req, res);
    const body = confirmationSchema.safeParse(req.body);
    if (!params?.scenarioId || !body.success) return invalid(res, 'TELEGRAM_SCENARIO_CONFIRMATION_REQUIRED');
    try {
      const scenario = await telegramScenarioService.pause(req.userId!, params.botId, params.scenarioId, body.data.confirmed);
      res.json({ scenario });
    } catch (error) {
      fail(res, error, 'Не удалось приостановить сценарий');
    }
  },

  async rollback(req: AuthRequest, res: Response): Promise<void> {
    const params = ids(req, res);
    const body = rollbackSchema.safeParse(req.body);
    if (!params?.scenarioId || !body.success) return invalid(res, 'TELEGRAM_SCENARIO_CONFIRMATION_REQUIRED');
    try {
      const scenario = await telegramScenarioService.rollback(req.userId!, params.botId, params.scenarioId, body.data);
      res.json({ scenario });
    } catch (error) {
      fail(res, error, 'Не удалось откатить сценарий');
    }
  },

  async archive(req: AuthRequest, res: Response): Promise<void> {
    const params = ids(req, res);
    const body = confirmationSchema.safeParse(req.body);
    if (!params?.scenarioId || !body.success) return invalid(res, 'TELEGRAM_SCENARIO_CONFIRMATION_REQUIRED');
    try {
      await telegramScenarioService.archive(req.userId!, params.botId, params.scenarioId, body.data.confirmed);
      res.status(204).send();
    } catch (error) {
      fail(res, error, 'Не удалось архивировать сценарий');
    }
  },

  async testRun(req: AuthRequest, res: Response): Promise<void> {
    const params = ids(req, res);
    const body = testRunSchema.safeParse(req.body);
    if (!params?.scenarioId || !body.success) return invalid(res, 'TELEGRAM_SCENARIO_CONFIRMATION_REQUIRED');
    try {
      const run = await telegramScenarioService.testRun(req.userId!, params.botId, params.scenarioId, body.data);
      res.status(202).json({ run });
    } catch (error) {
      fail(res, error, 'Не удалось запустить тест сценария');
    }
  },

  async createTestRecipientVerification(req: AuthRequest, res: Response): Promise<void> {
    const params = ids(req, res, false);
    if (!params) return;
    try {
      const verification = await telegramTestRecipientService.createVerification(req.userId!, params.botId);
      res.status(201).json({ verification });
    } catch (error) {
      fail(res, error, 'Не удалось создать ссылку подтверждения');
    }
  },

  async testRecipientStatus(req: AuthRequest, res: Response): Promise<void> {
    const params = ids(req, res, false);
    if (!params) return;
    try {
      const recipient = await telegramTestRecipientService.status(req.userId!, params.botId);
      res.json({ recipient });
    } catch (error) {
      fail(res, error, 'Не удалось проверить Telegram-получателя');
    }
  },
};
