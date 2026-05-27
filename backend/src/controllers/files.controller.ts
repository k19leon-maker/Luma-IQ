import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

const projectFileSchema = z.object({
  projectId: z.string().uuid(),
});

const SUPPORTED_EXTENSIONS = new Set(['.txt', '.doc', '.docx', '.pdf', '.md']);

function summarize(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.length > 700 ? `${compact.slice(0, 700)}...` : compact;
}

async function assertProjectOwner(userId: string, projectId: string): Promise<boolean> {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId }, select: { id: true } });
  return Boolean(project);
}

async function extractTextFromUploadedFile(file: Express.Multer.File): Promise<string> {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    throw Object.assign(new Error('Поддерживаются только .txt, .md, .doc, .docx, .pdf'), { status: 400 });
  }

  if (ext === '.txt' || ext === '.md') {
    return fs.readFileSync(file.path, 'utf-8');
  }

  if (ext === '.docx' || ext === '.doc') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ path: file.path });
    return result.value;
  }

  const buffer = fs.readFileSync(file.path);
  const raw = buffer.toString('latin1');
  const matches = raw.match(/\(([^\)]{2,200})\)/g) ?? [];
  const text = matches
    .map((m) => m.slice(1, -1))
    .filter((s) => /[а-яёa-z]/i.test(s))
    .join(' ');

  return text.trim() || '[PDF-файл загружен. Текст не удалось извлечь точно, но файл сохранен как материал проекта.]';
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
          textContent: text.slice(0, 50000),
          summary: summarize(text),
          metadata: {
            extractedChars: text.length,
            truncated: text.length > 50000,
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
