import { useEffect, useState } from 'react';
import { billingApi, type BillingMe } from '../../api/billing.api';
import {
  formatAccessUntil,
  formatLimitNumber,
} from '../../utils/planLimits';
import s from './Limits.module.css';

export default function Limits() {
  const [billing, setBilling] = useState<BillingMe | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    billingApi.getMe()
      .then((next) => {
        if (!cancelled) setBilling(next);
      })
      .catch(() => {
        if (!cancelled) setBilling(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const limits = billing?.limits;
  const usage = billing?.usage;

  return (
    <div className={s.root}>
      <div className={s.header}>
        <div>
          <h2 className={s.title}>Лимиты</h2>
          <p className={s.subtitle}>
            Остатки credits, AI-генераций и рабочих лимитов за текущий период.
          </p>
        </div>
        <div className={s.planCard}>
          <span>{loading ? 'Загрузка' : billing?.plan.name ?? 'Start'}</span>
          <strong>{billing ? `до ${formatAccessUntil(billing.period.currentPeriodEnd)}` : 'текущий период'}</strong>
        </div>
      </div>

      <div className={s.grid}>
        <div className={s.limitCard}>
          <span className={s.limitLabel}>Credits осталось</span>
          <strong className={s.limitValue}>{formatLimitNumber(usage?.creditsRemaining ?? 0)}</strong>
          <span className={s.limitHint}>из {formatLimitNumber(limits?.monthlyCredits ?? 0)}</span>
        </div>
        <div className={s.limitCard}>
          <span className={s.limitLabel}>AI-генерации осталось</span>
          <strong className={s.limitValue}>{formatLimitNumber(usage?.aiGenerationsRemaining ?? 0)}</strong>
          <span className={s.limitHint}>из {formatLimitNumber(limits?.monthlyAiGenerationsLimit ?? 0)} в месяц</span>
        </div>
        <div className={s.limitCard}>
          <span className={s.limitLabel}>AI-чат сегодня</span>
          <strong className={s.limitValue}>{formatLimitNumber(usage?.aiMessagesRemainingToday ?? 0)}</strong>
          <span className={s.limitHint}>из {formatLimitNumber(limits?.dailyAiMessagesLimit ?? 0)} сообщений</span>
        </div>
        <div className={s.limitCard}>
          <span className={s.limitLabel}>Проекты осталось</span>
          <strong className={s.limitValue}>{formatLimitNumber(usage?.projectsRemaining ?? 0)}</strong>
          <span className={s.limitHint}>из {formatLimitNumber(limits?.projectsLimit ?? 0)}</span>
        </div>
        <div className={s.limitCard}>
          <span className={s.limitLabel}>Контент-единицы</span>
          <strong className={s.limitValue}>{formatLimitNumber(usage?.contentUnitsRemaining ?? 0)}</strong>
          <span className={s.limitHint}>из {formatLimitNumber(limits?.monthlyContentUnits ?? 0)} в месяц</span>
        </div>
        <div className={s.limitCard}>
          <span className={s.limitLabel}>Тяжелые генерации</span>
          <strong className={s.limitValue}>{formatLimitNumber(usage?.heavyGenerationsRemaining ?? 0)}</strong>
          <span className={s.limitHint}>из {formatLimitNumber(limits?.heavyGenerationsLimit ?? 0)}</span>
        </div>
        <div className={s.limitCard}>
          <span className={s.limitLabel}>YouTube-сценарии</span>
          <strong className={s.limitValue}>{formatLimitNumber(usage?.youtubeScriptsRemaining ?? 0)}</strong>
          <span className={s.limitHint}>из {formatLimitNumber(limits?.youtubeScriptsLimit ?? 0)}</span>
        </div>
        <div className={s.limitCard}>
          <span className={s.limitLabel}>Лонгриды</span>
          <strong className={s.limitValue}>{formatLimitNumber(usage?.longreadsRemaining ?? 0)}</strong>
          <span className={s.limitHint}>из {formatLimitNumber(limits?.longreadsLimit ?? 0)}</span>
        </div>
      </div>

      <div className={s.note}>
        <h3>Текущий период</h3>
        <p>
          Использовано {formatLimitNumber(usage?.creditsUsed ?? 0)} credits и {formatLimitNumber(usage?.contentUnitsUsed ?? 0)} контент-единиц.
          Лимиты обновятся {billing ? formatAccessUntil(billing.period.currentPeriodEnd) : 'в следующем периоде'}.
        </p>
      </div>
    </div>
  );
}
