import { Request, Response } from 'express';
import { z } from 'zod';
import { legalConsentSchema, logConsent } from '../services/consent-log.service';

const publicConsentSchema = z.object({
  email: z.string().email('Неверный формат email').optional(),
  source: z.string().min(1).max(80).default('public_form'),
  consents: legalConsentSchema,
});

export const consentController = {
  async logPublicConsent(req: Request, res: Response): Promise<void> {
    const parsed = publicConsentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }

    await logConsent({
      req,
      email: parsed.data.email,
      consents: parsed.data.consents,
      source: parsed.data.source,
    });

    res.status(201).json({ ok: true });
  },
};
