import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { PDFParse } from 'pdf-parse';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

const projectFileSchema = z.object({
  projectId: z.string().uuid(),
});

const SUPPORTED_EXTENSIONS = new Set(['.txt', '.doc', '.docx', '.pdf', '.md']);
const PDF_PARSE_TIMEOUT_MS = 15_000;
const MAX_EXTRACTED_TEXT_CHARS = 50_000;

const ALLOWED_MIME_BY_EXTENSION: Record<string, Set<string>> = {
  '.txt': new Set(['text/plain', 'text/markdown', 'application/octet-stream']),
  '.md': new Set(['text/markdown', 'text/plain', 'application/octet-stream']),
  '.pdf': new Set(['application/pdf', 'application/octet-stream']),
  '.doc': new Set(['application/msword', 'application/octet-stream']),
  '.docx': new Set([
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'application/octet-stream',
  ]),
};

function summarize(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.length > 700 ? `${compact.slice(0, 700)}...` : compact;
}

async function assertProjectOwner(userId: string, projectId: string): Promise<boolean> {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId }, select: { id: true } });
  return Boolean(project);
}

function startsWith(buffer: Buffer, signature: number[]): boolean {
  return signature.every((byte, index) => buffer[index] === byte);
}

function looksLikeText(buffer: Buffer): boolean {
  if (buffer.length === 0) return true;
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  if (sample.includes(0)) return false;

  const decoded = sample.toString('utf8');
  const replacementCount = decoded.split('\uFFFD').length - 1;
  return replacementCount <= Math.max(1, Math.floor(decoded.length * 0.02));
}

function validateUploadedFile(file: Express.Multer.File, buffer: Buffer): string {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    throw Object.assign(new Error('Поддерживаются только .txt, .md, .doc, .docx, .pdf'), { status: 400 });
  }

  const allowedMime = ALLOWED_MIME_BY_EXTENSION[ext];
  if (file.mimetype && allowedMime && !allowedMime.has(file.mimetype)) {
    throw Object.assign(new Error('Тип файла не соответствует расширению'), { status: 400 });
  }

  const isPdf = startsWith(buffer, [0x25, 0x50, 0x44, 0x46]); // %PDF
  const isZip = startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]) || startsWith(buffer, [0x50, 0x4b, 0x05, 0x06]) || startsWith(buffer, [0x50, 0x4b, 0x07, 0x08]);
  const isOle = startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

  if (ext === '.pdf' && !isPdf) {
    throw Object.assign(new Error('Файл не похож на PDF'), { status: 400 });
  }
  if (ext === '.docx' && !isZip) {
    throw Object.assign(new Error('Файл не похож на DOCX'), { status: 400 });
  }
  if (ext === '.doc' && !isOle) {
    throw Object.assign(new Error('Файл не похож на DOC'), { status: 400 });
  }
  if ((ext === '.txt' || ext === '.md') && !looksLikeText(buffer)) {
    throw Object.assign(new Error('Файл не похож на текстовый документ'), { status: 400 });
  }

  return ext;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error(message), { status: 422 })), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await withTimeout(parser.getText(), PDF_PARSE_TIMEOUT_MS, 'PDF слишком долго обрабатывается');
    return result.text.trim() || '[PDF-файл загружен, но текст в нем не найден.]';
  } finally {
    await parser.destroy().catch(() => {});
  }
}

async function extractTextFromUploadedFile(file: Express.Multer.File): Promise<string> {
  const buffer = fs.readFileSync(file.path);
  const ext = validateUploadedFile(file, buffer);

  if (ext === '.txt' || ext === '.md') {
    return buffer.toString('utf-8');
  }

  if (ext === '.docx' || ext === '.doc') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ path: file.path });
    return result.value;
  }

  return extractPdfText(buffer);
}

function cleanup(file?: Express.Multer.File): void {
  if (!file?.path) return;
  try { fs.unlinkSync(file.path); } catch { /* ignore */ }
}

export const filesController = {
  async extractText(req: AuthRequest, res: Response): Promise<void> {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'Файл не загружен' });
      return;
    }

    try {
      const text = await extractTextFromUploadedFile(file);
      res.json({ text: text.slice(0, 12000) });
    } catch (err) {
      const status = typeof err === 'object' && err !== null && 'status' in err ? Number((err as { status: unknown }).status) : 500;
      console.error('[files] extractText error:', err);
      res.status(status || 500).json({ error: err instanceof Error ? err.message : 'Не удалось извлечь текст из файла' });
    } finally {
      cleanup(file);
    }
  },

  async listProjectFiles(req: AuthRequest, res: Response): Promise<void> {
    const parsed = projectFileSchema.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0].message }); return; }

    try {
      const owned = await assertProjectOwner(req.userId!, parsed.data.projectId);
      if (!owned) { res.status(403).json({ error: 'Нет доступа к проекту' }); return; }

      const files = await prisma.projectFile.findMany({
        where: { projectId: parsed.data.projectId, userId: req.userId! },
        orderBy: { createdAt: 'desc' },
      });
      res.json({ files });
    } catch (err) {
      console.error('[files] listProjectFiles:', err);
      res.status(500).json({ error: 'Ошибка загрузки файлов проекта' });
    }
  },

  async uploadProjectFile(req: AuthRequest, res: Response): Promise<void> {
    const file = req.file;
    const parsed = projectFileSchema.safeParse(req.body);
    if (!parsed.success) { cleanup(file); res.status(400).json({ error: parsed.error.errors[0].message }); return; }
    if (!file) { res.status(400).json({ error: 'Файл не загружен' }); return; }

    try {
      const owned = await assertProjectOwner(req.userId!, parsed.data.projectId);
      if (!owned) { res.status(403).json({ error: 'Нет доступа к проекту' }); return; }

      const text = await extractTextFromUploadedFile(file);
      const extension = path.extname(file.originalname).toLowerCase();
      const saved = await prisma.projectFile.create({
        data: {
          userId: req.userId!,
          projectId: parsed.data.projectId,
          originalName: file.originalname,
          mimeType: file.mimetype || null,
          sizeBytes: file.size,
          extension,
          textContent: text.slice(0, MAX_EXTRACTED_TEXT_CHARS),
          summary: summarize(text),
          metadata: {
            extractedChars: text.length,
            truncated: text.length > MAX_EXTRACTED_TEXT_CHARS,
          } as Prisma.InputJsonValue,
        },
      });

      res.status(201).json({ file: saved });
    } catch (err) {
      const status = typeof err === 'object' && err !== null && 'status' in err ? Number((err as { status: unknown }).status) : 500;
      console.error('[files] uploadProjectFile:', err);
      res.status(status || 500).json({ error: err instanceof Error ? err.message : 'Ошибка загрузки файла' });
    } finally {
      cleanup(file);
    }
  },

  async deleteProjectFile(req: AuthRequest, res: Response): Promise<void> {
    const id = req.params.id as string;
    try {
      const file = await prisma.projectFile.findFirst({ where: { id, userId: req.userId! }, select: { id: true } });
      if (!file) { res.status(404).json({ error: 'Файл не найден' }); return; }
      await prisma.projectFile.delete({ where: { id } });
      res.json({ ok: true });
    } catch (err) {
      console.error('[files] deleteProjectFile:', err);
      res.status(500).json({ error: 'Ошибка удаления файла' });
    }
  },
};
