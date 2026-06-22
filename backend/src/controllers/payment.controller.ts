import { Request, Response } from 'express';
import { z } from 'zod';
import { paymentService } from '../services/payment.service';
import { AuthRequest } from '../middleware/auth.middleware';
import { isValidPlanId, type PlanId } from '../config/pricing-plans';

const createSchema = z.object({
  plan: z.string().refine(isValidPlanId, 'Неизвестный тариф'),
});

export const paymentController = {
  async createPayment(req: AuthRequest, res: Response): Promise<void> {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    try {
      const result = await paymentService.createPayment(req.userId!, parsed.data.plan as PlanId);
      res.json(result);
    } catch (err) {
      const e = err as Error & { status?: number };
      res.status(e.status ?? 500).json({ error: e.message });
    }
  },

  async getSubscription(req: AuthRequest, res: Response): Promise<void> {
    try {
      const subscription = await paymentService.getSubscription(req.userId!);
      res.json({ subscription });
    } catch (err) {
      res.status(500).json({ error: 'Ошибка при получении подписки' });
    }
  },

  async webhook(req: Request, res: Response): Promise<void> {
    try {
      await paymentService.handleWebhook(req.body as Parameters<typeof paymentService.handleWebhook>[0]);
      res.json({ ok: true });
    } catch (err) {
      const e = err as Error & { status?: number };
      if (e.status === 404) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      console.error('[Payment] Webhook error:', err);
      res.status(e.status ?? 500).json({ error: 'Webhook processing failed' });
    }
  },
};
