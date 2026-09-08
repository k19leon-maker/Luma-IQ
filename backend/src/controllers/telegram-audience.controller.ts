import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.middleware';
import { TelegramAudienceError, telegramAudienceService } from '../services/telegram-audience.service';

const botParams = z.object({ botId: z.string().uuid() });
const subscriberParams = botParams.extend({ subscriberId: z.string().uuid() });
const subscriberFilters = z.object({
  status: z.enum(['ACTIVE', 'STOPPED', 'BLOCKED', 'ARCHIVED']).optional(),
  search: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
}).strict();
const exportFilters = subscriberFilters.omit({ limit: true, offset: true });
const analyticsFilters = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  projectId: z.string().uuid().optional(),
}).strict().refine((value) => !value.from || !value.to || new Date(value.from) <= new Date(value.to), {
  message: 'Начало периода должно быть раньше окончания',
});

function fail(res: Response, error: unknown): void {
  if (error instanceof TelegramAudienceError) {
    res.status(error.status).json({ error: error.code, message: error.message });
    return;
  }
  console.error('[TelegramAudience] request failed', error instanceof Error ? error.message : 'unknown');
  res.status(500).json({ error: 'TELEGRAM_AUDIENCE_REQUEST_FAILED', message: 'Не удалось загрузить данные аудитории' });
}

export const telegramAudienceController = {
  async list(req: AuthRequest, res: Response): Promise<void> {
    const params = botParams.safeParse(req.params);
    const query = subscriberFilters.safeParse(req.query);
    if (!params.success || !query.success) {
      res.status(400).json({ error: 'INVALID_TELEGRAM_AUDIENCE_QUERY' });
      return;
    }
    try {
      res.json(await telegramAudienceService.listSubscribers(req.userId!, params.data.botId, query.data));
    } catch (error) { fail(res, error); }
  },

  async get(req: AuthRequest, res: Response): Promise<void> {
    const params = subscriberParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: 'INVALID_TELEGRAM_SUBSCRIBER_ID' });
      return;
    }
    try {
      res.json({ subscriber: await telegramAudienceService.getSubscriber(req.userId!, params.data.botId, params.data.subscriberId) });
    } catch (error) { fail(res, error); }
  },

  async analytics(req: AuthRequest, res: Response): Promise<void> {
    const params = botParams.safeParse(req.params);
    const query = analyticsFilters.safeParse(req.query);
    if (!params.success || !query.success) {
      res.status(400).json({ error: 'INVALID_TELEGRAM_ANALYTICS_QUERY' });
      return;
    }
    try {
      res.json(await telegramAudienceService.analytics(req.userId!, params.data.botId, {
        ...(query.data.from ? { from: new Date(query.data.from) } : {}),
        ...(query.data.to ? { to: new Date(query.data.to) } : {}),
        ...(query.data.projectId ? { projectId: query.data.projectId } : {}),
      }));
    } catch (error) { fail(res, error); }
  },

  async exportCsv(req: AuthRequest, res: Response): Promise<void> {
    const params = botParams.safeParse(req.params);
    const query = exportFilters.safeParse(req.query);
    if (!params.success || !query.success) {
      res.status(400).json({ error: 'INVALID_TELEGRAM_AUDIENCE_QUERY' });
      return;
    }
    try {
      const result = await telegramAudienceService.exportSubscribersCsv(req.userId!, params.data.botId, query.data);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${result.fileName.replace(/[^A-Za-z0-9._-]/g, '_')}"`);
      res.setHeader('X-Exported-Rows', String(result.rows));
      res.send(result.csv);
    } catch (error) { fail(res, error); }
  },
};
