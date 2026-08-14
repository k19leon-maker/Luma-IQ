import * as fs from 'fs';
import * as path from 'path';
import { PDFParse } from 'pdf-parse';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';

export const CASE_DOCUMENT_MAX_BYTES = 50 * 1024 * 1024;
export const CASE_SCREENSHOT_MAX_BYTES = 10 * 1024 * 1024;
export const CASE_SCREENSHOT_BATCH_MAX_COUNT = 20;
export const CASE_SCREENSHOT_BATCH_MAX_BYTES = 50 * 1024 * 1024;
export const CASE_SCANNED_PDF_MAX_BYTES = 20 * 1024 * 1024;

const DOCUMENT_EXTENSIONS = new Set(['.txt', '.md', '.csv', '.doc', '.docx', '.pdf', '.xls', '.xlsx', '.pptx']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const MAX_OFFICE_ARCHIVE_UNCOMPRESSED_BYTES = 250 * 1024 * 1024;
const GOOGLE_DOWNLOAD_TIMEOUT_MS = 30_000;

export class CaseStudyImportError extends Error {
  constructor(message: string, public readonly status = 400, public readonly code = 'CASE_IMPORT_INVALID') {
    super(message);
  }
}

function hasSignature(buffer: Buffer, signature: number[]) {
  return signature.every((value, index) => buffer[index] === value);
}

function isZip(buffer: Buffer) {
  return hasSignature(buffer, [0x50, 0x4b, 0x03, 0x04]) || hasSignature(buffer, [0x50, 0x4b, 0x05, 0x06]);
}

function isText(buffer: Buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  return !sample.includes(0);
}

function isOleDocument(buffer: Buffer) {
  return hasSignature(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
}

function isGoogleDownloadHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  return host === 'docs.google.com'
    || host === 'drive.google.com'
    || host === 'drive.usercontent.google.com'
    || host.endsWith('.googleusercontent.com');
}

function decodeXml(value: string) {
  return value
    .replace(/<a:br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

async function pdfText(buffer: Buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text.replace(/--\s*\d+\s+of\s+\d+\s*--/gi, '').trim();
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

async function pptxText(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer, { createFolders: false });
  const slides = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => Number(a.match(/slide(\d+)/i)?.[1]) - Number(b.match(/slide(\d+)/i)?.[1]));
  const content = await Promise.all(slides.map(async (name, index) => {
    const xml = await zip.file(name)?.async('string');
    const text = xml ? decodeXml(xml) : '';
    return text ? `Слайд ${index + 1}:\n${text}` : '';
  }));
  return content.filter(Boolean).join('\n\n');
}

async function assertSafeOfficeArchive(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer, { createFolders: false });
  const unpacked = Object.values(zip.files).reduce((total, entry) => {
    const size = Number((entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0);
    return total + (Number.isFinite(size) ? size : 0);
  }, 0);
  if (unpacked > MAX_OFFICE_ARCHIVE_UNCOMPRESSED_BYTES) {
    throw new CaseStudyImportError('Документ слишком большой после распаковки', 413, 'CASE_DOCUMENT_ARCHIVE_TOO_LARGE');
  }
}

type WordExtractor = new () => { extract: (buffer: Buffer) => Promise<{ getBody: () => string }> };

export async function extractCaseDocumentText(input: { buffer: Buffer; fileName: string; mimeType?: string | null }) {
  if (!input.buffer.length) throw new CaseStudyImportError('Файл пуст');
  if (input.buffer.length > CASE_DOCUMENT_MAX_BYTES) {
    throw new CaseStudyImportError('Документ больше 50 MB', 413, 'CASE_DOCUMENT_TOO_LARGE');
  }
  const extension = path.extname(input.fileName).toLowerCase();
  if (!DOCUMENT_EXTENSIONS.has(extension)) {
    throw new CaseStudyImportError('Поддерживаются PDF, DOC, DOCX, PPTX, XLS, XLSX, TXT, MD и CSV');
  }
  if (extension === '.pdf' && !hasSignature(input.buffer, [0x25, 0x50, 0x44, 0x46])) throw new CaseStudyImportError('Файл не похож на PDF');
  if (['.docx', '.xlsx', '.pptx'].includes(extension) && !isZip(input.buffer)) throw new CaseStudyImportError('Файл не похож на документ Office');
  if (['.doc', '.xls'].includes(extension) && !isOleDocument(input.buffer)) throw new CaseStudyImportError('Файл не похож на документ Office');
  if (['.txt', '.md', '.csv'].includes(extension) && !isText(input.buffer)) throw new CaseStudyImportError('Файл не похож на текстовый документ');
  if (['.docx', '.xlsx', '.pptx'].includes(extension)) await assertSafeOfficeArchive(input.buffer);

  let text = '';
  if (['.txt', '.md', '.csv'].includes(extension)) text = input.buffer.toString('utf8');
  else if (extension === '.pdf') text = await pdfText(input.buffer);
  else if (extension === '.docx') {
    const mammoth = await import('mammoth');
    text = (await mammoth.extractRawText({ buffer: input.buffer })).value;
  } else if (extension === '.doc') {
    const module = await import('word-extractor');
    const extractor = module.default as unknown as WordExtractor;
    text = (await new extractor().extract(input.buffer)).getBody();
  } else if (extension === '.pptx') text = await pptxText(input.buffer);
  else {
    const workbook = XLSX.read(input.buffer, { type: 'buffer' });
    text = workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name];
      const csv = sheet ? XLSX.utils.sheet_to_csv(sheet, { blankrows: false }).trim() : '';
      return csv ? `Лист «${name}»:\n${csv}` : '';
    }).filter(Boolean).join('\n\n');
  }
  const normalized = text.replace(/\u0000/g, '').replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    throw new CaseStudyImportError(
      'В документе не найден текст. Для скана загрузите страницы как PNG, JPG или WEBP: сервис распознает их через OpenAI.',
      422,
      'CASE_DOCUMENT_REQUIRES_OCR',
    );
  }
  return normalized;
}

function googleTarget(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new CaseStudyImportError('Некорректная ссылка'); }
  if (url.protocol !== 'https:') throw new CaseStudyImportError('Разрешены только HTTPS-ссылки');
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!['docs.google.com', 'drive.google.com'].includes(host)) {
    throw new CaseStudyImportError('Поддерживаются только публичные ссылки Google Drive, Docs, Sheets и Slides');
  }
  const documentId = url.pathname.match(/\/document\/d\/([^/]+)/)?.[1];
  if (documentId) return { url: `https://docs.google.com/document/d/${documentId}/export?format=txt`, name: 'google-doc.txt' };
  const sheetId = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/)?.[1];
  if (sheetId) return { url: `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`, name: 'google-sheet.csv' };
  const slideId = url.pathname.match(/\/presentation\/d\/([^/]+)/)?.[1];
  if (slideId) return { url: `https://docs.google.com/presentation/d/${slideId}/export/txt`, name: 'google-slides.txt' };
  const fileId = url.pathname.match(/\/file\/d\/([^/]+)/)?.[1] ?? (url.pathname === '/open' ? url.searchParams.get('id') : null);
  if (fileId) return { url: `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`, name: 'google-drive-file' };
  throw new CaseStudyImportError('Не удалось определить файл Google. Откройте доступ «по ссылке» и вставьте ссылку на файл.');
}

async function fetchGoogle(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GOOGLE_DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'LumaIQ-CaseImport/1.0' },
    });
    if (!isGoogleDownloadHost(new URL(response.url || url).hostname)) {
      throw new CaseStudyImportError('Google-файл перенаправил на неподдерживаемый адрес', 400, 'CASE_GOOGLE_REDIRECT_REJECTED');
    }
    return response;
  } catch (error) {
    if (error instanceof CaseStudyImportError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new CaseStudyImportError('Не удалось скачать файл за отведённое время', 502, 'CASE_GOOGLE_DOWNLOAD_TIMEOUT');
    }
    throw new CaseStudyImportError('Не удалось скачать файл. Проверьте доступ по ссылке.', 502, 'CASE_GOOGLE_DOWNLOAD_FAILED');
  } finally {
    clearTimeout(timeout);
  }
}

function confirmationUrl(html: string, baseUrl: string): string | null {
  const action = html.match(/<form[^>]+id="download-form"[^>]+action="([^"]+)"/i)?.[1];
  if (!action) return null;
  const url = new URL(decodeURIComponent(action), baseUrl);
  if (!isGoogleDownloadHost(url.hostname)) return null;
  for (const match of html.matchAll(/<input\s+type="hidden"\s+name="([^"]+)"\s+value="([^"]*)"/gi)) {
    url.searchParams.set(decodeURIComponent(match[1]), decodeURIComponent(match[2] ?? ''));
  }
  return url.toString();
}

function extensionForMimeType(mimeType: string): string {
  const normalized = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  return {
    'application/pdf': '.pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.ms-excel': '.xls',
    'text/plain': '.txt',
    'text/csv': '.csv',
  }[normalized] ?? '';
}

export async function downloadGoogleCaseDocument(value: string) {
  const target = googleTarget(value);
  let response = await fetchGoogle(target.url);
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (contentType === 'text/html' && target.name === 'google-drive-file') {
    const html = await response.text();
    const confirmation = confirmationUrl(html, response.url || target.url);
    if (!confirmation) {
      throw new CaseStudyImportError('Файл Google Drive недоступен. Откройте доступ «по ссылке» и повторите попытку.', 400, 'CASE_GOOGLE_FILE_INACCESSIBLE');
    }
    response = await fetchGoogle(confirmation);
  }
  if (!response.ok) throw new CaseStudyImportError('Не удалось скачать файл. Проверьте доступ по ссылке.', response.status >= 500 ? 502 : 400, 'CASE_GOOGLE_DOWNLOAD_FAILED');
  const finalContentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (finalContentType === 'text/html') {
    throw new CaseStudyImportError('Google-файл недоступен. Откройте доступ «по ссылке» и повторите попытку.', 400, 'CASE_GOOGLE_FILE_INACCESSIBLE');
  }
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > CASE_DOCUMENT_MAX_BYTES) throw new CaseStudyImportError('Документ больше 50 MB', 413, 'CASE_DOCUMENT_TOO_LARGE');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > CASE_DOCUMENT_MAX_BYTES) throw new CaseStudyImportError('Документ больше 50 MB', 413, 'CASE_DOCUMENT_TOO_LARGE');
  const disposition = response.headers.get('content-disposition') ?? '';
  const responseName = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  const defaultName = target.name === 'google-drive-file'
    ? `google-drive-file${extensionForMimeType(finalContentType)}`
    : target.name;
  return { buffer, fileName: decodeURIComponent(responseName ?? defaultName), mimeType: response.headers.get('content-type') };
}

export function assertScreenshotBatch(files: Express.Multer.File[]) {
  if (!files.length) throw new CaseStudyImportError('Загрузите хотя бы один скриншот');
  if (files.length > CASE_SCREENSHOT_BATCH_MAX_COUNT) throw new CaseStudyImportError('За один импорт можно добавить до 20 скриншотов');
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > CASE_SCREENSHOT_BATCH_MAX_BYTES) throw new CaseStudyImportError('Общий размер скриншотов больше 50 MB', 413, 'CASE_SCREENSHOT_BATCH_TOO_LARGE');
  for (const file of files) {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension) || !file.mimetype.startsWith('image/')) {
      throw new CaseStudyImportError('Поддерживаются скриншоты PNG, JPG, JPEG и WEBP');
    }
    if (file.size > CASE_SCREENSHOT_MAX_BYTES) throw new CaseStudyImportError(`Скриншот «${file.originalname}» больше 10 MB`, 413, 'CASE_SCREENSHOT_TOO_LARGE');
    const signature = fs.readFileSync(file.path);
    const imageMatches = (extension === '.png' && hasSignature(signature, [0x89, 0x50, 0x4e, 0x47]))
      || (['.jpg', '.jpeg'].includes(extension) && hasSignature(signature, [0xff, 0xd8, 0xff]))
      || (extension === '.webp' && hasSignature(signature, [0x52, 0x49, 0x46, 0x46]) && signature.subarray(8, 12).toString('ascii') === 'WEBP');
    if (!imageMatches) throw new CaseStudyImportError(`Файл «${file.originalname}» не похож на изображение`);
  }
}

export function assertScannedPdf(input: { buffer: Buffer; fileName: string; mimeType?: string | null }) {
  if (path.extname(input.fileName).toLowerCase() !== '.pdf' || !hasSignature(input.buffer, [0x25, 0x50, 0x44, 0x46])) {
    throw new CaseStudyImportError('Для OCR PDF нужен настоящий PDF-файл');
  }
  if (input.buffer.length > CASE_SCANNED_PDF_MAX_BYTES) {
    throw new CaseStudyImportError('Сканированный PDF больше 20 MB. Разделите его на несколько файлов или загрузите страницы как изображения.', 413, 'CASE_SCANNED_PDF_TOO_LARGE');
  }
}
