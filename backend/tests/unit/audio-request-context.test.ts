import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import {
  requestContext,
  requestIdFrom,
} from '../../src/middleware/request-context.middleware';
import {
  audioIpRateLimitKey,
  audioUserRateLimitKey,
} from '../../src/routes/audio.routes';

describe('audio request context and rate-limit keys', () => {
  it('returns and preserves a safe correlation ID', () => {
    const setHeader = vi.fn();
    const req = {
      header: vi.fn(() => 'voice-request-123'),
    } as unknown as Request;
    const res = {
      locals: {},
      setHeader,
    } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    requestContext(req, res, next);

    expect(requestIdFrom(res)).toBe('voice-request-123');
    expect(setHeader).toHaveBeenCalledWith('X-Request-ID', 'voice-request-123');
    expect(next).toHaveBeenCalledOnce();
  });

  it('uses the authenticated user independently from the IP guardrail', () => {
    const req = {
      userId: 'user-42',
      ip: '203.0.113.10',
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as Request;

    expect(audioUserRateLimitKey(req)).toBe('user:user-42');
    expect(audioIpRateLimitKey(req)).toBe('203.0.113.10');
  });
});
