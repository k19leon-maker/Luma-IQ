import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { PDFParse } from 'pdf-parse';
import * as XLSX from 'xlsx';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

const projectFileSchema = z.object({
  projectId: z.string().uuid(),
});

const extractUrlSchema = z.object({
  url: z.string().url(),
});

const SUPPORTED_EXTENSIONS = new Set(['.txt', '.doc', '.docx', '.pdf', '.md', '.csv', '.xls', '.xlsx']);
const PDF_PARSE_TIMEOUT_MS = 15_000;
const MAX_EXTRACTED_TEXT_CHARS = 50_000;
const MAX_REMOTE_FILE_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME_BY_EXTENSION: Record<string, Set<string>> = {
  '.txt': new Set(['text/plain', 'text/markdown', 'application/octet-stream']),
  '.md': new Set(['text/markdown', 'text/plain', 'application/octet-stream']),
  '.csv': new Set(['text/csv', 'text/plain', 'application/vnd.ms-excel', 'application/octet-stream']),
  '.pdf': new Set(['application/pdf', 'application/octet-stream']),
  '.doc': new Set(['application/msword', 'application/octet-stream']),
  '.docx': new Set([
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'application/octet-stream',
  ]),
  '.xls': new Set(['application/vnd.ms-excel', 'application/octet-stream']),
  '.xlsx': new Set([
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
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

function extensionFromMime(mimeType: string | null): string {
  const clean = mimeType?.split(';')[0]?.trim().toLowerCase();
  if (clean === 'application/pdf') return '.pdf';
  if (clean === 'text/plain') return '.txt';
  if (clean === 'text/markdown') return '.md';
  if (clean === 'text/csv') return '.csv';
  if (clean === 'application/msword') return '.doc';
  if (clean === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return '.docx';
  if (clean === 'application/vnd.ms-excel') return '.xls';
  if (clean === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return '.xlsx';
  return '';
}

function extensionFromSignature(buffer: Buffer): string {
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46])) return '.pdf';
  if (startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return '.doc';
  if (
    startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWith(buffer, [0x50, 0x4b, 0x05, 0x06]) ||
    startsWith(buffer, [0x50, 0x4b, 0x07, 0x08])
  ) {
    return '.xlsx';
  }
  if (looksLikeText(buffer)) return '.txt';
  return '';
}

function validateFileLike(originalName: string, mimeType: string | null, buffer: Buffer): string {
  const ext = path.extname(originalName).toLowerCase() || extensionFromMime(mimeType) || extensionFromSignature(buffer);
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    throw Object.assign(new Error('Поддерживаются только .txt, .md, .csv, .doc, .docx, .xls, .xlsx, .pdf'), { status: 400 });
  }

  const allowedMime = ALLOWED_MIME_BY_EXTENSION[ext];
  const cleanMime = mimeType?.split(';')[0]?.trim().toLowerCase();
  if (cleanMime && allowedMime && !allowedMime.has(cleanMime)) {
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
  if (ext === '.xls' && !isOle) {
    throw Object.assign(new Error('Файл не похож на XLS'), { status: 400 });
  }
  if (ext === '.xlsx' && !isZip) {
    throw Object.assign(new Error('Файл не похож на XLSX'), { status: 400 });
  }
  if ((ext === '.txt' || ext === '.md' || ext === '.csv') && !looksLikeText(buffer)) {
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
    const text = result.text.trim();
    const meaningfulText = text.replace(/--\s*\d+\s+of\s+\d+\s*--/gi, '').trim();
    return meaningfulText || '[PDF-файл загружен, но текст в нем не найден. Возможно, это скан или изображение без текстового слоя.]';
  } finally {
    await parser.destroy().catch(() => {});
  }
}

type WordExtractorConstructor = new () => {
  extract: (input: Buffer) => Promise<{ getBody: () => string }>;
};

async function extractTextFromBuffer(buffer: Buffer, originalName: string, mimeType: string | null): Promise<string> {
  const ext = validateFileLike(originalName, mimeType, buffer);

  if (ext === '.txt' || ext === '.md' || ext === '.csv') {
    return buffer.toString('utf-8');
  }

  if (ext === '.docx') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (ext === '.doc') {
    const WordExtractor = require('word-extractor') as WordExtractorConstructor;
    const doc = await new WordExtractor().extract(buffer);
    return doc.getBody();
  }

  if (ext === '.xlsx' || ext === '.xls') {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    return workbook.SheetNames
      .map((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        const csv = sheet ? XLSX.utils.sheet_to_csv(sheet, { blankrows: false }) : '';
        return csv.trim() ? `Лист "${sheetName}":\n${csv.trim()}` : '';
      })
      .filter(Boolean)
      .join('\n\n');
  }

  return extractPdfText(buffer);
}

async function extractTextFromUploadedFile(file: Express.Multer.File): Promise<string> {
  const buffer = fs.readFileSync(file.path);
  return extractTextFromBuffer(buffer, file.originalname, file.mimetype || null);
}

function googleExportUrl(inputUrl: string): { url: string; fileName: string } | null {
  const parsed = new URL(inputUrl);
  const host = parsed.hostname.replace(/^www\./, '');
  if (!['docs.google.com', 'drive.google.com'].includes(host)) return null;

  const docsMatch = parsed.pathname.match(/\/document\/d\/([^/]+)/);
  if (docsMatch?.[1]) {
    return {
      url: `https://docs.google.com/document/d/${docsMatch[1]}/export?format=txt`,
      fileName: 'google-doc.txt',
    };
  }

  const sheetsMatch = parsed.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
  if (sheetsMatch?.[1]) {
    const gid = parsed.searchParams.get('gid');
    return {
      url: `https://docs.google.com/spreadsheets/d/${sheetsMatch[1]}/export?format=csv${gid ? `&gid=${encodeURIComponent(gid)}` : ''}`,
      fileName: 'google-sheet.csv',
    };
  }

  const driveFileMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/);
  const idFromOpen = parsed.pathname === '/open' ? parsed.searchParams.get('id') : null;
  const fileId = driveFileMatch?.[1] ?? idFromOpen;
  if (host === 'drive.google.com' && fileId) {
    return {
      url: `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`,
      fileName: 'google-drive-file',
    };
  }

  return null;
}

function fileNameFromHeaders(headers: Headers, fallback: string, mimeType: string | null): string {
  const disposition = headers.get('content-disposition') ?? '';
  const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
  const rawName = utfMatch?.[1] ?? plainMatch?.[1];
  const decoded = rawName ? decodeURIComponent(rawName) : fallback;
  if (path.extname(decoded)) return decoded;
  return `${decoded}${extensionFromMime(mimeType) || '.txt'}`;
}

async function fetchRemoteFile(inputUrl: string): Promise<{ buffer: Buffer; fileName: string; mimeType: string | null }> {
  const exportTarget = googleExportUrl(inputUrl) ?? { url: inputUrl, fileName: path.basename(new URL(inputUrl).pathname) || 'remote-file' };
  const response = await fetch(exportTarget.url, { redirect: 'follow' });
  if (!response.ok) {
    throw Object.assign(new Error('Не удалось скачать файл по ссылке. Проверьте доступ по ссылке.'), { status: response.status });
  }

  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > MAX_REMOTE_FILE_BYTES) {
    throw Object.assign(new Error('Файл по ссылке больше 10 МБ'), { status: 413 });
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_REMOTE_FILE_BYTES) {
    throw Object.assign(new Error('Файл по ссылке больше 10 МБ'), { status: 413 });
  }

  const mimeType = response.headers.get('content-type');
  const fileName = fileNameFromHeaders(response.headers, exportTarget.fileName, mimeType);
  return { buffer: Buffer.from(arrayBuffer), fileName, mimeType };
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

  async extractTextFromUrl(req: AuthRequest, res: Response): Promise<void> {
    const parsed = extractUrlSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }

    try {
      const remote = await fetchRemoteFile(parsed.data.url);
      const text = await extractTextFromBuffer(remote.buffer, remote.fileName, remote.mimeType);
      res.json({ text: text.slice(0, 12000), fileName: remote.fileName });
    } catch (err) {
      const status = typeof err === 'object' && err !== null && 'status' in err ? Number((err as { status: unknown }).status) : 500;
      console.error('[files] extractTextFromUrl error:', err);
      res.status(status || 500).json({ error: err instanceof Error ? err.message : 'Не удалось извлечь текст по ссылке' });
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
