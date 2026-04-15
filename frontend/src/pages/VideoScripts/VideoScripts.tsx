import s from '../ProductMain/ProductMain.module.css';

export default function VideoScripts() {
  return (
    <div className={s.root}>
      <div className={s.placeholder}>
        <div className={s.icon}>🎥</div>
        <h2 className={s.title}>Сценарии видео</h2>
        <p className={s.desc}>
          Создавайте готовые сценарии для YouTube, Telegram-видео и обучающих
          роликов — с крючком, основной частью и призывом к действию.
        </p>
        <button className={s.btn}>Начать</button>
      </div>
    </div>
  );
}
