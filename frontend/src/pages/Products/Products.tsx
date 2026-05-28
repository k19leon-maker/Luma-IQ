import s from './Products.module.css';

const tiers = [
  { id: 'lead', icon: '🎁', label: 'Лид-магнит', desc: 'Бесплатный входной продукт для привлечения аудитории' },
  { id: 'mini', icon: '⚡', label: 'Мини-продукт', desc: 'Недорогой платный продукт для конвертации в клиентов' },
  { id: 'main', icon: '🚀', label: 'Основной продукт', desc: 'Флагманская программа — главное предложение эксперта' },
];

export default function Products() {
  return (
    <div className={s.root}>
      <div className={s.header}>
        <h2 className={s.title}>Продукты КПТ</h2>
        <button className={s.btn}>+ Создать продукт</button>
      </div>
      <div className={s.grid}>
        {tiers.map((tier) => (
          <div key={tier.id} className={s.card}>
            <div className={s.cardIcon}>{tier.icon}</div>
            <div className={s.cardLabel}>{tier.label}</div>
            <div className={s.cardDesc}>{tier.desc}</div>
            <button className={s.cardBtn}>Начать →</button>
          </div>
        ))}
      </div>
    </div>
  );
}
