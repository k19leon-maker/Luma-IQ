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
import { caseStudyOcrService } from '../services/case-study-ocr.service';
import {
  assertScreenshotBatch,
  assertScannedPdf,
  CaseStudyImportError,
  downloadGoogleCaseDocument,
  extractCaseDocumentText,
} from '../services/case-study-import.service';
import * as fs from 'fs';
import { caseStudyImportRecordService } from '../services/case-study-import-record.service';

function sendError(res: Response, error: unknown, fallback: string): void {
  if (error instanceof CaseStudyNotFoundError || error instanceof CaseStudyValidationError || error instanceof CaseStudyImportError) {
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
  if ([400, 413, 422, 429, 502, 503].includes(status)) {
    res.status(status).json({ error: message || fallback, ...(code ? { code } : {}) });
    return;
  }
  console.error('[CaseStudies]', error);
  res.status(500).json({ error: fallback });
}

function cleanup(files: Express.Multer.File[]) {
  for (const file of files) {
    if (!file.path) continue;
    fs.promises.unlink(file.path).catch(() => undefined);
  }
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
      const imported = body.data.importId
        ? await caseStudyImportRecordService.get({
          userId: req.userId!, projectId: params.data.projectId, importId: body.data.importId,
        })
        : null;
      const sourceText = body.data.sourceText?.trim() || imported?.sourceText;
      if (!sourceText) {
        res.status(400).json({ error: 'Добавьте текст или импортированный материал' });
        return;
      }
      const result = await caseStudyAiService.extract({
        userId: req.userId!,
        projectId: params.data.projectId,
        sourceText,
        sourceType: imported?.sourceType === 'screenshot' ? 'screenshot' : body.data.sourceType,
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

  async importDocument(req: AuthRequest, res: Response): Promise<void> {
    const params = caseProjectParamsSchema.safeParse(req.params);
    const file = req.file;
    if (!params.success || !file) {
      res.status(400).json({ error: !params.success ? firstIssue(params.error) : 'Документ не загружен' });
      return;
    }
    try {
      await caseStudyService.assertOwnedProject(req.userId!, params.data.projectId);
      const document = { buffer: fs.readFileSync(file.path), fileName: file.originalname, mimeType: file.mimetype };
      const sourceText = await extractCaseDocumentText(document).catch(async (error: unknown) => {
        if (!(error instanceof CaseStudyImportError) || error.code !== 'CASE_DOCUMENT_REQUIRES_OCR') throw error;
        assertScannedPdf(document);
        const ocr = await caseStudyOcrService.recognize({
          userId: req.userId!, projectId: params.data.projectId,
          sources: [{ fileName: file.originalname, mimeType: 'application/pdf', buffer: document.buffer }],
          kind: 'pdf_scan',
          idempotencyKey: req.header('idempotency-key') ?? req.header('x-idempotency-key') ?? undefined,
        });
        return ocr.text;
      });
      res.json(await caseStudyImportRecordService.create({
        userId: req.userId!, projectId: params.data.projectId, sourceType: 'document', fileName: file.originalname, sourceText,
      }));
    } catch (error) {
      sendError(res, error, 'Не удалось прочитать документ');
    } finally {
      cleanup([file]);
    }
  },

  async importGoogleDocument(req: AuthRequest, res: Response): Promise<void> {
    const params = caseProjectParamsSchema.safeParse(req.params);
    const body = req.body && typeof req.body === 'object' ? req.body as { url?: unknown } : {};
    if (!params.success || typeof body.url !== 'string') {
      res.status(400).json({ error: !params.success ? firstIssue(params.error) : 'Добавьте ссылку на Google-файл' });
      return;
    }
    try {
      await caseStudyService.assertOwnedProject(req.userId!, params.data.projectId);
      const downloaded = await downloadGoogleCaseDocument(body.url);
      const sourceText = await extractCaseDocumentText(downloaded).catch(async (error: unknown) => {
        if (!(error instanceof CaseStudyImportError) || error.code !== 'CASE_DOCUMENT_REQUIRES_OCR') throw error;
        assertScannedPdf(downloaded);
        const ocr = await caseStudyOcrService.recognize({
          userId: req.userId!, projectId: params.data.projectId,
          sources: [{ fileName: downloaded.fileName, mimeType: 'application/pdf', buffer: downloaded.buffer }],
          kind: 'pdf_scan',
          idempotencyKey: req.header('idempotency-key') ?? req.header('x-idempotency-key') ?? undefined,
        });
        return ocr.text;
      });
      res.json(await caseStudyImportRecordService.create({
        userId: req.userId!, projectId: params.data.projectId, sourceType: 'document', fileName: downloaded.fileName, sourceText,
      }));
    } catch (error) {
      sendError(res, error, 'Не удалось прочитать Google-файл');
    }
  },

  async recognizeScreenshots(req: AuthRequest, res: Response): Promise<void> {
    const params = caseProjectParamsSchema.safeParse(req.params);
    const files = Array.isArray(req.files) ? req.files : [];
    if (!params.success) {
      cleanup(files);
      res.status(400).json({ error: firstIssue(params.error) });
      return;
    }
    try {
      await caseStudyService.assertOwnedProject(req.userId!, params.data.projectId);
      assertScreenshotBatch(files);
      const result = await caseStudyOcrService.recognize({
        userId: req.userId!,
        projectId: params.data.projectId,
        sources: files.map((file) => ({
          fileName: file.originalname,
          mimeType: file.mimetype,
          buffer: fs.readFileSync(file.path),
        })),
        kind: 'screenshots',
        idempotencyKey: req.header('idempotency-key') ?? req.header('x-idempotency-key') ?? undefined,
      });
      const imported = await caseStudyImportRecordService.create({
        userId: req.userId!, projectId: params.data.projectId, sourceType: 'screenshot', fileName: `${files.length} скриншотов`, sourceText: result.text,
      });
      const { text: _text, ...ocrResult } = result;
      res.json({ ...ocrResult, ...imported, filesCount: files.length });
    } catch (error) {
      sendError(res, error, 'Не удалось распознать текст на скриншотах');
    } finally {
      cleanup(files);
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
