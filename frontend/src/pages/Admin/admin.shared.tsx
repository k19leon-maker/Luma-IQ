import type { ReactNode } from 'react';
import type { AdminCommercialPlan, AdminSubscriptionPlan } from '../../api/admin.api';
import s from './Admin.module.css';

export type Page = 'dashboard' | 'users' | 'usage' | 'subscriptions' | 'ai' | 'projects' | 'workflows' | 'prompts' | 'errors' | 'settings' | 'user-detail';
export type SortKey = 'aiCostUsd' | 'tokens' | 'ltv' | 'lastActivityAt' | 'createdAt' | 'aiRequestCount';

export const PAGES: Array<{ id: Page; label: string }> = [
  { id: 'dashboard', label: 'Дашборд' },
  { id: 'users', label: 'Пользователи' },
  { id: 'usage', label: 'Расходы AI' },
  { id: 'subscriptions', label: 'Подписки' },
  { id: 'ai', label: 'AI-аналитика' },
  { id: 'projects', label: 'Проекты' },
  { id: 'workflows', label: 'Workflow' },
  { id: 'prompts', label: 'Промпты' },
  { id: 'errors', label: 'Ошибки' },
  { id: 'settings', label: 'Настройки' },
];

export const COMMERCIAL_PLAN_OPTIONS: Array<{ value: AdminCommercialPlan; label: string }> = [
  { value: 'START', label: 'Start' },
  { value: 'PRO', label: 'Pro' },
  { value: 'EXPERT', label: 'Expert' },
  { value: 'SUPPORT', label: 'Support' },
  { value: 'MARKETING_PARTNER', label: 'Marketing Partner' },
  { value: 'IMPLEMENTATION', label: 'Implementation' },
];

export const SUBSCRIPTION_PLAN_OPTIONS: Array<{ value: AdminSubscriptionPlan; label: string }> = [
  { value: 'FREE', label: 'Free' },
  ...COMMERCIAL_PLAN_OPTIONS,
  { value: 'ANNUAL', label: 'Annual (legacy)' },
];

export const PAYMENT_SOURCE_OPTIONS = [
  { value: 'TRIBUTE', label: 'Tribute' },
  { value: 'MANUAL', label: 'Ручная оплата' },
  { value: 'PROMO', label: 'Промо / пилот' },
] as const;

export function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
}

export function fmtMoney(value: number, currency: 'RUB' | 'USD' = 'RUB'): string {
  if (currency === 'USD') return `$${value.toFixed(2)}`;
  return `${Math.round(value).toLocaleString('ru-RU')} ₽`;
}

export function fmtTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 100) / 10}K`;
  return String(value);
}

export function planClass(plan: string): string {
  if (plan !== 'FREE') return `${s.badge} ${s.badgePro}`;
  return s.badge;
}

export function statusClass(status: string): string {
  if (status === 'ACTIVE') return `${s.badge} ${s.badgeSuccess}`;
  if (status === 'EXPIRED' || status === 'FAILED') return `${s.badge} ${s.badgeDanger}`;
  return s.badge;
}

export function fmtRole(role: string): string {
  return role === 'ADMIN' ? 'Администратор' : 'Пользователь';
}

export function fmtStatus(status: string): string {
  if (status === 'ACTIVE') return 'Активен';
  if (status === 'EXPIRED') return 'Истек';
  if (status === 'FAILED') return 'Ошибка';
  if (status === 'CANCELED' || status === 'CANCELLED') return 'Отменен';
  return status;
}

export function archiveClass(archivedAt: string | null): string {
  return archivedAt ? `${s.badge} ${s.badgeMuted}` : `${s.badge} ${s.badgeSuccess}`;
}

export function MetricCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className={s.metricCard}>
      <div className={s.metricLabel}>{label}</div>
      <div className={s.metricValue}>{value}</div>
      {hint && <div className={s.metricHint}>{hint}</div>}
    </div>
  );
}

export function BreakdownBar({ label, value, max, right }: { label: string; value: number; max: number; right: string }) {
  const width = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div className={s.breakdownRow}>
      <div className={s.breakdownTop}>
        <span>{label}</span>
        <strong>{right}</strong>
      </div>
      <div className={s.barTrack}><div className={s.barFill} style={{ width: `${width}%` }} /></div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className={s.field}>
      <span className={s.fieldLabel}>{label}</span>
      {children}
      {hint && <span className={s.fieldHint}>{hint}</span>}
    </label>
  );
}
