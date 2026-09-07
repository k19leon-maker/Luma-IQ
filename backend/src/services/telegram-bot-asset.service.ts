import { createHash } from 'crypto';
import path from 'path';
import { BotAssetMediaType, Prisma } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';

export const TELEGRAM_ASSET_MAX_BYTES = env.TELEGRAM_ASSET_MAX_MB * 1024 * 1024;
const TELEGRAM_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

const MEDIA_EXTENSIONS: Record<BotAssetMediaType, Set<string>> = {
  IMAGE: new Set(['.jpg', '.jpeg', '.png', '.webp']),
  DOCUMENT: new Set(['.pdf', '.txt', '.md', '.csv', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip']),
  VIDEO: new Set(['.mp4', '.m4v', '.mov']),
  AUDIO: new Set(['.mp3', '.m4a', '.wav', '.ogg']),
};

const MIME_BY_EXTENSION: Record<string, Set<string>> = {
  '.jpg': new Set(['image/jpeg', 'application/octet-stream']),
  '.jpeg': new Set(['image/jpeg', 'application/octet-stream']),
  '.png': new Set(['image/png', 'application/octet-stream']),
  '.webp': new Set(['image/webp', 'application/octet-stream']),
  '.pdf': new Set(['application/pdf', 'application/octet-stream']),
  '.txt': new Set(['text/plain', 'application/octet-stream']),
  '.md': new Set(['text/markdown', 'text/plain', 'application/octet-stream']),
  '.csv': new Set(['text/csv', 'text/plain', 'application/vnd.ms-excel', 'application/octet-stream']),
  '.doc': new Set(['application/msword', 'application/octet-stream']),
  '.docx': new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip', 'application/octet-stream']),
  '.xls': new Set(['application/vnd.ms-excel', 'application/octet-stream']),
  '.xlsx': new Set(['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip', 'application/octet-stream']),
  '.ppt': new Set(['application/vnd.ms-powerpoint', 'application/octet-stream']),
  '.pptx': new Set(['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/zip', 'application/octet-stream']),
  '.zip': new Set(['application/zip', 'application/x-zip-compressed', 'application/octet-stream']),
  '.mp4': new Set(['video/mp4', 'application/octet-stream']),
  '.m4v': new Set(['video/x-m4v', 'video/mp4', 'application/octet-stream']),
  '.mov': new Set(['video/quicktime', 'application/octet-stream']),
  '.mp3': new Set(['audio/mpeg', 'audio/mp3', 'application/octet-stream']),
  '.m4a': new Set(['audio/mp4', 'audio/x-m4a', 'application/octet-stream']),
  '.wav': new Set(['audio/wav', 'audio/x-wav', 'application/octet-stream']),
  '.ogg': new Set(['audio/ogg', 'application/ogg', 'application/octet-stream']),
};

export class TelegramBotAssetError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'TelegramBotAssetError';
    this.status = status;
    this.code = code;
  }
}

export interface TelegramBotAssetView {
  id: string;
  projectId: string;
  originalName: string;
  mediaType: Lowercase<BotAssetMediaType>;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: Date;
  updatedAt: Date;
}

function publicView(asset: {
  id: string;
  projectId: string;
  originalName: string;
  mediaType: BotAssetMediaType;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: Date;
  updatedAt: Date;
}): TelegramBotAssetView {
  return { ...asset, mediaType: asset.mediaType.toLowerCase() as Lowercase<BotAssetMediaType> };
}

function cleanFileName(value: string): string {
  const cleaned = [...path.basename(value).normalize('NFC')]
    .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
    .join('')
    .trim();
  return (cleaned || 'file').slice(0, 200);
}

function startsWith(buffer: Buffer, bytes: number[], offset = 0): boolean {
  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

function asciiAt(buffer: Buffer, value: string, offset = 0): boolean {
  return buffer.subarray(offset, offset + value.length).toString('ascii') === value;
}

function looksLikeText(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  if (sample.includes(0)) return false;
  const decoded = sample.toString('utf8');
  const replacementCount = decoded.split('\uFFFD').length - 1;
  return replacementCount <= Math.max(1, Math.floor(decoded.length * 0.02));
}

function hasExpectedSignature(extension: string, buffer: Buffer): boolean {
  if (extension === '.jpg' || extension === '.jpeg') return startsWith(buffer, [0xff, 0xd8, 0xff]);
  if (extension === '.png') return startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (extension === '.webp') return asciiAt(buffer, 'RIFF') && asciiAt(buffer, 'WEBP', 8);
  if (extension === '.pdf') return asciiAt(buffer, '%PDF');
  if (['.docx', '.xlsx', '.pptx', '.zip'].includes(extension)) return startsWith(buffer, [0x50, 0x4b]);
  if (['.doc', '.xls', '.ppt'].includes(extension)) {
    return startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  }
  if (['.txt', '.md', '.csv'].includes(extension)) return looksLikeText(buffer);
  if (['.mp4', '.m4v', '.mov', '.m4a'].includes(extension)) return asciiAt(buffer, 'ftyp', 4);
  if (extension === '.mp3') {
    return asciiAt(buffer, 'ID3') || (buffer[0] === 0xff && buffer.length > 1 && (buffer[1] & 0xe0) === 0xe0);
  }
  if (extension === '.wav') return asciiAt(buffer, 'RIFF') && asciiAt(buffer, 'WAVE', 8);
  if (extension === '.ogg') return asciiAt(buffer, 'OggS');
  return false;
}

function validateUpload(input: {
  mediaType: BotAssetMediaType;
  originalName: string;
  mimeType: string;
  buffer: Buffer;
}): { originalName: string; mimeType: string } {
  const originalName = cleanFileName(input.originalName);
  const extension = path.extname(originalName).toLowerCase();
  const mimeType = input.mimeType.split(';')[0].trim().toLowerCase() || 'application/octet-stream';
  const maxBytes = input.mediaType === 'IMAGE'
    ? Math.min(TELEGRAM_IMAGE_MAX_BYTES, TELEGRAM_ASSET_MAX_BYTES)
    : TELEGRAM_ASSET_MAX_BYTES;

  if (input.buffer.length === 0) throw new TelegramBotAssetError('Пустой файл нельзя загрузить', 400, 'TELEGRAM_ASSET_EMPTY');
  if (input.buffer.length > maxBytes) {
    throw new TelegramBotAssetError(`Файл превышает лимит ${Math.floor(maxBytes / 1024 / 1024)} MB`, 413, 'TELEGRAM_ASSET_TOO_LARGE');
  }
  if (!MEDIA_EXTENSIONS[input.mediaType].has(extension)) {
    throw new TelegramBotAssetError('Формат файла не соответствует выбранному типу медиа', 400, 'TELEGRAM_ASSET_EXTENSION_NOT_ALLOWED');
  }
  if (!MIME_BY_EXTENSION[extension]?.has(mimeType)) {
    throw new TelegramBotAssetError('MIME-тип файла не соответствует расширению', 400, 'TELEGRAM_ASSET_MIME_MISMATCH');
  }
  if (!hasExpectedSignature(extension, input.buffer)) {
    throw new TelegramBotAssetError('Содержимое файла не соответствует расширению', 400, 'TELEGRAM_ASSET_SIGNATURE_MISMATCH');
  }
  return { originalName, mimeType };
}

async function assertOwnedBot(userId: string, botId: string): Promise<void> {
  const bot = await prisma.telegramBot.findFirst({
    where: { id: botId, userId, deletedAt: null },
    select: { id: true },
  });
  if (!bot) throw new TelegramBotAssetError('Бот не найден', 404, 'TELEGRAM_BOT_NOT_FOUND');
}

async function assertOwnedProject(userId: string, projectId: string): Promise<void> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId, status: { not: 'ARCHIVED' } },
    select: { id: true },
  });
  if (!project) throw new TelegramBotAssetError('Проект не найден', 404, 'PROJECT_NOT_FOUND');
}

function referencesAsset(definition: Prisma.JsonValue, assetId: string): boolean {
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) return false;
  const nodes = (definition as Record<string, Prisma.JsonValue>).nodes;
  return Array.isArray(nodes) && nodes.some((node) => (
    node !== null
    && typeof node === 'object'
    && !Array.isArray(node)
    && (node as Record<string, Prisma.JsonValue>).type === 'send_media'
    && (node as Record<string, Prisma.JsonValue>).assetId === assetId
  ));
}

const assetSelect = {
  id: true,
  projectId: true,
  originalName: true,
  mediaType: true,
  mimeType: true,
  sizeBytes: true,
  sha256: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.BotAssetSelect;

export const telegramBotAssetService = {
  async upload(userId: string, botId: string, projectId: string, mediaType: BotAssetMediaType, file: {
    originalname: string;
    mimetype: string;
    buffer: Buffer;
  }): Promise<TelegramBotAssetView> {
    await Promise.all([assertOwnedBot(userId, botId), assertOwnedProject(userId, projectId)]);
    const valid = validateUpload({
      mediaType,
      originalName: file.originalname,
      mimeType: file.mimetype,
      buffer: file.buffer,
    });
    const asset = await prisma.botAsset.create({
      data: {
        userId,
        projectId,
        originalName: valid.originalName,
        mediaType,
        mimeType: valid.mimeType,
        sizeBytes: file.buffer.length,
        sha256: createHash('sha256').update(file.buffer).digest('hex'),
        content: Uint8Array.from(file.buffer),
      },
      select: assetSelect,
    });
    return publicView(asset);
  },

  async list(userId: string, botId: string, projectId: string): Promise<TelegramBotAssetView[]> {
    await Promise.all([assertOwnedBot(userId, botId), assertOwnedProject(userId, projectId)]);
    const assets = await prisma.botAsset.findMany({
      where: { userId, projectId, deletedAt: null },
      select: assetSelect,
      orderBy: { createdAt: 'desc' },
    });
    return assets.map(publicView);
  },

  async download(userId: string, botId: string, assetId: string) {
    await assertOwnedBot(userId, botId);
    const asset = await prisma.botAsset.findFirst({
      where: { id: assetId, userId, deletedAt: null },
      select: { ...assetSelect, content: true },
    });
    if (!asset) throw new TelegramBotAssetError('Файл не найден', 404, 'TELEGRAM_ASSET_NOT_FOUND');
    return asset;
  },

  async getForDelivery(userId: string, projectId: string, assetId: string, mediaType: BotAssetMediaType) {
    const asset = await prisma.botAsset.findFirst({
      where: { id: assetId, userId, projectId, mediaType, deletedAt: null },
      select: { ...assetSelect, content: true },
    });
    if (!asset) throw new TelegramBotAssetError('Файл сценария недоступен', 404, 'TELEGRAM_ASSET_NOT_FOUND');
    const content = Buffer.from(asset.content);
    if (content.length !== asset.sizeBytes || createHash('sha256').update(content).digest('hex') !== asset.sha256) {
      throw new TelegramBotAssetError('Целостность файла нарушена', 409, 'TELEGRAM_ASSET_INTEGRITY_FAILED');
    }
    return { ...asset, content };
  },

  async remove(userId: string, botId: string, assetId: string): Promise<void> {
    await assertOwnedBot(userId, botId);
    const asset = await prisma.botAsset.findFirst({
      where: { id: assetId, userId, deletedAt: null },
      select: { id: true, projectId: true },
    });
    if (!asset) throw new TelegramBotAssetError('Файл не найден', 404, 'TELEGRAM_ASSET_NOT_FOUND');
    const versions = await prisma.botScenarioVersion.findMany({
      where: { scenario: { userId, projectId: asset.projectId, archivedAt: null } },
      select: { definition: true },
    });
    if (versions.some((version) => referencesAsset(version.definition, assetId))) {
      throw new TelegramBotAssetError('Файл используется в сценарии и не может быть удалён', 409, 'TELEGRAM_ASSET_IN_USE');
    }
    const removed = await prisma.botAsset.updateMany({
      where: { id: assetId, userId, projectId: asset.projectId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (removed.count !== 1) throw new TelegramBotAssetError('Файл не найден', 404, 'TELEGRAM_ASSET_NOT_FOUND');
  },
};

export const telegramBotAssetInternals = {
  cleanFileName,
  hasExpectedSignature,
  referencesAsset,
  validateUpload,
};
