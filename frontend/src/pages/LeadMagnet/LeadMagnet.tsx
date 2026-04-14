import s from './LeadMagnet.module.css';

export default function LeadMagnet() {
  return (
    <div className={s.root}>
      <div className={s.placeholder}>
        <div className={s.icon}>📄</div>
        <h2 className={s.title}>Лид-магнит</h2>
        <p className={s.desc}>
          Бесплатный материал для привлечения аудитории: гайд, чек-лист,
          мини-урок или бесплатная консультация.
        </p>
        <button className={s.btn}>Начать</button>
      </div>
    </div>
  );
}
