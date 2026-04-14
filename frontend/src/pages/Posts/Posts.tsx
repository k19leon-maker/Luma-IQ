import s from './Posts.module.css';

export default function Posts() {
  return (
    <div className={s.root}>
      <div className={s.placeholder}>
        <div className={s.icon}>📱</div>
        <h2 className={s.title}>Посты</h2>
        <p className={s.desc}>
          Генерация текстов для социальных сетей: экспертные посты,
          истории, продающие тексты на основе вашей стратегии.
        </p>
        <button className={s.btn}>Начать</button>
      </div>
    </div>
  );
}
