import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

const SAFE_REQUEST_ID = /^[a-zA-Z0-9._:-]{1,128}$/;

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id')?.trim();
  const requestId = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();

  res.locals.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
}

export function requestIdFrom(res: Response): string {
  return typeof res.locals.requestId === 'string' ? res.locals.requestId : randomUUID();
}
