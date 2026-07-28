import { FormEvent, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { billingApi } from '../../api/billing.api';
import { landingContent, landingPlanUiCopy } from '../../config/landing-content';
import { trackEvent, trackOncePerSession } from '../../utils/analytics';
import { useSeo } from '../../utils/seo';
import styles from './PlatformLanding.module.css';
import {
  LandingFooter,
  LandingHeader,
  LandingMain,
  LandingPlan,
} from './sections/LandingSections';

type LeadForm = {
  name: string;
  email: string;
  contact: string;
  plan: string;
  comment: string;
};

function formatPrice(value: number) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);
}

export default function PlatformLanding() {
  const [plans, setPlans] = useState<LandingPlan[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [leadForm, setLeadForm] = useState<LeadForm>({
    name: '',
    email: '',
    contact: '',
    plan: 'Старт',
    comment: '',
  });

  useSeo({
    title: landingContent.seo.title,
    description: landingContent.seo.description,
    canonical: landingContent.seo.canonical,
    type: 'website',
  });

  useEffect(() => {
    billingApi.listPlans()
      .then((backendPlans) => {
        setPlans(backendPlans
          .filter((plan) => plan.scenario === 'self')
          .map((plan) => ({
            id: plan.id,
            name: plan.name,
            price: plan.priceMonthlyRub,
            period: landingPlanUiCopy.period,
            description: plan.shortDescription,
            features: [
              landingPlanUiCopy.aiBalanceFeature(formatPrice(plan.aiBalanceTotal ?? 0)),
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
      .catch(() => setPlans([]));
  }, []);

  useEffect(() => {
    if (plans.length > 0) {
      trackOncePerSession('platform_pricing_view', 'pricing_viewed', {
        plans_count: plans.length,
        source: 'platform',
      });
    }
  }, [plans.length]);

  const primaryCtaLabel = useMemo(() => {
    const prices = plans.filter((plan) => plan.purchasable).map((plan) => plan.price);
    if (prices.length === 0) return landingContent.cta.selectPlan;
    return `${landingContent.cta.startFrom} ${formatPrice(Math.min(...prices))} ₽`;
  }, [plans]);

  const openLeadModal = (plan: LandingPlan) => {
    if (!plan.purchasable) return;
    trackEvent('plan_selected', {
      plan_code: plan.id,
      plan_name: plan.name,
      price_rub: plan.price,
      ai_points: plan.aiPoints,
      active_projects_limit: plan.projectsLimit,
      source: 'platform',
    });
    setLeadForm((current) => ({ ...current, plan: plan.name }));
    setModalOpen(true);
  };

  const submitLead = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setModalOpen(false);
    toast.success(landingContent.leadModal.success);
    setLeadForm({ name: '', email: '', contact: '', plan: 'Старт', comment: '' });
  };

  return (
    <div className={styles.page}>
      <LandingHeader primaryCtaLabel={primaryCtaLabel} />
      <LandingMain plans={plans} primaryCtaLabel={primaryCtaLabel} onPlanSelect={openLeadModal} />
      <LandingFooter />

      {modalOpen && (
        <div className={styles.modalOverlay} role="presentation" onMouseDown={() => setModalOpen(false)}>
          <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="lead-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className={styles.modalClose} type="button" aria-label="Закрыть" onClick={() => setModalOpen(false)}>×</button>
            <h2 id="lead-title">{landingContent.leadModal.title}</h2>
            <p>{landingContent.leadModal.description}</p>
            <form className={styles.leadForm} onSubmit={submitLead}>
              <label>
                {landingContent.leadModal.fields.name}
                <input value={leadForm.name} onChange={(event) => setLeadForm({ ...leadForm, name: event.target.value })} required />
              </label>
              <label>
                {landingContent.leadModal.fields.email}
                <input type="email" value={leadForm.email} onChange={(event) => setLeadForm({ ...leadForm, email: event.target.value })} required />
              </label>
              <label>
                {landingContent.leadModal.fields.contact}
                <input value={leadForm.contact} onChange={(event) => setLeadForm({ ...leadForm, contact: event.target.value })} required />
              </label>
              <label>
                {landingContent.leadModal.fields.plan}
                <select value={leadForm.plan} onChange={(event) => setLeadForm({ ...leadForm, plan: event.target.value })}>
                  {plans.map((plan) => <option key={plan.id} value={plan.name}>{plan.name}</option>)}
                </select>
              </label>
              <label>
                {landingContent.leadModal.fields.comment}
                <textarea value={leadForm.comment} onChange={(event) => setLeadForm({ ...leadForm, comment: event.target.value })} rows={4} />
              </label>
              <button className={styles.primaryButton} type="submit">{landingContent.leadModal.submit}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
