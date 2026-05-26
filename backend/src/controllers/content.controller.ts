import { Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

const ALLOWED_TYPES = ['POST', 'REEL', 'ARTICLE', 'VIDEO_SCRIPT', 'CHATBOT_CHAIN', 'OTHER'] as const;

const createSchema = z.object({
  projectId: z.string().uuid(),
  type:      z.enum(ALLOWED_TYPES),
  title:     z.string().max(500).optional(),
  content:   z.string(),
  platform:  z.string().max(100).optional(),
  isMock:    z.boolean().optional(),
  metadata:  z.record(z.unknown()).optional(),
});

const updateSchema = z.object({
  title:    z.string().max(500).optional(),
  content:  z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

async function assertProjectOwner(userId: string, projectId: string): Promise<boolean> {
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { userId: true } });
  return !!p && p.userId === userId;
}

async function linkArtifactToContent(input: {
  userId: string;
  projectId: string;
  contentId: string;
  contentType: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const artifactId = typeof input.metadata?.artifactId === 'string' ? input.metadata.artifactId : null;
  if (!artifactId) return;

  const artifact = await prisma.aIArtifact.findFirst({
    where: { id: artifactId, userId: input.userId, projectId: input.projectId },
    select: { id: true, metadata: true },
  });
  if (!artifact) return;

  const currentMetadata = artifact.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata)
    ? artifact.metadata as Record<string, unknown>
    : {};

  await prisma.aIArtifact.update({
    where: { id: artifact.id },
    data: {
      metadata: {
        ...currentMetadata,
        linkedContentId: input.contentId,
        linkedContentType: input.contentType,
        linkedAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    },
  });
}

export const contentController = {
  async history(req: AuthRequest, res: Response): Promise<void> {
    const limit  = Math.min(parseInt((req.query.limit as string) || '50', 10), 200);
    const offset = parseInt((req.query.offset as string) || '0', 10);
    try {
      const items = await prisma.generatedText.findMany({
        where: { project: { userId: req.userId! } },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        include: { project: { select: { name: true } } },
      });
      const result = items.map(({ project, ...item }) => ({
        ...item,
        projectName: project.name,
      }));
      res.json({ items: result });
    } catch (err) {
      console.error('[Content] history:', err);
      res.status(500).json({ error: 'Ошибка при загрузке истории' });
    }
  },

  async list(req: AuthRequest, res: Response): Promise<void> {
    const { projectId, type } = req.query as { projectId?: string; type?: string };
    if (!projectId) { res.status(400).json({ error: 'projectId обязателен' }); return; }
    const owned = await assertProjectOwner(req.userId!, projectId);
    if (!owned) { res.status(403).json({ error: 'Нет доступа' }); return; }
    try {
      const items = await prisma.generatedText.findMany({
        where: {
          projectId,
          ...(type ? { type: type as typeof ALLOWED_TYPES[number] } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });
      res.json({ items });
    } catch (err) {
      console.error('[Content] list:', err);
      res.status(500).json({ error: 'Ошибка при загрузке контента' });
    }
  },

  async create(req: AuthRequest, res: Response): Promise<void> {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0].message }); return; }
    const { projectId, type, title, content, platform, isMock, metadata } = parsed.data;
    const owned = await assertProjectOwner(req.userId!, projectId);
    if (!owned) { res.status(403).json({ error: 'Нет доступа' }); return; }
    try {
      const item = await prisma.generatedText.create({
        data: {
          projectId,
          type,
          title:    title ?? null,
          content,
          provider: platform ?? null,
          isMock:   isMock ?? false,
          metadata: metadata ? (metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
      });
      await linkArtifactToContent({ userId: req.userId!, projectId, contentId: item.id, contentType: type, metadata });
      res.status(201).json({ item });
    } catch (err) {
      console.error('[Content] create:', err);
      res.status(500).json({ error: 'Ошибка при сохранении контента' });
    }
  },

  async update(req: AuthRequest, res: Response): Promise<void> {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0].message }); return; }
    const id = req.params.id as string;
    try {
      const existing = await prisma.generatedText.findUnique({ where: { id } });
      if (!existing) { res.status(404).json({ error: 'Не найдено' }); return; }
      const owned = await assertProjectOwner(req.userId!, existing.projectId);
      if (!owned) { res.status(403).json({ error: 'Нет доступа' }); return; }
      const { title, content, metadata } = parsed.data;
      const item = await prisma.generatedText.update({
        where: { id },
        data: {
          ...(title     !== undefined ? { title }   : {}),
          ...(content   !== undefined ? { content } : {}),
          ...(metadata  !== undefined ? { metadata: metadata as Prisma.InputJsonValue } : {}),
        },
      });
      await linkArtifactToContent({ userId: req.userId!, projectId: existing.projectId, contentId: item.id, contentType: item.type, metadata });
      res.json({ item });
    } catch (err) {
      console.error('[Content] update:', err);
      res.status(500).json({ error: 'Ошибка при обновлении контента' });
    }
  },

  async remove(req: AuthRequest, res: Response): Promise<void> {
    const id = req.params.id as string;
    try {
      const existing = await prisma.generatedText.findUnique({ where: { id } });
      if (!existing) { res.status(404).json({ error: 'Не найдено' }); return; }
      const owned = await assertProjectOwner(req.userId!, existing.projectId);
      if (!owned) { res.status(403).json({ error: 'Нет доступа' }); return; }
      await prisma.generatedText.delete({ where: { id } });
      res.json({ ok: true });
    } catch (err) {
      console.error('[Content] remove:', err);
      res.status(500).json({ error: 'Ошибка при удалении' });
    }
  },
};
