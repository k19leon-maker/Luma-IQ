import { Link } from 'react-router-dom';
import type { BillingMe } from '../../api/billing.api';
import { appPath } from '../../utils/appRoutes';
import { formatLimitNumber } from '../../utils/planLimits';
import s from './Layout.module.css';

interface SidebarBalanceProps {
  billing: BillingMe | null;
  loading: boolean;
  error: boolean;
}

export default function SidebarBalance({ billing, loading, error }: SidebarBalanceProps) {
  if (loading) {
    return (
      <div className={s.sidebarBalance} aria-live="polite">
        <span className={s.sidebarBalanceLabel}>AI-баланс</span>
        <span className={s.sidebarBalanceLoading}>Загрузка…</span>
      </div>
    );
  }

  if (error || !billing?.publicLimits) {
    return (
      <div className={s.sidebarBalance} aria-live="polite">
        <span className={s.sidebarBalanceLabel}>AI-баланс</span>
        <span className={s.sidebarBalanceError}>Временно недоступен</span>
      </div>
    );
  }

  const { aiBalanceRemaining, aiBalanceTotal } = billing.publicLimits;
  const availablePercent = aiBalanceTotal > 0
    ? Math.min(100, Math.max(0, (aiBalanceRemaining / aiBalanceTotal) * 100))
    : 0;
  const tone = aiBalanceRemaining <= 0
    ? s.sidebarBalanceEmpty
    : availablePercent < 15
      ? s.sidebarBalanceWarning
      : '';

  return (
    <div className={`${s.sidebarBalance}${tone ? ` ${tone}` : ''}`}>
      <div className={s.sidebarBalanceHeading}>
        <span className={s.sidebarBalanceLabel}>AI-баланс</span>
        <Link to={appPath('/limits')}>Подробнее</Link>
      </div>
      <strong>
        {formatLimitNumber(aiBalanceRemaining)} из {formatLimitNumber(aiBalanceTotal)}
      </strong>
      <div
        className={s.sidebarBalanceTrack}
        role="progressbar"
        aria-label="Оставшийся AI-баланс"
        aria-valuemin={0}
        aria-valuemax={aiBalanceTotal}
        aria-valuenow={Math.max(0, aiBalanceRemaining)}
      >
        <span style={{ width: `${availablePercent}%` }} />
      </div>
    </div>
  );
}
