import { describe, expect, it } from 'vitest';
import { billingService } from '../../src/services/billing.service';

describe('public billing catalog', () => {
  it('offers only three self-service plans and hides internal AI budgets', () => {
    const plans = billingService.listPlans();

    expect(plans.map((plan) => plan.id)).toEqual(['start', 'pro', 'expert']);
    expect(plans.every((plan) => plan.scenario === 'self')).toBe(true);
    expect(plans.every((plan) => !('aiCostBudgetRub' in plan))).toBe(true);
  });
});
