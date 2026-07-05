import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { isDemoProductText } from '../utils/demo-products';

const PRODUCT_TYPES = ['FREE', 'MINI', 'MAIN'] as const;

const createSchema = z.object({
  projectId:        z.string().uuid(),
  type:             z.enum(PRODUCT_TYPES),
  title:            z.string().max(500),
  format:           z.string().max(500).optional(),
  shortDescription: z.string().optional(),
  transformation:   z.string().optional(),
  offer:            z.string().optional(),
  priceText:        z.string().max(200).optional(),
  isAiGenerated:    z.boolean().optional(),
  content:          z.string().optional(),
});

const updateSchema = z.object({
  title:            z.string().max(500).optional(),
  format:           z.string().max(500).optional(),
  shortDescription: z.string().optional(),
  transformation:   z.string().optional(),
  offer:            z.string().optional(),
  priceText:        z.string().max(200).optional(),
  content:          z.string().optional(),
});

async function assertProjectOwner(userId: string, projectId: string): Promise<boolean> {
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { userId: true } });
  return !!p && p.userId === userId;
}

function productPayloadText(value: {
  title?: string | null;
  format?: string | null;
  shortDescription?: string | null;
  transformation?: string | null;
  offer?: string | null;
  priceText?: string | null;
  content?: string | null;
}): string {
  return [
    value.title,
    value.format,
    value.shortDescription,
    value.transformation,
    value.offer,
    value.priceText,
    value.content,
  ].filter(Boolean).join('\n');
}

async function deleteDemoProducts(projectId: string): Promise<void> {
  await prisma.product.deleteMany({
    where: {
      projectId,
      OR: [
        { title: { contains: '8 недель к близости', mode: 'insensitive' } },
        { title: { contains: 'Первый шаг', mode: 'insensitive' } },
        { title: { contains: '5 причин почему пары ссорятся', mode: 'insensitive' } },
        { title: { contains: '5 фраз', mode: 'insensitive' } },
        { shortDescription: { contains: '8 недель к близости', mode: 'insensitive' } },
        { shortDescription: { contains: 'разрушают доверие', mode: 'insensitive' } },
        { shortDescription: { contains: 'пар в кризисе', mode: 'insensitive' } },
        { shortDescription: { contains: 'групповая программа для пар', mode: 'insensitive' } },
      ],
    },
  });
}

export const productsController = {
  async list(req: AuthRequest, res: Response): Promise<void> {
    const { projectId, type } = req.query as { projectId?: string; type?: string };
    if (!projectId) { res.status(400).json({ error: 'projectId обязателен' }); return; }
    const owned = await assertProjectOwner(req.userId!, projectId);
    if (!owned) { res.status(403).json({ error: 'Нет доступа' }); return; }
    try {
      await deleteDemoProducts(projectId);
      const products = await prisma.product.findMany({
        where: {
          projectId,
          ...(type ? { type: type as typeof PRODUCT_TYPES[number] } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });
      res.json({ products: products.filter((product) => !isDemoProductText(productPayloadText(product))) });
    } catch (err) {
      console.error('[Products] list:', err);
      res.status(500).json({ error: 'Ошибка при загрузке продуктов' });
    }
  },

  async create(req: AuthRequest, res: Response): Promise<void> {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0].message }); return; }
    const { projectId, type, title, format, shortDescription, transformation, offer, priceText, isAiGenerated, content } = parsed.data;
    const owned = await assertProjectOwner(req.userId!, projectId);
    if (!owned) { res.status(403).json({ error: 'Нет доступа' }); return; }
    if (isDemoProductText(productPayloadText(parsed.data))) {
      res.status(400).json({ error: 'Демо-продукты больше не поддерживаются' });
      return;
    }
    try {
      const product = await prisma.product.create({
        data: {
          projectId,
          type,
          title,
          format:           format ?? null,
          shortDescription: shortDescription ?? content ?? null,
          transformation:   transformation ?? null,
          offer:            offer ?? null,
          priceText:        priceText ?? null,
          isAiGenerated:    isAiGenerated ?? false,
        },
      });
      res.status(201).json({ product });
    } catch (err) {
      console.error('[Products] create:', err);
      res.status(500).json({ error: 'Ошибка при создании продукта' });
    }
  },

  async update(req: AuthRequest, res: Response): Promise<void> {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0].message }); return; }
    const id = req.params.id as string;
    try {
      const existing = await prisma.product.findUnique({ where: { id } });
      if (!existing) { res.status(404).json({ error: 'Не найдено' }); return; }
      const owned = await assertProjectOwner(req.userId!, existing.projectId);
      if (!owned) { res.status(403).json({ error: 'Нет доступа' }); return; }
      const { title, format, shortDescription, transformation, offer, priceText, content } = parsed.data;
      if (isDemoProductText(productPayloadText({ ...existing, ...parsed.data }))) {
        await prisma.product.delete({ where: { id } });
        res.status(410).json({ error: 'Демо-продукт удалён' });
        return;
      }
      const product = await prisma.product.update({
        where: { id },
        data: {
          ...(title            !== undefined ? { title }            : {}),
          ...(format           !== undefined ? { format }           : {}),
          ...(transformation   !== undefined ? { transformation }   : {}),
          ...(offer            !== undefined ? { offer }            : {}),
          ...(priceText        !== undefined ? { priceText }        : {}),
          ...(shortDescription !== undefined ? { shortDescription } : {}),
          ...(content          !== undefined ? { shortDescription: content } : {}),
        },
      });
      res.json({ product });
    } catch (err) {
      console.error('[Products] update:', err);
      res.status(500).json({ error: 'Ошибка при обновлении продукта' });
    }
  },

  async remove(req: AuthRequest, res: Response): Promise<void> {
    const id = req.params.id as string;
    try {
      const existing = await prisma.product.findUnique({ where: { id } });
      if (!existing) { res.status(404).json({ error: 'Не найдено' }); return; }
      const owned = await assertProjectOwner(req.userId!, existing.projectId);
      if (!owned) { res.status(403).json({ error: 'Нет доступа' }); return; }
      await prisma.product.delete({ where: { id } });
      res.json({ ok: true });
    } catch (err) {
      console.error('[Products] remove:', err);
      res.status(500).json({ error: 'Ошибка при удалении продукта' });
    }
  },
};
