import { Response } from 'express';
import { INSTAGRAM_PACKAGING_LIMITS } from '../config/instagram-packaging';
import { AuthRequest } from '../middleware/auth.middleware';
import { saveInstagramPackagingSchema } from '../schemas/instagram-packaging.schema';
import { instagramPackagingService } from '../services/instagram-packaging.service';
import { instagramProfileReadinessService } from '../services/instagram-profile-readiness.service';

export const instagramPackagingController = {
  async get(req: AuthRequest, res: Response): Promise<void> {
    try {
      const result = await instagramPackagingService.get(req.userId!, req.params.id as string);
      if (!result) {
        res.status(404).json({ error: 'Проект не найден' });
        return;
      }
      const readiness = await instagramProfileReadinessService.get(req.userId!, req.params.id as string);
      res.json({ ...result, limits: INSTAGRAM_PACKAGING_LIMITS, readiness });
    } catch (error) {
      console.error('[InstagramPackaging] get:', error);
      res.status(500).json({ error: 'Не удалось загрузить упаковку Instagram' });
    }
  },

  async save(req: AuthRequest, res: Response): Promise<void> {
    const parsed = saveInstagramPackagingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Проверьте данные упаковки Instagram',
        details: parsed.error.flatten(),
        issues: parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }
    try {
      const packaging = await instagramPackagingService.save(
        req.userId!,
        req.params.id as string,
        parsed.data,
      );
      if (!packaging) {
        res.status(404).json({ error: 'Проект не найден' });
        return;
      }
      const readiness = await instagramProfileReadinessService.get(req.userId!, req.params.id as string);
      res.json({ packaging, source: 'current', limits: INSTAGRAM_PACKAGING_LIMITS, readiness });
    } catch (error) {
      console.error('[InstagramPackaging] save:', error);
      res.status(500).json({ error: 'Не удалось сохранить упаковку Instagram' });
    }
  },
};
