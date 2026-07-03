import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.middleware';
import { onboardingService } from '../services/onboarding.service';

const onboardingDataSchema = z.object({
  projectName: z.string().max(200).optional(),
  projectShortDescription: z.string().max(3000).optional(),
  targetAudience: z.string().max(3000).optional(),
  products: z.string().max(3000).optional(),
  strengths: z.string().max(3000).optional(),
}).partial();

const progressSchema = z.object({
  onboardingStep: z.number().int().min(0).max(5),
  onboardingData: onboardingDataSchema.optional().default({}),
});

const completeSchema = z.object({
  projectId: z.string().uuid().optional(),
  onboardingData: onboardingDataSchema.optional().default({}),
});

const eventSchema = z.object({
  type: z.enum(['onboarding_tasks_route_clicked', 'onboarding_about_route_clicked']),
  metadata: z.record(z.unknown()).optional(),
});

export const onboardingController = {
  async state(req: AuthRequest, res: Response): Promise<void> {
    try {
      const state = await onboardingService.getState(req.userId!);
      res.json({ onboarding: state });
    } catch (err) {
      console.error('[Onboarding] state:', err);
      res.status((err as { status?: number }).status ?? 500).json({ error: 'Ошибка при загрузке onboarding' });
    }
  },

  async progress(req: AuthRequest, res: Response): Promise<void> {
    const parsed = progressSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    try {
      const user = await onboardingService.saveProgress(
        req.userId!,
        parsed.data.onboardingStep,
        parsed.data.onboardingData,
      );
      res.json({ user });
    } catch (err) {
      console.error('[Onboarding] progress:', err);
      res.status((err as { status?: number }).status ?? 500).json({ error: 'Не удалось сохранить прогресс. Проверьте подключение и попробуйте ещё раз.' });
    }
  },

  async skip(req: AuthRequest, res: Response): Promise<void> {
    const parsed = z.object({ onboardingData: onboardingDataSchema.optional().default({}) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    try {
      const user = await onboardingService.skip(req.userId!, parsed.data.onboardingData);
      res.json({ user, recommendedRoute: '/app/strategy/about' });
    } catch (err) {
      console.error('[Onboarding] skip:', err);
      res.status((err as { status?: number }).status ?? 500).json({ error: 'Не удалось сохранить прогресс. Проверьте подключение и попробуйте ещё раз.' });
    }
  },

  async complete(req: AuthRequest, res: Response): Promise<void> {
    const parsed = completeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    try {
      const result = await onboardingService.complete(
        req.userId!,
        parsed.data.onboardingData,
        parsed.data.projectId,
      );
      res.json(result);
    } catch (err) {
      console.error('[Onboarding] complete:', err);
      res.status((err as { status?: number }).status ?? 500).json({ error: 'Не удалось создать проект. Попробуйте ещё раз.' });
    }
  },

  async event(req: AuthRequest, res: Response): Promise<void> {
    const parsed = eventSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    try {
      const { eventService } = await import('../services/event.service');
      await eventService.track(parsed.data.type, {
        userId: req.userId!,
        metadata: parsed.data.metadata,
      });
      res.json({ ok: true });
    } catch (err) {
      console.error('[Onboarding] event:', err);
      res.status(500).json({ error: 'Ошибка аналитики' });
    }
  },
};
