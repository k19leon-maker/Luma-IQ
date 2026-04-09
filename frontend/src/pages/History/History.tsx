import s from './History.module.css';

export default function History() {
  return (
    <div className={s.root}>
      <div className={s.header}>
        <h2 className={s.title}>История</h2>
      </div>
      <div className={s.empty}>
        <div className={s.emptyIcon}>🕐</div>
        <p className={s.emptyText}>История пуста</p>
        <p className={s.emptyHint}>Здесь будут отображаться все ваши запросы и сгенерированные материалы</p>
      </div>
    </div>
  );
}
