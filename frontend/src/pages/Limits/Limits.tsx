import { useEffect, useState } from 'react';
import { paymentApi } from '../../api/projects.api';
import {
  FRONTEND_PLAN_LIMITS,
  PLAN_LABELS,
  SubscriptionInfo,
  formatAccessUntil,
  formatLimitNumber,
  normalizePlan,
} from '../../utils/planLimits';
import s from './Limits.module.css';

export default function Limits() {
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    paymentApi.getSubscription()
      .then((next) => {
        if (!cancelled) setSubscription(next);
      })
      .catch(() => {
        if (!cancelled) setSubscription(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const plan = normalizePlan(subscription?.plan);
  const limits = FRONTEND_PLAN_LIMITS[plan];
  const status = subscription?.status ?? 'ACTIVE';
  const inactive = status !== 'ACTIVE';

  return (
    <div className={s.root}>
      <div className={s.header}>
        <div>
          <h2 className={s.title}>Лимиты</h2>
          <p className={s.subtitle}>
            Сейчас показаны лимиты тарифа. Фактические остатки credits и usage подключим после доработки backend-учета.
          </p>
        </div>
        <div className={`${s.planCard}${inactive ? ' ' + s.planCardWarning : ''}`}>
          <span>{loading ? 'Загрузка' : PLAN_LABELS[plan]}</span>
          <strong>{inactive ? 'доступ неактивен' : formatAccessUntil(subscription?.expiresAt ?? null)}</strong>
        </div>
      </div>

      <div className={s.grid}>
        <div className={s.limitCard}>
          <span className={s.limitLabel}>Credits</span>
          <strong className={s.limitValue}>{formatLimitNumber(limits.monthlyCredits)}</strong>
          <span className={s.limitHint}>в месяц</span>
        </div>
        <div className={s.limitCard}>
          <span className={s.limitLabel}>AI-генерации</span>
          <strong className={s.limitValue}>{formatLimitNumber(limits.dailyGenerationLimit)}</strong>
          <span className={s.limitHint}>в день</span>
        </div>
        <div className={s.limitCard}>
          <span className={s.limitLabel}>AI-чат</span>
          <strong className={s.limitValue}>{formatLimitNumber(limits.chatDailyLimit)}</strong>
          <span className={s.limitHint}>сообщений в день</span>
        </div>
        <div className={s.limitCard}>
          <span className={s.limitLabel}>Проекты</span>
          <strong className={s.limitValue}>{formatLimitNumber(limits.projectLimit)}</strong>
          <span className={s.limitHint}>активных проектов</span>
        </div>
      </div>

      <div className={s.note}>
        <h3>Что добавим следующим этапом</h3>
        <p>
          Остаток credits, сколько уже потрачено за период, дату обновления месячного лимита и предупреждения перед исчерпанием.
        </p>
      </div>
    </div>
  );
}
