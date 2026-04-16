import { useState } from 'react';
import ContentWorkspace, { ContentMaterial, FormProps } from '../../components/ContentWorkspace/ContentWorkspace';
import s from '../../components/ContentWorkspace/ContentWorkspace.module.css';

// ─── Seed data ────────────────────────────────────────────────────────────────

const SEED: ContentMaterial[] = [
  {
    id: 'post-1',
    title: 'Почему пары ссорятся об одном и том же годами',
    preview: 'Вы снова спорите о грязных тарелках? Или о том, кто должен позвонить родителям? Это не про тарелки...',
    date: '12 апр 2026',
    status: 'ready',
    content: `Почему пары ссорятся об одном и том же годами

Вы снова спорите о грязных тарелках? Или о том, кто должен позвонить родителям? Это не про тарелки.

Повторяющиеся конфликты — это сигнал. За каждой ссорой стоит неудовлетворённая потребность. Один человек хочет уважения. Другой — близости. Оба говорят о разном, используя одни и те же слова.

Что делать?
→ Остановитесь в момент конфликта
→ Спросите себя: «Что я сейчас на самом деле хочу?»
→ Скажите это вслух — не через претензию, а через потребность

«Мне важно, чтобы ты замечал мои усилия» — это честнее, чем «ты никогда не помогаешь».

Простой сдвиг в формулировке — и разговор становится другим.`,
  },
  {
    id: 'post-2',
    title: '3 фразы, которые разрушают доверие в паре',
    preview: 'Иногда мы разрушаем близость словами, которые кажутся нам нормальными. Вот три из них...',
    date: '10 апр 2026',
    status: 'ready',
    content: `3 фразы, которые разрушают доверие в паре

Иногда мы разрушаем близость словами, которые кажутся нам нормальными. Вот три из них.

1. «Ты всегда / ты никогда»
Эти слова — обобщение, которое не даёт партнёру ни одного шанса. Мозг слышит атаку и закрывается. Замените на конкретику: «Сегодня, когда ты не позвонил, я почувствовала, что я неважна».

2. «Успокойся»
Говоря это, вы обесцениваете чувства. Человек воспринимает это как: «твои эмоции неуместны». Попробуйте: «Вижу, что тебе сейчас тяжело. Я здесь».

3. «Я же говорил(а)»
Это победа в споре ценой поражения в отношениях. Вместо этого — молчание и поддержка.

Слова создают реальность. Выбирайте те, что строят мост, а не стену.`,
  },
];

// ─── Mock generator ───────────────────────────────────────────────────────────

function getMockPost(type: string, length: string, topic: string): string {
  const lengthNote = length === 'short' ? '(короткий формат)\n\n' : length === 'long' ? '(развёрнутый формат)\n\n' : '';
  const typeLabel: Record<string, string> = {
    expert: 'Экспертный пост',
    story: 'История',
    sale: 'Продающий пост',
    engage: 'Вовлекающий пост',
    personal: 'Личный пост',
  };
  return `${typeLabel[type] ?? 'Пост'}: ${topic}

${lengthNote}Каждая пара хотя бы раз сталкивалась с темой «${topic}». И чаще всего — не один раз.

Почему это происходит? Потому что за внешним конфликтом всегда стоит что-то глубже: страх отвержения, потребность в признании или просто усталость, о которой никто не говорит вслух.

Я работаю с парами уже несколько лет и вижу одну и ту же картину: люди не умеют говорить о своих потребностях — их этому просто никто не учил.

Но хорошая новость: этому можно научиться.

Если вы узнали свою ситуацию — напишите в комментариях 🔽 или сохраните этот пост, чтобы вернуться к нему позже.`;
}

// ─── Form component ───────────────────────────────────────────────────────────

const POST_TYPES = [
  { key: 'expert',   label: 'Экспертный' },
  { key: 'story',    label: 'История' },
  { key: 'sale',     label: 'Продающий' },
  { key: 'engage',   label: 'Вовлекающий' },
  { key: 'personal', label: 'Личный' },
];

const POST_LENGTHS = [
  { key: 'short',  label: 'Короткий (до 500 знаков)' },
  { key: 'medium', label: 'Средний' },
  { key: 'long',   label: 'Длинный' },
];

function PostsForm({ onGenerate, loading }: FormProps) {
  const [type,   setType]   = useState('expert');
  const [length, setLength] = useState('medium');
  const [topic,  setTopic]  = useState('');

  const handleGenerate = () => {
    const title = topic.trim() || 'Новый пост';
    onGenerate(title, getMockPost(type, length, title));
  };

  return (
    <>
      <h2 className={s.formTitle}>Новый пост</h2>

      <div className={s.formField}>
        <span className={s.chipLabel}>Тип поста</span>
        <div className={s.chipGroup}>
          {POST_TYPES.map(({ key, label }) => (
            <button
              key={key}
              className={`${s.chip}${type === key ? ' ' + s.chipActive : ''}`}
              onClick={() => setType(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={s.formField}>
        <span className={s.chipLabel}>Длина</span>
        <div className={s.chipGroup}>
          {POST_LENGTHS.map(({ key, label }) => (
            <button
              key={key}
              className={`${s.chip}${length === key ? ' ' + s.chipActive : ''}`}
              onClick={() => setLength(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={s.aiSuggestion}>
        <span className={s.aiSuggestionIcon}>🧠</span>
        <p className={s.aiSuggestionText}>
          На основе вашей стратегии предлагаю тему:{' '}
          <strong>«Ссоры в паре: как выйти из замкнутого круга»</strong>
          <br />
          Подходит? Или опишите свою тему:
        </p>
      </div>

      <div className={s.formField}>
        <label className={s.formLabel}>Тема поста</label>
        <input
          className={s.formInput}
          placeholder="Например: почему мы ссоримся об одном и том же"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
      </div>

      <button className={s.generateBtn} onClick={handleGenerate} disabled={loading}>
        {loading ? <><span className={s.spinner} /> Генерирую...</> : 'Сгенерировать →'}
      </button>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Posts() {
  return (
    <ContentWorkspace
      sectionTitle="Посты"
      initialMaterials={SEED}
      FormComponent={PostsForm}
    />
  );
}
