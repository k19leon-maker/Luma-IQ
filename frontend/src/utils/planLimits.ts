/**
 * Commercial plan values come from GET /api/v1/billing/plans and /billing/me.
 * The frontend intentionally keeps no duplicate tariff catalog.
 */
export function formatLimitNumber(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value);
}
