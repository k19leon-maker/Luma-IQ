import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.middleware';
import {
  caseListQuerySchema,
  caseParamsSchema,
  caseProjectParamsSchema,
  createCaseStudySchema,
  updateCaseStudySchema,
} from '../schemas/case-study.schema';
import {
  CaseStudyNotFoundError,
  CaseStudyValidationError,
  caseStudyService,
} from '../services/case-study.service';

function sendError(res: Response, error: unknown, fallback: string): void {
  if (error instanceof CaseStudyNotFoundError || error instanceof CaseStudyValidationError) {
    res.status(error.status).json({ error: error.message });
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
};
