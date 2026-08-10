import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { billingApi } from '../../api/billing.api';
import { paymentApi } from '../../api/projects.api';
import { landingContent, landingPlanUiCopy } from '../../config/landing-content';
import { useAuthStore } from '../../store/auth.store';
import { trackEvent, trackOncePerSession } from '../../utils/analytics';
import { useSeo } from '../../utils/seo';
import styles from './PlatformLanding.module.css';
import { LandingFooter, LandingHeader, LandingMain, LandingPlan } from './sections/LandingSections';

type PublicPlanId = 'START' | 'SYSTEM_FUNNEL' | 'EVERGREEN_FUNNEL';

function formatNumber(value: number) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);
}

function getCheckoutErrorMessage(error: unknown) {
  if (axios.isAxiosError<{ error?: string }>(error)) {
    return error.response?.data?.error ?? 'Не удалось создать платеж';
  }
  return error instanceof Error ? error.message : 'Не удалось создать платеж';
}

export default function PlatformLanding() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [plans, setPlans] = useState<LandingPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [checkoutPlanId, setCheckoutPlanId] = useState<string | null>(null);

  useSeo({ ...landingContent.seo, type: 'website' });

  useEffect(() => {
    let cancelled = false;
    billingApi.listPlans()
      .then((backendPlans) => {
        if (cancelled) return;
        setPlans(backendPlans
          .filter((plan) => plan.scenario === 'self')
          .map((plan) => ({
            id: plan.id,
            name: plan.name,
            price: plan.priceMonthlyRub,
            period: landingPlanUiCopy.period,
            description: plan.shortDescription,
            features: [
              landingPlanUiCopy.aiBalanceFeature(formatNumber(plan.aiBalanceTotal ?? 0)),
              landingPlanUiCopy.projectsFeature(plan.projectsTotal ?? 0),
              landingPlanUiCopy.allToolsFeature,
            ],
            aiPoints: plan.aiBalanceTotal ?? 0,
            projectsLimit: plan.projectsTotal ?? 0,
            exampleUsage: plan.exampleUsage,
            usageDisclaimer: plan.usageDisclaimer,
            purchasable: plan.purchasable,
            badge: plan.badge ?? undefined,
            buttonText: landingPlanUiCopy.selectButton,
          })));
      })
      .catch(() => {
        if (!cancelled) toast.error('Не удалось загрузить тарифы');
      })
      .finally(() => {
        if (!cancelled) setPlansLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (plans.length > 0) {
      trackOncePerSession('platform_pricing_view', 'pricing_viewed', {
        plans_count: plans.length,
        source: 'platform',
      });
    }
  }, [plans.length]);

  async function handlePlanSelect(plan: LandingPlan) {
    if (!plan.purchasable || checkoutPlanId) return;
    const analytics = {
      plan_code: plan.id,
      plan_name: plan.name,
      price_rub: plan.price,
      ai_points: plan.aiPoints,
      active_projects_limit: plan.projectsLimit,
      source: 'platform',
    };
    trackEvent('plan_selected', analytics);

    if (!isAuthenticated) {
      toast.error('Чтобы оплатить тариф, войдите или зарегистрируйтесь');
      window.location.href = '/auth?next=%2Fapp%2Fpricing';
      return;
    }

    try {
      setCheckoutPlanId(plan.id);
      const payment = await paymentApi.createPayment(plan.id as PublicPlanId);
      trackEvent('payment_started', { ...analytics, payment_id: payment.paymentId });
      window.location.href = payment.confirmationUrl;
    } catch (error) {
      trackEvent('payment_failed', analytics);
      toast.error(getCheckoutErrorMessage(error));
      setCheckoutPlanId(null);
    }
  }

  return (
    <div className={styles.page}>
      <LandingHeader />
      <LandingMain
        plans={plans}
        plansLoading={plansLoading}
        checkoutPlanId={checkoutPlanId}
        onPlanSelect={handlePlanSelect}
      />
      <LandingFooter />
    </div>
  );
}
