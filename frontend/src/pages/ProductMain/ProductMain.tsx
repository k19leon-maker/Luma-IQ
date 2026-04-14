import s from './ProductMain.module.css';

export default function ProductMain() {
  return (
    <div className={s.root}>
      <div className={s.placeholder}>
        <div className={s.icon}>🚀</div>
        <h2 className={s.title}>Основной продукт</h2>
        <p className={s.desc}>
          Создайте флагманскую программу на основе стратегии: структура,
          цена, формат, результат для клиента.
        </p>
        <button className={s.btn}>Начать</button>
      </div>
    </div>
  );
}
