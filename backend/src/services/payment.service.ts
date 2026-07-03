import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { PRICING_PLANS, PlanId, isValidPlanId, toSubscriptionPlan } from '../config/pricing-plans';

const YOOKASSA_API = 'https://api.yookassa.ru/v3';

export const PLANS = {
  start: { amount: '12000.00', description: 'Luma IQ Start — 1 месяц', months: 1 },
  pro: { amount: '24000.00', description: 'Luma IQ Pro — 1 месяц', months: 1 },
  expert: { amount: '39000.00', description: 'Luma IQ Expert — 1 месяц', months: 1 },
  support: { amount: '39000.00', description: 'Luma IQ Support — 1 месяц', months: 1 },
  marketing_partner: { amount: '59000.00', description: 'Luma IQ Marketing Partner — 1 месяц', months: 1 },
  implementation: { amount: '89000.00', description: 'Luma IQ Implementation — 1 месяц', months: 1 },
} as const;

type PlanKey = PlanId;
type PlanPaymentDefinition = { amount: string; description: string; months: number };

async function ykRequest(method: string, path: string, body?: unknown) {
  const credentials = Buffer.from(`${env.YOOKASSA_SHOP_ID}:${env.YOOKASSA_SECRET_KEY}`).toString('base64');
  const response = await fetch(`${YOOKASSA_API}${path}`, {
    method,
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json',
      'Idempotence-Key': uuidv4(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`YooKassa error ${response.status}: ${err}`);
  }
  return response.json();
}

export const paymentService = {
  async createStartTestPayment(userId: string): Promise<{ confirmationUrl: string; paymentId: string }> {
    return this.createPaymentWithDefinition(userId, 'start', {
      amount: '20.00',
      description: 'Luma IQ Start — тестовый платеж 20 ₽',
      months: 1,
    }, { testPayment: true, originalPriceMonthlyRub: PRICING_PLANS.start.priceMonthlyRub });
  },

  async createPayment(userId: string, plan: PlanKey): Promise<{ confirmationUrl: string; paymentId: string }> {
    if (!isValidPlanId(plan)) {
      throw Object.assign(new Error('Неизвестный тариф'), { status: 400 });
    }

    return this.createPaymentWithDefinition(userId, plan, PLANS[plan], {
      priceMonthlyRub: PRICING_PLANS[plan].priceMonthlyRub,
    });
  },

  async createPaymentWithDefinition(
    userId: string,
    plan: PlanKey,
    planDef: PlanPaymentDefinition,
    metadata: Record<string, unknown>,
  ): Promise<{ confirmationUrl: string; paymentId: string }> {
    if (!env.YOOKASSA_ENABLED) {
      throw Object.assign(new Error('Онлайн-оплата временно отключена. Для пилотного доступа напишите администратору.'), { status: 503 });
    }

    if (!env.YOOKASSA_SHOP_ID || !env.YOOKASSA_SECRET_KEY) {
      throw Object.assign(new Error('Оплата временно недоступна'), { status: 503 });
    }

    const ykPayment = await ykRequest('POST', '/payments', {
      amount: { value: planDef.amount, currency: 'RUB' },
      confirmation: {
        type: 'redirect',
        return_url: env.YOOKASSA_RETURN_URL,
      },
      capture: true,
      description: planDef.description,
      metadata: { userId, plan, ...metadata },
    }) as { id: string; confirmation: { confirmation_url: string } };

    // Get or create subscription record
    let sub = await prisma.subscription.findUnique({ where: { userId } });
    if (!sub) {
      sub = await prisma.subscription.create({
        data: { userId, plan: 'START', status: 'ACTIVE' },
      });
    }

    await prisma.payment.create({
      data: {
        userId,
        subscriptionId: sub.id,
        yookassaId: ykPayment.id,
        amount: planDef.amount,
        status: 'PENDING',
        metadata: { plan, ...metadata },
      },
    });

    return {
      paymentId: ykPayment.id,
      confirmationUrl: ykPayment.confirmation.confirmation_url,
    };
  },

  async handleWebhook(event: { type?: string; event?: string; object: { id: string; status: string; metadata?: { userId?: string; plan?: string } } }): Promise<void> {
    if (!env.YOOKASSA_ENABLED) {
      throw Object.assign(new Error('YooKassa webhook disabled'), { status: 404 });
    }

    if ((event.type ?? event.event) !== 'payment.succeeded') return;

    const { id: yookassaId, metadata } = event.object;
    if (!metadata?.userId || !metadata.plan) return;

    const plan = metadata.plan as PlanKey;
    const planDef = isValidPlanId(plan) ? PLANS[plan] : null;
    if (!planDef) return;

    const payment = await prisma.payment.findUnique({ where: { yookassaId } });
    if (!payment || payment.status === 'SUCCEEDED') return;

    await prisma.payment.update({ where: { yookassaId }, data: { status: 'SUCCEEDED' } });

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + planDef.months);

    await prisma.subscription.upsert({
      where: { userId: metadata.userId },
      create: { userId: metadata.userId, plan: toSubscriptionPlan(plan), status: 'ACTIVE', expiresAt, yookassaId },
      update: { plan: toSubscriptionPlan(plan), status: 'ACTIVE', expiresAt, yookassaId },
    });
  },

  async getSubscription(userId: string) {
    const sub = await prisma.subscription.findUnique({ where: { userId } });
    if (!sub) return { plan: 'START', status: 'ACTIVE', expiresAt: null };

    // Auto-expire
    if (sub.expiresAt && sub.expiresAt < new Date() && sub.status === 'ACTIVE') {
      await prisma.subscription.update({ where: { userId }, data: { status: 'EXPIRED' } });
      return { plan: 'START', status: 'EXPIRED', expiresAt: sub.expiresAt };
    }

    return { plan: sub.plan, status: sub.status, expiresAt: sub.expiresAt };
  },
};
