import s from './Audience.module.css';

export default function Audience() {
  return (
    <div className={s.root}>
      <div className={s.header}>
        <h2 className={s.title}>Целевая аудитория</h2>
        <button className={s.btn}>+ Новый аватар</button>
      </div>
      <div className={s.empty}>
        <div className={s.emptyIcon}>🎯</div>
        <p className={s.emptyText}>Аватары целевой аудитории не созданы</p>
        <p className={s.emptyHint}>Создайте первый аватар, чтобы персонализировать тексты и продукты</p>
      </div>
    </div>
  );
}
