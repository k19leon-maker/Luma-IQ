import { NextFunction, Request, Response } from 'express';
import { errorMonitoringService } from '../services/error-monitoring.service';
import { AuthRequest } from './auth.middleware';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  void errorMonitoringService.captureException(err, {
    path: req.path,
    method: req.method,
    userId: (req as AuthRequest).userId ?? null,
  });

  const status = typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status?: unknown }).status === 'number'
    ? (err as { status: number }).status
    : 500;
  const message = err instanceof Error ? err.message : 'Внутренняя ошибка сервера';
  if (status < 500 && typeof err === 'object' && err !== null && 'code' in err) {
    const details = err as {
      code?: string;
      limitType?: string;
      current?: number;
      limit?: number;
      planId?: string;
    };
    res.status(status).json({
      error: details.code ?? message,
      message,
      limitType: details.limitType,
      current: details.current,
      limit: details.limit,
      planId: details.planId,
    });
    return;
  }
  res.status(status).json({ error: status >= 500 ? 'Внутренняя ошибка сервера' : message });
}
