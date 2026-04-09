import s from './Texts.module.css';

const templates = [
  { id: 'post', label: 'Пост для соцсетей', icon: '📝' },
  { id: 'landing', label: 'Текст лендинга', icon: '🖥️' },
  { id: 'bio', label: 'Биография психолога', icon: '👤' },
  { id: 'offer', label: 'Описание услуги', icon: '💼' },
];

export default function Texts() {
  return (
    <div className={s.root}>
      <div className={s.header}>
        <h2 className={s.title}>Генерация текстов</h2>
      </div>
      <div className={s.grid}>
        {templates.map((t) => (
          <button key={t.id} className={s.card}>
            <span className={s.cardIcon}>{t.icon}</span>
            <span className={s.cardLabel}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
