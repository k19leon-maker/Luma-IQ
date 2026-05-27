import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { emailService } from './email.service';

type CheckStatus = 'ok' | 'warn' | 'fail';

interface HealthCheck {
  status: CheckStatus;
  details?: Record<string, unknown>;
}

function configured(value: string): HealthCheck {
  return value ? { status: 'ok' } : { status: 'warn', details: { configured: false } };
}

export const healthService = {
  async deep() {
    const checks: Record<string, HealthCheck> = {};

    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.db = { status: 'ok' };
    } catch (err) {
      checks.db = { status: 'fail', details: { message: err instanceof Error ? err.message : 'unknown' } };
    }

    checks.openai = configured(env.OPENAI_API_KEY);
    checks.anthropic = configured(env.ANTHROPIC_API_KEY);
    checks.smtp = emailService.isConfigured()
      ? { status: 'ok' }
      : {
        status: env.isProd && env.REGISTRATION_ENABLED ? 'fail' : 'warn',
        details: { configured: false, required: env.REGISTRATION_ENABLED },
      };

    try {
      const missingPricingAlerts = await prisma.aIUsageEvent.count({
        where: {
          eventType: 'FAILED',
          metadata: { path: ['code'], equals: 'MODEL_PRICING_MISSING' },
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      });
      checks.modelPricing = missingPricingAlerts > 0
        ? { status: 'warn', details: { missingPricingAlerts24h: missingPricingAlerts } }
        : { status: 'ok' };
    } catch {
      checks.modelPricing = { status: 'warn' };
    }

    const status: CheckStatus = Object.values(checks).some((check) => check.status === 'fail')
      ? 'fail'
      : Object.values(checks).some((check) => check.status === 'warn') ? 'warn' : 'ok';

    return {
      status,
      service: 'lumaiq-backend',
      timestamp: new Date().toISOString(),
      checks,
    };
  },
};
