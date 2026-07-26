import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { billingService } from '../services/billing.service';

export const billingController = {
  async plans(_req: AuthRequest, res: Response): Promise<void> {
    try {
      res.json({ plans: await billingService.listRuntimePlans() });
    } catch (err) {
      console.error('[Billing] plans:', err);
      res.status(500).json({ error: 'Ошибка при получении тарифов' });
    }
  },

  async me(req: AuthRequest, res: Response): Promise<void> {
    try {
      const billing = await billingService.getMyBilling(req.userId!);
      res.json(billing);
    } catch (err) {
      console.error('[Billing] me:', err);
      res.status(500).json({ error: 'Ошибка при получении тарифа и лимитов' });
    }
  },
};
