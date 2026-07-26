import { describe, expect, it } from 'vitest';
import {
  LEGACY_PLAN_IDS,
  PRICING_PLANS,
  PUBLIC_PAID_PLAN_IDS,
  isPurchasablePlanId,
} from '../../src/config/pricing-plans';
import { billingService } from '../../src/services/billing.service';
import { PLANS } from '../../src/services/payment.service';

describe('public billing catalog', () => {
  it('offers exactly the three current paid plans in the required order', () => {
    const plans = billingService.listPlans();
    expect(plans.map((plan) => plan.id)).toEqual([
      'START',
      'SYSTEM_FUNNEL',
      'EVERGREEN_FUNNEL',
    ]);
    expect(plans.every((plan) => plan.scenario === 'self')).toBe(true);
    expect(plans.every((plan) => !('aiCostBudgetRub' in plan))).toBe(true);
  });

  it.each([
    ['START', 'Старт', 7900, 5000, 1],
    ['SYSTEM_FUNNEL', 'Системная воронка', 12000, 10000, 3],
    ['EVERGREEN_FUNNEL', 'Вечная автоворонка', 19700, 20000, 5],
  ] as const)('%s has the required commercial terms', (id, name, price, points, projects) => {
    const plan = PRICING_PLANS[id];
    expect(plan.name).toBe(name);
    expect(plan.priceMonthlyRub).toBe(price);
    expect(plan.periodDays).toBe(30);
    expect(plan.limits.monthlyCredits).toBe(points);
    expect(plan.limits.projectsLimit).toBe(projects);
    expect(plan.public).toBe(true);
    expect(plan.purchasable).toBe(true);
  });

  it('marks System Funnel as optimal', () => {
    expect(PRICING_PLANS.SYSTEM_FUNNEL.badge).toBe('Оптимальный');
  });

  it('keeps legacy plans but prevents new purchases', () => {
    expect(PUBLIC_PAID_PLAN_IDS).toHaveLength(3);
    for (const id of LEGACY_PLAN_IDS) {
      expect(PRICING_PLANS[id].legacy).toBe(true);
      expect(PRICING_PLANS[id].public).toBe(false);
      expect(isPurchasablePlanId(id)).toBe(false);
    }
  });

  it('keeps examples informational instead of material quotas', () => {
    for (const id of PUBLIC_PAID_PLAN_IDS) {
      const plan = PRICING_PLANS[id];
      expect(plan.exampleUsage.length).toBeGreaterThan(0);
      expect(plan.usageDisclaimer).toContain('пример');
      expect(plan.limits.monthlyContentUnits).toBe(0);
    }
  });

  it('uses catalog prices in checkout definitions', () => {
    expect(PLANS.START.amount).toBe('7900.00');
    expect(PLANS.SYSTEM_FUNNEL.amount).toBe('12000.00');
    expect(PLANS.EVERGREEN_FUNNEL.amount).toBe('19700.00');
    expect(Object.keys(PLANS)).toEqual(PUBLIC_PAID_PLAN_IDS);
  });
});
