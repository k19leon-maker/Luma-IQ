import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { URL, URLSearchParams } from 'url';
import OpenAI from 'openai';
import ffmpegStatic from 'ffmpeg-static';
import { env } from '../config/env';

const SUPPORTED_EXTENSIONS = new Set(['.mp3', '.m4a', '.wav', '.mp4', '.mov', '.webm', '.ogg']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm']);
const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/ogg': '.ogg',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
};
const CHUNK_SECONDS = 1200;
const MAX_DIRECT_UPLOAD_BYTES = 24 * 1024 * 1024;

export class CastDevTranscriptionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

export interface CastDevTranscriptionResult {
  transcriptText: string;
  fileName: string;
  mimeType: string;
  durationSec: number | null;
}

interface DownloadResult {
  filePath: string;
  fileName: string;
  mimeType: string;
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'recording';
}

function extractGoogleDriveFileId(value: string): string | null {
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (
    host !== 'drive.google.com'
    && host !== 'docs.google.com'
    && host !== 'drive.usercontent.google.com'
    && !host.endsWith('.googleusercontent.com')
  ) return null;
  const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
  if (fileMatch?.[1]) return fileMatch[1];
  return url.searchParams.get('id');
}

function isGoogleDriveHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  return host === 'drive.google.com'
    || host === 'docs.google.com'
    || host === 'drive.usercontent.google.com'
    || host.endsWith('.googleusercontent.com');
}

function assertGoogleUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CastDevTranscriptionError('Некорректная ссылка на файл', 'BAD_URL');
  }
  if (!['https:', 'http:'].includes(url.protocol)) {
    throw new CastDevTranscriptionError('Разрешены только HTTP/HTTPS-ссылки', 'BAD_URL');
  }
  if (!isGoogleDriveHost(url.hostname)) {
    throw new CastDevTranscriptionError('Добавьте ссылку на файл Google Drive', 'NOT_GOOGLE_DRIVE');
  }
}

function extensionFromHeaders(url: string, mimeType: string, disposition: string): string {
  const filenameStar = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (filenameStar?.[1]) return path.extname(decodeURIComponent(filenameStar[1])).toLowerCase();
  const filename = disposition.match(/filename="?([^";]+)"?/i);
  if (filename?.[1]) return path.extname(decodeURIComponent(filename[1])).toLowerCase();
  const urlExt = path.extname(new URL(url).pathname).toLowerCase();
  if (SUPPORTED_EXTENSIONS.has(urlExt)) return urlExt;
  return CONTENT_TYPE_EXTENSIONS[mimeType] ?? '';
}

function extractFormAction(html: string): string | null {
  const match = html.match(/<form[^>]+id="download-form"[^>]+action="([^"]+)"/i);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function extractHiddenInputs(html: string): URLSearchParams {
  const params = new URLSearchParams();
  for (const match of html.matchAll(/<input\s+type="hidden"\s+name="([^"]+)"\s+value="([^"]*)"/gi)) {
    params.set(decodeURIComponent(match[1]), decodeURIComponent(match[2] ?? ''));
  }
  return params;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.CASTDEV_REQUEST_TIMEOUT_SECONDS * 1000);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'User-Agent': 'LumaIQ-CastDev/1.0',
        ...(init.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function googleDriveDownloadUrl(sourceUrl: string): Promise<Response> {
  const fileId = extractGoogleDriveFileId(sourceUrl);
  if (!fileId) {
    const url = new URL(sourceUrl);
    if (isGoogleDriveHost(url.hostname) && url.hostname.toLowerCase().includes('googleusercontent.com')) {
      return fetchWithTimeout(sourceUrl, { redirect: 'follow' });
    }
    throw new CastDevTranscriptionError('Не удалось определить ID файла Google Drive', 'NO_FILE_ID');
  }
  const params = new URLSearchParams({ export: 'download', id: fileId });
  const response = await fetchWithTimeout(`https://drive.google.com/uc?${params.toString()}`, { redirect: 'follow' });
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (contentType === 'text/html') {
    const html = await response.text();
    if (html.includes('download-form')) {
      const action = extractFormAction(html);
      const params = extractHiddenInputs(html);
      if (!action || params.size === 0) {
        throw new CastDevTranscriptionError(
          'Google Drive требует подтверждение скачивания, но сервис не смог найти ссылку подтверждения.',
          'GOOGLE_CONFIRMATION_REQUIRED',
        );
      }
      const confirmationUrl = new URL(action, response.url);
      for (const [key, value] of params.entries()) confirmationUrl.searchParams.set(key, value);
      return fetchWithTimeout(confirmationUrl.toString(), { redirect: 'follow' });
    }
    throw new CastDevTranscriptionError('Файл Google Drive недоступен. Проверьте доступ по ссылке.', 'GOOGLE_FILE_INACCESSIBLE');
  }
  return response;
}

async function downloadGoogleDriveFile(sourceUrl: string, recordId: string): Promise<DownloadResult> {
  assertGoogleUrl(sourceUrl);
  const response = await googleDriveDownloadUrl(sourceUrl);
  if (!response.ok || !response.body) {
    throw new CastDevTranscriptionError(
      `Не удалось скачать файл: HTTP ${response.status}. Проверьте доступ по ссылке.`,
      'DOWNLOAD_FAILED',
      response.status >= 500 ? 502 : 400,
    );
  }

  const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? 'application/octet-stream';
  const disposition = response.headers.get('content-disposition') ?? '';
  const extension = extensionFromHeaders(response.url || sourceUrl, mimeType, disposition);
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new CastDevTranscriptionError(
      'Этот формат пока не поддерживается. Используйте mp3, m4a, wav, ogg, mp4, mov или webm.',
      'UNSUPPORTED_FORMAT',
    );
  }

  const contentLength = response.headers.get('content-length');
  const maxBytes = env.CASTDEV_MAX_DOWNLOAD_MB * 1024 * 1024;
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new CastDevTranscriptionError(
      `Файл слишком большой. Лимит сейчас ${env.CASTDEV_MAX_DOWNLOAD_MB} MB.`,
      'FILE_TOO_LARGE',
    );
  }

  await fs.promises.mkdir(env.CASTDEV_DOWNLOAD_DIR, { recursive: true });
  const fileName = `${safeName(recordId)}_${randomUUID()}${extension}`;
  const filePath = path.join(env.CASTDEV_DOWNLOAD_DIR, fileName);
  let downloaded = 0;
  const writer = fs.createWriteStream(filePath);
  try {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      downloaded += value.byteLength;
      if (downloaded > maxBytes) {
        throw new CastDevTranscriptionError(
          `Файл слишком большой. Лимит сейчас ${env.CASTDEV_MAX_DOWNLOAD_MB} MB.`,
          'FILE_TOO_LARGE',
        );
      }
      await new Promise<void>((resolve, reject) => {
        writer.write(Buffer.from(value), (err) => err ? reject(err) : resolve());
      });
    }
    await new Promise<void>((resolve, reject) => {
      writer.end((err?: Error | null) => err ? reject(err) : resolve());
    });
  } catch (err) {
    writer.destroy();
    await fs.promises.unlink(filePath).catch(() => undefined);
    throw err;
  }
  const stat = await fs.promises.stat(filePath);
  if (stat.size === 0) {
    await fs.promises.unlink(filePath).catch(() => undefined);
    throw new CastDevTranscriptionError('Скачанный файл пустой', 'EMPTY_FILE');
  }

  return { filePath, fileName, mimeType };
}

function ffmpegPath(): string {
  if (!ffmpegStatic) {
    throw new CastDevTranscriptionError('ffmpeg недоступен на сервере', 'FFMPEG_UNAVAILABLE', 503);
  }
  return ffmpegStatic;
}

function run(command: string, args: string[], message: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new CastDevTranscriptionError(`${message}: ${stderr.slice(-1000)}`, 'FFMPEG_FAILED', 422));
    });
  });
}

async function mediaDuration(filePath: string): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn(ffmpegPath(), ['-i', filePath], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('close', () => {
      const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!match) {
        resolve(null);
        return;
      }
      resolve(Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]));
    });
    child.on('error', () => resolve(null));
  });
}

async function prepareAudio(filePath: string): Promise<{ uploadPaths: string[]; cleanupPaths: string[]; durationSec: number | null }> {
  const ext = path.extname(filePath).toLowerCase();
  const durationSec = await mediaDuration(filePath);
  const cleanupPaths: string[] = [];
  let audioPath = filePath;

  if (VIDEO_EXTENSIONS.has(ext)) {
    audioPath = filePath.replace(/\.[^.]+$/, '.mp3');
    await run(ffmpegPath(), [
      '-y', '-fflags', '+discardcorrupt', '-err_detect', 'ignore_err',
      '-i', filePath,
      '-vn', '-ac', '1', '-ar', '16000', '-b:a', '64k',
      audioPath,
    ], 'Не удалось извлечь аудио из видео');
    cleanupPaths.push(audioPath);
  }

  const stat = await fs.promises.stat(audioPath);
  if (stat.size <= MAX_DIRECT_UPLOAD_BYTES) {
    return { uploadPaths: [audioPath], cleanupPaths, durationSec };
  }

  const chunkPattern = audioPath.replace(/\.[^.]+$/, '_part_%03d.mp3');
  await run(ffmpegPath(), [
    '-y', '-fflags', '+discardcorrupt', '-err_detect', 'ignore_err',
    '-i', audioPath,
    '-vn', '-ac', '1', '-ar', '16000', '-b:a', '64k',
    '-f', 'segment', '-segment_time', String(CHUNK_SECONDS), '-reset_timestamps', '1',
    chunkPattern,
  ], 'Не удалось разбить аудио на части');

  const dir = path.dirname(audioPath);
  const stem = path.basename(audioPath, path.extname(audioPath));
  const files = (await fs.promises.readdir(dir))
    .filter((name) => name.startsWith(`${stem}_part_`) && name.endsWith('.mp3'))
    .map((name) => path.join(dir, name))
    .sort();
  if (!files.length) {
    throw new CastDevTranscriptionError('ffmpeg не создал аудиочасти для транскрибации', 'FFMPEG_NO_CHUNKS', 422);
  }
  cleanupPaths.push(...files);
  return { uploadPaths: files, cleanupPaths, durationSec };
}

export async function transcribeCastDevRecord(sourceUrl: string, recordId: string): Promise<CastDevTranscriptionResult> {
  if (!env.OPENAI_API_KEY) {
    throw new CastDevTranscriptionError('Транскрибация временно недоступна', 'OPENAI_NOT_CONFIGURED', 503);
  }

  const downloaded = await downloadGoogleDriveFile(sourceUrl, recordId);
  const cleanupPaths = [downloaded.filePath];
  try {
    const prepared = await prepareAudio(downloaded.filePath);
    cleanupPaths.push(...prepared.cleanupPaths);
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const transcripts: string[] = [];

    for (let index = 0; index < prepared.uploadPaths.length; index += 1) {
      const result = await client.audio.transcriptions.create({
        model: env.OPENAI_TRANSCRIPTION_MODEL,
        file: fs.createReadStream(prepared.uploadPaths[index]),
        language: env.OPENAI_TRANSCRIPTION_LANGUAGE,
      });
      const text = String(result.text ?? '').trim();
      if (!text) {
        throw new CastDevTranscriptionError(`OpenAI вернул пустой транскрипт для части ${index + 1}`, 'EMPTY_TRANSCRIPT', 422);
      }
      transcripts.push(text);
    }

    const transcriptText = transcripts.join('\n\n').trim();
    if (!transcriptText) {
      throw new CastDevTranscriptionError('Не удалось распознать речь в записи', 'EMPTY_TRANSCRIPT', 422);
    }
    return {
      transcriptText,
      fileName: downloaded.fileName,
      mimeType: downloaded.mimeType,
      durationSec: prepared.durationSec ? Math.round(prepared.durationSec) : null,
    };
  } finally {
    await Promise.all([...new Set(cleanupPaths)].map((file) => fs.promises.unlink(file).catch(() => undefined)));
  }
}
