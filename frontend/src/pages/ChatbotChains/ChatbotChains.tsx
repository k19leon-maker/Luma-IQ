import s from '../ProductMain/ProductMain.module.css';

export default function ChatbotChains() {
  return (
    <div className={s.root}>
      <div className={s.placeholder}>
        <div className={s.icon}>🤖</div>
        <h2 className={s.title}>Цепочка текстов</h2>
        <p className={s.desc}>
          Генерируйте автоматические цепочки сообщений для чат-бота: приветствие,
          прогрев, презентация продукта, закрытие на консультацию.
        </p>
        <button className={s.btn}>Начать</button>
      </div>
    </div>
  );
}
