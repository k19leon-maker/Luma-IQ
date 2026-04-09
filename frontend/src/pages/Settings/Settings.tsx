import s from './Settings.module.css';

export default function Settings() {
  return (
    <div className={s.root}>
      <div className={s.header}>
        <h2 className={s.title}>Настройки</h2>
      </div>
      <div className={s.sections}>
        <div className={s.section}>
          <h3 className={s.sectionTitle}>Профиль</h3>
          <div className={s.field}>
            <label className={s.label}>Имя</label>
            <input className={s.input} type="text" placeholder="Ваше имя" />
          </div>
          <div className={s.field}>
            <label className={s.label}>Email</label>
            <input className={s.input} type="email" placeholder="email@example.com" />
          </div>
        </div>
        <div className={s.section}>
          <h3 className={s.sectionTitle}>ИИ-модель по умолчанию</h3>
          <div className={s.field}>
            <select className={s.select}>
              <option>ChatGPT (OpenAI)</option>
              <option>Claude (Anthropic)</option>
              <option>Gemini (Google)</option>
              <option>Grok (xAI)</option>
            </select>
          </div>
        </div>
        <button className={s.saveBtn}>Сохранить изменения</button>
      </div>
    </div>
  );
}
