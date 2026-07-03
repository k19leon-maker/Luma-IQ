import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { billingApi } from '../../api/billing.api';
import { paymentApi } from '../../api/projects.api';
import LegalInfoBlock from '../../components/LegalInfoBlock/LegalInfoBlock';
import { useAuthStore } from '../../store/auth.store';
import s from './Pricing.module.css';

type BillingScenario = 'self' | 'support';
type PaidPlanId = 'start' | 'pro' | 'expert' | 'support' | 'marketing_partner' | 'implementation';

type PricingPlan = {
  id: PaidPlanId | 'custom';
  scenario: BillingScenario;
  name: string;
  price: number;
  period: string;
  description: string;
  features: string[];
  badge?: string;
  buttonText: string;
};

const scenarioTabs: Array<{ id: BillingScenario; label: string }> = [
  { id: 'self', label: 'Самостоятельно' },
  { id: 'support', label: 'С сопровождением' },
];

const pricingPlans: PricingPlan[] = [
  {
    id: 'start',
    scenario: 'self',
    name: 'Start',
    price: 12000,
    period: 'в месяц',
    description: 'Для эксперта, который хочет собрать первую упаковку и начать регулярно делать контент',
    features: [
      '1 проект / 1 направление',
      'AI-разработка целевой аудитории и JTBD-сегмента',
      'Позиционирование',
      'Продуктовая линейка: бесплатный продукт, недорогой продукт, основной продукт',
      'Оффер для основного продукта',
      'Контент-план на 7 дней',
      'До 50 контент-единиц в месяц',
      'Посты для Telegram / VK',
      'Сценарии Reels / Shorts',
      'AI-чат по проекту',
      'База инструкций',
    ],
    buttonText: 'Выбрать Start',
  },
  {
    id: 'pro',
    scenario: 'self',
    name: 'Pro',
    price: 24000,
    period: 'в месяц',
    description: 'Для эксперта, который хочет системно вести контент и развивать несколько продуктов',
    features: [
      'До 3 проектов / направлений',
      'Расширенная AI-упаковка целевой аудитории',
      'Позиционирование под каждый сегмент',
      'Продуктовая линейка под каждый проект',
      'Офферы для продуктов',
      'Контент-план на 30 дней',
      'До 150 контент-единиц в месяц',
      'Посты, Reels, Shorts, Threads',
      'Сценарии YouTube-видео',
      'Прогревы на 5-7 дней',
      'AI-чат по каждому проекту',
      'Экспорт материалов',
    ],
    badge: 'Популярный',
    buttonText: 'Выбрать Pro',
  },
  {
    id: 'expert',
    scenario: 'self',
    name: 'Expert',
    price: 39000,
    period: 'в месяц',
    description: 'Для эксперта, у которого несколько направлений, продуктов или помощник в команде',
    features: [
      'До 7 проектов / направлений',
      'Глубокая упаковка каждого сегмента',
      'Несколько продуктовых линеек',
      'Офферы, лид-магниты, мини-продукты, основные продукты',
      'Контент-план на 30 дней по каждому проекту',
      'До 350 контент-единиц в месяц',
      'Посты, Reels, Shorts, Threads, YouTube',
      'Лонгриды и статьи',
      'Прогревы и мини-запуски',
      'Задачи по маркетингу внутри проекта',
      'Доступ для ассистента / сотрудника',
    ],
    buttonText: 'Выбрать Expert',
  },
  {
    id: 'support',
    scenario: 'support',
    name: 'Support',
    price: 39000,
    period: 'в месяц',
    description: 'Для эксперта, который хочет сам работать в сервисе, но получать обратную связь маркетолога',
    features: [
      'Всё из тарифа Pro',
      'До 3 проектов / направлений',
      'Проверка упаковки маркетологом',
      'Проверка продуктовой линейки',
      'Проверка офферов',
      'Обратная связь по контенту',
      'Помощь с контент-планом',
      '1 индивидуальный созвон в месяц',
      'Поддержка в чате',
      'Рекомендации по Telegram / VK',
      'План задач на месяц',
    ],
    buttonText: 'Выбрать Support',
  },
  {
    id: 'marketing_partner',
    scenario: 'support',
    name: 'Marketing Partner',
    price: 59000,
    period: 'в месяц',
    description: 'Для эксперта, которому нужен маркетолог рядом для регулярного внедрения',
    features: [
      'Всё из тарифа Expert',
      'До 5 проектов / направлений',
      'Совместная разработка стратегии',
      'Совместная сборка продуктовой линейки',
      'Совместная разработка офферов',
      'Контент-план на месяц',
      'Помощь в создании постов и сценариев',
      'Редактура контента маркетологом',
      '2-4 созвона в месяц',
      'Еженедельный план задач',
      'ТЗ на лендинг',
      'ТЗ на чатбот',
      'Рекомендации по оформлению соцсетей',
      'Поддержка в чате',
    ],
    badge: 'Оптимальный выбор',
    buttonText: 'Выбрать Marketing Partner',
  },
  {
    id: 'implementation',
    scenario: 'support',
    name: 'Implementation',
    price: 89000,
    period: 'в месяц',
    description: 'Для эксперта, который хочет, чтобы маркетолог активно помогал внедрять систему продвижения',
    features: [
      'Всё из тарифа Marketing Partner',
      'До 7 проектов / направлений',
      'Глубокая упаковка экспертности',
      'Разработка воронки',
      'Разработка лид-магнита / мини-продукта / практикума',
      'Контент-план на месяц',
      'Помощь в производстве контента',
      'Подготовка структуры лендинга',
      'Подготовка текстов для лендинга',
      'Помощь со сборкой чатбота во внешнем сервисе',
      'Помощь с упаковкой Telegram / VK',
      'Контроль внедрения по задачам',
      'Еженедельные созвоны',
      'Приоритетная поддержка',
    ],
    buttonText: 'Выбрать Implementation',
  },
];

const planAliases: Record<string, string> = {
  START: 'start',
  PRO: 'pro',
  EXPERT: 'expert',
  SUPPORT: 'support',
  MARKETING_PARTNER: 'marketing_partner',
  MARKETING_PARTNER_MONTHLY: 'marketing_partner',
  IMPLEMENTATION: 'implementation',
};

function formatPrice(value: number) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value) + ' ₽';
}

function normalizeActivePlan(value?: string | null) {
  if (!value) return null;
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, '_');
  return planAliases[normalized] ?? normalized.toLowerCase();
}

function getCheckoutErrorMessage(error: unknown) {
  if (axios.isAxiosError<{ error?: string }>(error)) {
    return error.response?.data?.error ?? 'Не удалось создать платеж';
  }
  return error instanceof Error ? error.message : 'Не удалось создать платеж';
}

export default function Pricing() {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [scenario, setScenario] = useState<BillingScenario>('self');
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PricingPlan | null>(null);
  const [checkoutPlanId, setCheckoutPlanId] = useState<PaidPlanId | null>(null);

  useEffect(() => {
    let cancelled = false;
    billingApi.getMe()
      .then((billing) => {
        if (cancelled) return;
        setActivePlanId(billing.plan.id);
      })
      .catch(() => {
        if (!cancelled) {
          const fallbackPlan = (user as { plan?: string; tariff?: string } | null)?.plan
            ?? (user as { plan?: string; tariff?: string } | null)?.tariff;
          setActivePlanId(normalizeActivePlan(fallbackPlan));
        }
      });
    return () => { cancelled = true; };
  }, [user]);

  const visiblePlans = useMemo(
    () => pricingPlans.filter((plan) => plan.scenario === scenario),
    [scenario],
  );

  async function handleSelectPlan(plan: PricingPlan) {
    if (activePlanId === plan.id) return;
    if (plan.id === 'custom') {
      setSelectedPlan(plan);
      return;
    }
    if (!isAuthenticated) {
      toast.error('Чтобы оплатить тариф, войдите или зарегистрируйтесь');
      window.location.href = '/auth';
      return;
    }

    try {
      setCheckoutPlanId(plan.id);
      const payment = await paymentApi.createPayment(plan.id);
      window.location.href = payment.confirmationUrl;
    } catch (error) {
      toast.error(getCheckoutErrorMessage(error));
      setCheckoutPlanId(null);
    }
  }

  function handleLeadSubmit() {
    if (!selectedPlan) return;
    toast.success('Заявка на подключение тарифа отправлена');
    setSelectedPlan(null);
  }

  return (
    <div className={s.page}>
      <header className={s.header}>
        <h1>Тарифы Luma IQ</h1>
        <p>Выберите формат работы: самостоятельно или с сопровождением маркетолога</p>
      </header>

      <div className={s.tabs} role="tablist" aria-label="Формат работы">
        {scenarioTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={scenario === tab.id}
            className={`${s.tab}${scenario === tab.id ? ' ' + s.tabActive : ''}`}
            onClick={() => setScenario(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <section className={s.grid} aria-live="polite">
        {visiblePlans.map((plan) => {
          const isCurrent = activePlanId === plan.id;
          const isCheckingOut = checkoutPlanId === plan.id;
          return (
            <article key={plan.id} className={`${s.card}${plan.badge ? ' ' + s.cardFeatured : ''}`}>
              <div className={s.cardTop}>
                <div>
                  <h2>{plan.name}</h2>
                  <p>{plan.description}</p>
                </div>
                {plan.badge && <span className={s.badge}>{plan.badge}</span>}
              </div>

              <div className={s.priceRow}>
                <span className={s.price}>{formatPrice(plan.price)}</span>
                <span className={s.period}>{plan.period}</span>
              </div>

              <ul className={s.features}>
                {plan.features.map((feature) => (
                  <li key={feature}>
                    <span className={s.check}>✓</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                className={isCurrent ? s.currentButton : s.primaryButton}
                disabled={isCurrent || isCheckingOut}
                onClick={() => handleSelectPlan(plan)}
              >
                {isCurrent ? 'Текущий тариф' : isCheckingOut ? 'Переходим к оплате...' : plan.buttonText}
              </button>
            </article>
          );
        })}
      </section>

      <section className={s.customBlock}>
        <div>
          <h2>Нужен индивидуальный формат?</h2>
          <p>
            Если вам нужно полностью делегировать упаковку, контент, лендинг, чатбот и внедрение воронки - оставьте заявку,
            и мы подберём формат сопровождения под вашу задачу.
          </p>
        </div>
        <button
          type="button"
          className={s.secondaryButton}
          onClick={() => setSelectedPlan({
            id: 'custom',
            scenario: 'support',
            name: 'Индивидуальный формат',
            price: 0,
            period: '',
            description: '',
            features: [],
            buttonText: 'Обсудить индивидуальный формат',
          })}
        >
          Обсудить индивидуальный формат
        </button>
      </section>

      <LegalInfoBlock className={s.legalFooter} />

      {selectedPlan && (
        <div className={s.modalOverlay} role="presentation" onMouseDown={() => setSelectedPlan(null)}>
          <div
            className={s.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pricing-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button type="button" className={s.closeButton} aria-label="Закрыть" onClick={() => setSelectedPlan(null)}>
              ×
            </button>
            <span className={s.modalEyebrow}>Заявка на подключение</span>
            <h2 id="pricing-modal-title">{selectedPlan.name}</h2>
            {selectedPlan.price > 0 && (
              <div className={s.modalPrice}>
                {formatPrice(selectedPlan.price)}
                <span>{selectedPlan.period}</span>
              </div>
            )}
            <p>
              Оплата тарифа будет подключена на следующем этапе. Сейчас вы можете оставить заявку на подключение.
            </p>
            <button type="button" className={s.primaryButton} onClick={handleLeadSubmit}>
              Оставить заявку
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
