import { useState } from 'react';
import toast from 'react-hot-toast';
import { paymentApi } from '../../api/projects.api';
import { useAuthStore } from '../../store/auth.store';

interface Plan {
  key:      'PRO' | 'ANNUAL';
  name:     string;
  price:    string;
  period:   string;
  save?:    string;
  features: string[];
}

const PLANS: Plan[] = [
  {
    key:     'PRO',
    name:    'Pro',
    price:   '990 ₽',
    period:  'в месяц',
    features: [
      'Безлимитные AI-генерации',
      'Все разделы стратегии',
      'Контент-план и экспорт',
      'История генераций',
      'Поддержка по email',
    ],
  },
  {
    key:     'ANNUAL',
    name:    'Pro Годовой',
    price:   '7 990 ₽',
    period:  'в год',
    save:    'Экономия 2 месяца',
    features: [
      'Всё из Pro',
      '2 месяца бесплатно',
      'Приоритетная поддержка',
    ],
  },
];

export default function Pricing() {
  const user    = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState<string | null>(null);

  async function handleBuy(plan: 'PRO' | 'ANNUAL') {
    if (!user) { toast.error('Необходима авторизация'); return; }
    setLoading(plan);
    try {
      const { confirmationUrl } = await paymentApi.createPayment(plan);
      window.location.href = confirmationUrl;
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Ошибка при создании платежа';
      toast.error(msg);
    } finally {
      setLoading(null);
    }
  }

  const s: Record<string, React.CSSProperties> = {
    page:    { background: '#F5F4F0', minHeight: '100%', padding: '48px 24px' },
    title:   { fontSize: 28, fontWeight: 600, color: '#1a1a1a', textAlign: 'center', marginBottom: 8 },
    sub:     { color: '#888', fontSize: 15, textAlign: 'center', marginBottom: 48 },
    grid:    { display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap' },
    card:    { background: '#fff', borderRadius: 16, padding: '32px 28px', width: 300, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' },
    planName:{ fontSize: 18, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 },
    price:   { fontSize: 32, fontWeight: 700, color: '#D4A847', marginBottom: 2 },
    period:  { fontSize: 13, color: '#888', marginBottom: 4 },
    save:    { display: 'inline-block', background: '#FFF3CD', color: '#856404', borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 500, marginBottom: 20 },
    features:{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 8 },
    feature: { fontSize: 14, color: '#555', display: 'flex', alignItems: 'center', gap: 8 },
    btn:     { width: '100%', background: '#D4A847', color: '#fff', border: 'none', borderRadius: 8, padding: '12px', fontSize: 15, fontWeight: 500, cursor: 'pointer' },
    btnDisabled: { width: '100%', background: '#e8d498', color: '#fff', border: 'none', borderRadius: 8, padding: '12px', fontSize: 15, fontWeight: 500, cursor: 'not-allowed' },
  };

  return (
    <div style={s.page}>
      <h1 style={s.title}>Тарифы LumaIQ</h1>
      <p style={s.sub}>Выберите план, который подходит вам</p>

      <div style={s.grid}>
        {/* Free plan */}
        <div style={{ ...s.card, border: '1px solid #E5E3DC' }}>
          <div style={s.planName}>Бесплатный</div>
          <div style={s.price}>0 ₽</div>
          <div style={s.period}>навсегда</div>
          <div style={{ height: 26 }} />
          <ul style={s.features}>
            {['Базовые функции стратегии', 'До 5 AI-генераций в день', 'Один проект'].map((f) => (
              <li key={f} style={s.feature}><span>✓</span> {f}</li>
            ))}
          </ul>
          <div style={{ ...s.btn, background: '#F5F4F0', color: '#888', cursor: 'default', textAlign: 'center', borderRadius: 8, padding: '12px', fontSize: 15 }}>
            Текущий план
          </div>
        </div>

        {PLANS.map((plan) => (
          <div key={plan.key} style={{ ...s.card, border: '2px solid #D4A847' }}>
            <div style={s.planName}>{plan.name}</div>
            <div style={s.price}>{plan.price}</div>
            <div style={s.period}>{plan.period}</div>
            {plan.save && <span style={s.save}>{plan.save}</span>}
            {!plan.save && <div style={{ height: 26 }} />}
            <ul style={s.features}>
              {plan.features.map((f) => (
                <li key={f} style={s.feature}><span style={{ color: '#D4A847' }}>✓</span> {f}</li>
              ))}
            </ul>
            <button
              style={loading === plan.key ? s.btnDisabled : s.btn}
              onClick={() => handleBuy(plan.key)}
              disabled={!!loading}
            >
              {loading === plan.key ? 'Переход к оплате...' : 'Купить'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
