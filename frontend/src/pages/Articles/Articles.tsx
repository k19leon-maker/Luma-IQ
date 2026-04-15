import s from '../ProductMain/ProductMain.module.css';

export default function Articles() {
  return (
    <div className={s.root}>
      <div className={s.placeholder}>
        <div className={s.icon}>📝</div>
        <h2 className={s.title}>Статьи</h2>
        <p className={s.desc}>
          Генерируйте экспертные статьи для блога, Telegram-канала или сайта
          на основе вашей стратегии и целевой аудитории.
        </p>
        <button className={s.btn}>Начать</button>
      </div>
    </div>
  );
}
