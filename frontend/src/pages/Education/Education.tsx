import s from './Education.module.css';

const modules = [
  { id: 1, title: 'Что такое JTBD', desc: 'Введение в фреймворк Jobs To Be Done', duration: '15 мин', done: false },
  { id: 2, title: 'Интервью с клиентом', desc: 'Как правильно задавать вопросы', duration: '20 мин', done: false },
  { id: 3, title: 'Создание продуктовой линейки', desc: 'Лид-магнит, мини, основной продукт', duration: '25 мин', done: false },
];

export default function Education() {
  return (
    <div className={s.root}>
      <div className={s.header}>
        <h2 className={s.title}>Обучение</h2>
      </div>
      <div className={s.list}>
        {modules.map((m) => (
          <div key={m.id} className={s.card}>
            <div className={s.cardNum}>{m.id}</div>
            <div className={s.cardBody}>
              <div className={s.cardTitle}>{m.title}</div>
              <div className={s.cardDesc}>{m.desc}</div>
            </div>
            <div className={s.cardMeta}>
              <span className={s.duration}>{m.duration}</span>
              <button className={s.startBtn}>Начать</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
