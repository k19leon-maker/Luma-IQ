import s from './ProductMini.module.css';

export default function ProductMini() {
  return (
    <div className={s.root}>
      <div className={s.placeholder}>
        <div className={s.icon}>⚡</div>
        <h2 className={s.title}>Короткий продукт</h2>
        <p className={s.desc}>
          Недорогой входной продукт: мини-курс, консультация или интенсив.
          Снижает барьер для первой покупки.
        </p>
        <button className={s.btn}>Начать</button>
      </div>
    </div>
  );
}
