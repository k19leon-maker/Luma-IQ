import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { billingApi, type BillingPlan } from '../../api/billing.api';
import { paymentApi } from '../../api/projects.api';
import LegalInfoBlock from '../../components/LegalInfoBlock/LegalInfoBlock';
import { useAuthStore } from '../../store/auth.store';
import { useSeo } from '../../utils/seo';
import { trackEvent, trackOncePerSession } from '../../utils/analytics';
import s from './Pricing.module.css';

type PublicPlanId = 'START' | 'SYSTEM_FUNNEL' | 'EVERGREEN_FUNNEL';

function formatPrice(value: number) {
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value)} ₽`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);
}

function getCheckoutErrorMessage(error: unknown) {
  if (axios.isAxiosError<{ error?: string }>(error)) {
    return error.response?.data?.error ?? 'Не удалось создать платеж';
  }
  return error instanceof Error ? error.message : 'Не удалось создать платеж';
}

function normalizeActivePlan(value?: string | null): string | null {
  if (!value) return null;
  return value.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function analyticsParams(plan: BillingPlan) {
  return {
    plan_code: plan.id,
    plan_name: plan.name,
    price_rub: plan.priceMonthlyRub,
    ai_points: plan.aiBalanceTotal,
    active_projects_limit: plan.projectsTotal,
  };
}

export default function Pricing() {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [checkoutPlanId, setCheckoutPlanId] = useState<PublicPlanId | null>(null);
  const [loading, setLoading] = useState(true);

  useSeo({
    title: 'Тарифы Luma IQ — AI-баллы и проекты',
    description: 'Тарифы Luma IQ: Старт, Системная воронка и Вечная автоворонка. Единый AI-баланс и полный доступ к инструментам.',
    canonical: '/app/pricing',
    type: 'website',
  });

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([billingApi.listPlans(), billingApi.getMe()])
      .then(([plansResult, billingResult]) => {
        if (cancelled) return;
        if (plansResult.status === 'fulfilled') setPlans(plansResult.value);
        if (billingResult.status === 'fulfilled') {
          setActivePlanId(normalizeActivePlan(billingResult.value.plan.id));
        } else {
          const fallback = (user as { plan?: string; tariff?: string } | null)?.plan
            ?? (user as { plan?: string; tariff?: string } | null)?.tariff;
          setActivePlanId(normalizeActivePlan(fallback));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!loading && plans.length > 0) {
      trackOncePerSession('pricing_view', 'pricing_viewed', { plans_count: plans.length });
    }
  }, [loading, plans.length]);

  async function handleSelectPlan(plan: BillingPlan) {
    const planId = plan.id as PublicPlanId;
    if (!plan.purchasable || activePlanId === planId || checkoutPlanId) return;
    if (!isAuthenticated) {
      trackEvent('plan_selected', analyticsParams(plan));
      toast.error('Чтобы оплатить тариф, войдите или зарегистрируйтесь');
      window.location.href = '/auth';
      return;
    }
    try {
      trackEvent('plan_selected', analyticsParams(plan));
      setCheckoutPlanId(planId);
      const payment = await paymentApi.createPayment(planId);
      trackEvent('payment_started', { ...analyticsParams(plan), payment_id: payment.paymentId });
      window.location.href = payment.confirmationUrl;
    } catch (error) {
      trackEvent('payment_failed', analyticsParams(plan));
      toast.error(getCheckoutErrorMessage(error));
      setCheckoutPlanId(null);
    }
  }

  return (
    <div className={s.page}>
      <header className={s.header}>
        <h1>Тарифы Luma IQ</h1>
        <p>Во всех тарифах доступны одни и те же инструменты. Выберите AI-баланс и количество активных проектов.</p>
      </header>

      <section className={s.grid} aria-busy={loading} aria-live="polite">
        {plans.map((plan) => {
          const isCurrent = activePlanId === plan.id;
          const isCheckingOut = checkoutPlanId === plan.id;
          return (
            <article key={plan.id} className={`${s.card}${plan.badge ? ` ${s.cardFeatured}` : ''}`}>
              <div className={s.cardTop}>
                <div>
                  <h2>{plan.name}</h2>
                  <p>{plan.shortDescription}</p>
                </div>
                {plan.badge && <span className={s.badge}>{plan.badge}</span>}
              </div>

              <div className={s.priceRow}>
                <span className={s.price}>{formatPrice(plan.priceMonthlyRub)}</span>
                <span className={s.period}>на 30 дней</span>
              </div>

              <ul className={s.features}>
                <li><span className={s.check}>✓</span><strong>{formatNumber(plan.aiBalanceTotal ?? 0)} AI-баллов</strong></li>
                <li>
                  <span className={s.check}>✓</span>
                  <strong>{plan.projectsTotal === 1 ? '1 активный проект' : `До ${plan.projectsTotal} активных проектов`}</strong>
                </li>
                <li><span className={s.check}>✓</span><span>Полный доступ к инструментам Luma IQ</span></li>
              </ul>

              <div className={s.usageExample}>
                <h3>Ориентировочно хватит на:</h3>
                <ul>
                  {plan.exampleUsage.map((item) => <li key={item}>{item}</li>)}
                </ul>
                <p>{plan.usageDisclaimer}</p>
              </div>

              <details className={s.details}>
                <summary>Подробнее о тарифе</summary>
                <p>{plan.extendedDescription}</p>
              </details>

              <button
                type="button"
                className={isCurrent ? s.currentButton : s.primaryButton}
                disabled={!plan.purchasable || isCurrent || isCheckingOut}
                onClick={() => handleSelectPlan(plan)}
              >
                {isCurrent
                  ? 'Текущий тариф'
                  : !plan.purchasable
                    ? 'Временно недоступен'
                    : isCheckingOut
                      ? 'Переходим к оплате...'
                      : activePlanId ? 'Перейти на тариф' : 'Выбрать тариф'}
              </button>
            </article>
          );
        })}
      </section>

      {!loading && plans.length === 0 && (
        <div className={s.emptyState}>Не удалось загрузить тарифы. Обновите страницу.</div>
      )}

      <section className={s.explanation}>
        <h2>Один баланс для всех AI-действий</h2>
        <p>
          AI-баллы можно самостоятельно распределять между стратегией, CustDev, продуктами, воронками,
          постами, Reels, статьями, видео и диалогом с ИИ. Примеры в карточках не являются отдельными квотами.
        </p>
      </section>

      <LegalInfoBlock />
    </div>
  );
}
