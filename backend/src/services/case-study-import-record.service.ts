import { prisma } from '../lib/prisma';
import { CaseStudyImportError } from './case-study-import.service';

const PREVIEW_CHARS = 200_000;
const IMPORT_TTL_MS = 24 * 60 * 60 * 1000;

export const caseStudyImportRecordService = {
  async create(input: {
    userId: string;
    projectId: string;
    sourceType: 'document' | 'screenshot';
    fileName?: string | null;
    sourceText: string;
  }) {
    await prisma.caseStudyImport.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    const record = await prisma.caseStudyImport.create({
      data: {
        ...input,
        expiresAt: new Date(Date.now() + IMPORT_TTL_MS),
      },
      select: { id: true, sourceText: true, sourceType: true, fileName: true, expiresAt: true },
    });
    return {
      importId: record.id,
      sourceType: record.sourceType as 'document' | 'screenshot',
      fileName: record.fileName,
      textLength: record.sourceText.length,
      sourceText: record.sourceText.length <= PREVIEW_CHARS ? record.sourceText : record.sourceText.slice(0, PREVIEW_CHARS),
      previewOnly: record.sourceText.length > PREVIEW_CHARS,
      expiresAt: record.expiresAt,
    };
  },

  async get(input: { userId: string; projectId: string; importId: string }) {
    const record = await prisma.caseStudyImport.findFirst({
      where: {
        id: input.importId,
        userId: input.userId,
        projectId: input.projectId,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, sourceText: true, sourceType: true },
    });
    if (!record) {
      throw new CaseStudyImportError('Импорт больше недоступен. Загрузите материал ещё раз.', 410, 'CASE_IMPORT_EXPIRED');
    }
    return record;
  },
};
