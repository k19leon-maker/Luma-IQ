import s from './Tariff.module.css';

const plans = [
  {
    id: 'free',
    name: 'Бесплатный',
    price: '0 ₽',
    period: 'навсегда',
    features: ['5 запросов к ИИ в месяц', '1 продукт', 'Базовые шаблоны'],
    current: true,
  },
  {
    id: 'pro',
    name: 'Про',
    price: '1 490 ₽',
    period: 'в месяц',
    features: ['Безлимитные запросы к ИИ', 'Все продукты КПТ', 'Все шаблоны', 'Приоритетная поддержка'],
    current: false,
  },
  {
    id: 'business',
    name: 'Бизнес',
    price: '3 990 ₽',
    period: 'в месяц',
    features: ['Всё из Про', 'Несколько проектов', 'API доступ', 'Командная работа'],
    current: false,
  },
];

export default function Tariff() {
  return (
    <div className={s.root}>
      <div className={s.header}>
        <h2 className={s.title}>Тарифы и оплата</h2>
      </div>
      <div className={s.grid}>
        {plans.map((plan) => (
          <div key={plan.id} className={`${s.card}${plan.current ? ' ' + s.current : ''}`}>
            {plan.current && <div className={s.badge}>Текущий</div>}
            <div className={s.planName}>{plan.name}</div>
            <div className={s.price}>
              <span className={s.priceValue}>{plan.price}</span>
              <span className={s.pricePeriod}>{plan.period}</span>
            </div>
            <ul className={s.features}>
              {plan.features.map((f) => (
                <li key={f} className={s.feature}>
                  <span className={s.check}>✓</span> {f}
                </li>
              ))}
            </ul>
            <button className={s.btn} disabled={plan.current}>
              {plan.current ? 'Активен' : 'Выбрать'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
