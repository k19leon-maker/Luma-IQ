import s from './ContentPlan.module.css';

const DAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

interface Card {
  id: string;
  type: 'post' | 'reels';
  title: string;
}

const DEMO_CARDS: Record<number, Card[]> = {
  0: [
    { id: 'c1', type: 'post',  title: 'Почему ссоры повторяются: 3 причины' },
    { id: 'c2', type: 'reels', title: 'Как не превращать разговор в скандал' },
  ],
  1: [
    { id: 'c3', type: 'post', title: 'История клиента: они были на грани развода' },
  ],
  2: [
    { id: 'c4', type: 'reels', title: 'Техника «стоп-пауза» за 60 секунд' },
  ],
  3: [
    { id: 'c5', type: 'post',  title: '5 фраз, которые разрушают доверие' },
    { id: 'c6', type: 'reels', title: 'Что чувствует партнёр, когда его не слышат' },
  ],
  4: [
    { id: 'c7', type: 'post', title: 'Кейс: восстановление близости за 8 недель' },
  ],
  5: [],
  6: [
    { id: 'c8', type: 'reels', title: 'Вопрос недели: идёте ли вы к психологу вместе?' },
  ],
};

const TYPE_LABEL: Record<Card['type'], string> = {
  post:  'Пост',
  reels: 'Рилс',
};

export default function ContentPlan() {
  return (
    <div className={s.root}>
      <div className={s.header}>
        <h2 className={s.title}>Контент-план на неделю</h2>
        <button className={s.addBtn}>+ Добавить материал</button>
      </div>

      <div className={s.board}>
        {DAYS.map((day, idx) => (
          <div key={day} className={s.column}>
            <div className={s.columnHeader}>
              <span className={s.dayName}>{day}</span>
              <span className={s.cardCount}>{DEMO_CARDS[idx]?.length ?? 0}</span>
            </div>

            <div className={s.cardList}>
              {(DEMO_CARDS[idx] ?? []).map((card) => (
                <div key={card.id} className={`${s.card} ${s[`card_${card.type}`]}`}>
                  <span className={s.cardType}>{TYPE_LABEL[card.type]}</span>
                  <p className={s.cardTitle}>{card.title}</p>
                </div>
              ))}

              {(DEMO_CARDS[idx] ?? []).length === 0 && (
                <div className={s.emptySlot}>— пусто —</div>
              )}
            </div>

            <button className={s.addCardBtn}>+ Добавить</button>
          </div>
        ))}
      </div>
    </div>
  );
}
