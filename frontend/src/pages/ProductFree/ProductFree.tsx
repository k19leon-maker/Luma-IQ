import s from '../ProductMain/ProductMain.module.css';

export default function ProductFree() {
  return (
    <div className={s.root}>
      <div className={s.placeholder}>
        <div className={s.icon}>🎁</div>
        <h2 className={s.title}>Бесплатный продукт</h2>
        <p className={s.desc}>
          Создайте лид-магнит или бесплатный входной продукт, который привлекает
          целевую аудиторию и демонстрирует вашу экспертность.
        </p>
        <button className={s.btn}>Начать</button>
      </div>
    </div>
  );
}
