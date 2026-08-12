import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.middleware';
import {
  caseListQuerySchema,
  caseParamsSchema,
  caseProjectParamsSchema,
  batchCreateCasesSchema,
  createCaseStudySchema,
  extractCasesSchema,
  generateCaseInsightsSchema,
  updateCaseStudySchema,
} from '../schemas/case-study.schema';
import {
  CaseStudyNotFoundError,
  CaseStudyValidationError,
  caseStudyService,
} from '../services/case-study.service';
import { caseStudyAiService } from '../services/case-study-ai.service';

function sendError(res: Response, error: unknown, fallback: string): void {
  if (error instanceof CaseStudyNotFoundError || error instanceof CaseStudyValidationError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  const details = error && typeof error === 'object' ? error as {
    status?: unknown;
    code?: unknown;
    message?: unknown;
  } : {};
  const status = typeof details.status === 'number' ? details.status : 500;
  const code = typeof details.code === 'string' ? details.code : undefined;
  const message = typeof details.message === 'string' ? details.message : '';
  if (status === 402 || code === 'AI_BALANCE_EXHAUSTED' || message === 'AI-баланс закончился') {
    res.status(402).json({
      error: 'Недостаточно AI-баллов для этого действия. Запрос к AI не запускался, баллы не списаны.',
      code: 'AI_BALANCE_EXHAUSTED',
    });
    return;
  }
  if (status === 409) {
    res.status(409).json({ error: message || 'Это действие уже выполняется' });
    return;
  }
  console.error('[CaseStudies]', error);
  res.status(500).json({ error: fallback });
}

function firstIssue(error: unknown): string {
  if (!error || typeof error !== 'object' || !('errors' in error)) return 'Проверьте данные';
  const errors = (error as { errors?: Array<{ message?: string }> }).errors;
  return errors?.[0]?.message ?? 'Проверьте данные';
}

export const caseStudyController = {
  async list(req: AuthRequest, res: Response): Promise<void> {
    const params = caseProjectParamsSchema.safeParse(req.params);
    const query = caseListQuerySchema.safeParse(req.query);
    if (!params.success || !query.success) {
      res.status(400).json({ error: !params.success ? firstIssue(params.error) : firstIssue(query.error) });
      return;
    }
    try {
      const cases = await caseStudyService.list(req.userId!, params.data.projectId, query.data.status);
      res.json({ cases });
    } catch (error) {
      sendError(res, error, 'Не удалось загрузить кейсы');
    }
  },

  async get(req: AuthRequest, res: Response): Promise<void> {
    const params = caseParamsSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: firstIssue(params.error) });
      return;
    }
    try {
      const caseStudy = await caseStudyService.get(req.userId!, params.data.projectId, params.data.caseId);
      res.json({ case: caseStudy });
    } catch (error) {
      sendError(res, error, 'Не удалось загрузить кейс');
    }
  },

  async create(req: AuthRequest, res: Response): Promise<void> {
    const params = caseProjectParamsSchema.safeParse(req.params);
    const body = createCaseStudySchema.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: !params.success ? firstIssue(params.error) : firstIssue(body.error) });
      return;
    }
    try {
      const caseStudy = await caseStudyService.create(req.userId!, params.data.projectId, body.data);
      res.status(201).json({ case: caseStudy });
    } catch (error) {
      sendError(res, error, 'Не удалось создать кейс');
    }
  },

  async update(req: AuthRequest, res: Response): Promise<void> {
    const params = caseParamsSchema.safeParse(req.params);
    const body = updateCaseStudySchema.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: !params.success ? firstIssue(params.error) : firstIssue(body.error) });
      return;
    }
    try {
      const caseStudy = await caseStudyService.update(
        req.userId!,
        params.data.projectId,
        params.data.caseId,
        body.data,
      );
      res.json({ case: caseStudy });
    } catch (error) {
      sendError(res, error, 'Не удалось сохранить кейс');
    }
  },

  async remove(req: AuthRequest, res: Response): Promise<void> {
    const params = caseParamsSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: firstIssue(params.error) });
      return;
    }
    try {
      await caseStudyService.remove(req.userId!, params.data.projectId, params.data.caseId);
      res.json({ ok: true });
    } catch (error) {
      sendError(res, error, 'Не удалось удалить кейс');
    }
  },

  async extract(req: AuthRequest, res: Response): Promise<void> {
    const params = caseProjectParamsSchema.safeParse(req.params);
    const body = extractCasesSchema.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: !params.success ? firstIssue(params.error) : firstIssue(body.error) });
      return;
    }
    try {
      const result = await caseStudyAiService.extract({
        userId: req.userId!,
        projectId: params.data.projectId,
        ...body.data,
        idempotencyKey: body.data.idempotencyKey
          ?? req.header('idempotency-key')
          ?? req.header('x-idempotency-key')
          ?? undefined,
      });
      res.json(result);
    } catch (error) {
      sendError(res, error, 'Не удалось собрать кейсы');
    }
  },

  async createBatch(req: AuthRequest, res: Response): Promise<void> {
    const params = caseProjectParamsSchema.safeParse(req.params);
    const body = batchCreateCasesSchema.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: !params.success ? firstIssue(params.error) : firstIssue(body.error) });
      return;
    }
    try {
      const result = await caseStudyService.createBatch(req.userId!, params.data.projectId, body.data);
      res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) {
      sendError(res, error, 'Не удалось создать черновики');
    }
  },

  async generateInsights(req: AuthRequest, res: Response): Promise<void> {
    const params = caseParamsSchema.safeParse(req.params);
    const body = generateCaseInsightsSchema.safeParse(req.body ?? {});
    if (!params.success || !body.success) {
      res.status(400).json({ error: !params.success ? firstIssue(params.error) : firstIssue(body.error) });
      return;
    }
    try {
      const result = await caseStudyAiService.generateInsights({
        userId: req.userId!,
        projectId: params.data.projectId,
        caseId: params.data.caseId,
        idempotencyKey: body.data.idempotencyKey
          ?? req.header('idempotency-key')
          ?? req.header('x-idempotency-key')
          ?? undefined,
      });
      res.json(result);
    } catch (error) {
      sendError(res, error, 'Не удалось обновить маркетинговые тезисы');
    }
  },
};
