import s from './Reels.module.css';

export default function Reels() {
  return (
    <div className={s.root}>
      <div className={s.placeholder}>
        <div className={s.icon}>🎬</div>
        <h2 className={s.title}>Рилсы</h2>
        <p className={s.desc}>
          Генерация сценариев и идей для коротких видео под вашу нишу
          и целевую аудиторию.
        </p>
        <button className={s.btn}>Начать</button>
      </div>
    </div>
  );
}
