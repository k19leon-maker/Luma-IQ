import { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import * as os from 'os';
import * as fs from 'fs';
import { caseStudyController } from '../controllers/case-study.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

const caseDocumentUpload = multer({ dest: os.tmpdir(), limits: { fileSize: 50 * 1024 * 1024 } });
const caseScreenshotsUpload = multer({ dest: os.tmpdir(), limits: { fileSize: 10 * 1024 * 1024, files: 20 } });
const caseImportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много импортов. Попробуйте через несколько минут.' },
});

function cleanupFailedUpload(req: Request): void {
  const directFile = (req as Request & { file?: Express.Multer.File }).file;
  const rawFiles = (req as Request & { files?: Express.Multer.File[] | Record<string, Express.Multer.File[]> }).files;
  const files = [
    ...(directFile ? [directFile] : []),
    ...(Array.isArray(rawFiles) ? rawFiles : Object.values(rawFiles ?? {}).flat()),
  ];
  for (const file of files) {
    if (file.path) fs.promises.unlink(file.path).catch(() => undefined);
  }
}

function handleUpload(middleware: RequestHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    middleware(req, res, (error?: unknown) => {
      if (!error) {
        next();
        return;
      }
      cleanupFailedUpload(req);
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'Файл больше допустимого размера для этого импорта', code: 'CASE_IMPORT_FILE_TOO_LARGE' });
        return;
      }
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_COUNT') {
        res.status(413).json({ error: 'Слишком много файлов для одного импорта', code: 'CASE_IMPORT_TOO_MANY_FILES' });
        return;
      }
      res.status(400).json({ error: 'Не удалось загрузить файл', code: 'CASE_IMPORT_UPLOAD_FAILED' });
    });
  };
}

const uploadCaseDocument = handleUpload(caseDocumentUpload.single('file'));
const uploadCaseScreenshots = handleUpload(caseScreenshotsUpload.array('files', 20));

router.get('/:projectId/cases', requireAuth, caseStudyController.list);
router.post('/:projectId/cases', requireAuth, caseStudyController.create);
router.post('/:projectId/cases/extract', requireAuth, caseStudyController.extract);
router.post('/:projectId/cases/batch', requireAuth, caseStudyController.createBatch);
router.post('/:projectId/cases/import/document', requireAuth, caseImportLimiter, uploadCaseDocument, caseStudyController.importDocument);
router.post('/:projectId/cases/import/google', requireAuth, caseImportLimiter, caseStudyController.importGoogleDocument);
router.post('/:projectId/cases/import/screenshots', requireAuth, caseImportLimiter, uploadCaseScreenshots, caseStudyController.recognizeScreenshots);
router.get('/:projectId/cases/:caseId', requireAuth, caseStudyController.get);
router.post('/:projectId/cases/:caseId/generate-insights', requireAuth, caseStudyController.generateInsights);
router.patch('/:projectId/cases/:caseId', requireAuth, caseStudyController.update);
router.delete('/:projectId/cases/:caseId', requireAuth, caseStudyController.remove);

export default router;
