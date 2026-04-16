import { useState } from 'react';
import ContentWorkspace, { ContentMaterial, FormProps } from '../../components/ContentWorkspace/ContentWorkspace';
import s from '../../components/ContentWorkspace/ContentWorkspace.module.css';

// ─── Seed data ────────────────────────────────────────────────────────────────

const SEED: ContentMaterial[] = [
  {
    id: 'reel-1',
    title: 'Хук: Вы ссоритесь каждую неделю об одном?',
    preview: '🎣 Хук: Вы ссоритесь каждую неделю об одном и том же? Тогда это видео для вас...',
    date: '13 апр 2026',
    status: 'ready',
    content: `🎣 ХУК (первые 3 секунды)
Вы ссоритесь каждую неделю об одном и том же? Тогда это видео для вас.

📖 КОНТЕНТ (основная часть)
Повторяющиеся конфликты — это не признак того, что вы не подходите друг другу. Это сигнал, что у вас есть неудовлетворённая потребность, о которой никто не говорит вслух.

Психологи называют это «циклом конфликта». Он выглядит так:
— Триггер (тарелки, деньги, дети)
— Реакция (крик, молчание, уход)
— Обида (недосказанность)
— Снова триггер

Чтобы выйти из цикла, нужно научиться говорить о потребностях, а не о поводах.

📢 ПРИЗЫВ
Если это про вас — сохраните видео. И напишите в комментарии: о чём вы ссоритесь чаще всего?`,
  },
  {
    id: 'reel-2',
    title: 'Сценарий: Техника паузы в конфликте',
    preview: '🎣 Хук: Знаете ли вы, что 90% ссор можно остановить за 3 секунды? Я покажу как...',
    date: '11 апр 2026',
    status: 'ready',
    content: `🎣 ХУК (первые 3 секунды)
Знаете ли вы, что 90% ссор можно остановить за 3 секунды? Сейчас покажу как.

📖 КОНТЕНТ (основная часть)
Когда мы в ссоре — наш мозг в буквальном смысле отключает рациональное мышление. Миндалина захватывает управление, и мы говорим то, о чём потом жалеем.

Техника паузы работает так:
1. В момент нарастания напряжения — скажите: «Мне нужна минута»
2. Выйдите из комнаты (без хлопка дверью)
3. Три глубоких вдоха — это не метафора, это нейрофизиология
4. Вернитесь, когда сможете говорить, а не кричать

Важно: пауза — это не избегание. Это выбор в пользу диалога.

📢 ПРИЗЫВ
Попробуйте технику в следующий раз. И подписывайтесь — у меня ещё много таких инструментов.`,
  },
];

// ─── Mock generator ───────────────────────────────────────────────────────────

function getMockReel(hook: string, content: string, cta: string): string {
  const h = hook.trim() || 'Вы знаете, что большинство конфликтов можно предотвратить?';
  const c = content.trim() || 'В отношениях важно уметь слышать партнёра, а не только говорить самому.';
  const ct = cta.trim() || 'Подписывайтесь и сохраните это видео.';
  return `🎣 ХУК (первые 3 секунды)
${h}

📖 КОНТЕНТ (основная часть)
${c}

Это работает потому, что мы часто реагируем на триггер, а не на реальную проблему. Когда мы останавливаемся и задаём себе вопрос «что мне сейчас на самом деле нужно?» — разговор меняется.

Попробуйте это сегодня: вместо того чтобы защищаться, скажите партнёру одно предложение о своей потребности.

📢 ПРИЗЫВ
${ct}`;
}

// ─── Form component ───────────────────────────────────────────────────────────

function ReelsForm({ onGenerate, loading }: FormProps) {
  const [hook,    setHook]    = useState('');
  const [content, setContent] = useState('');
  const [cta,     setCta]     = useState('');

  const handleGenerate = () => {
    const title = hook.trim() ? `Рилс: ${hook.trim().slice(0, 50)}` : 'Новый рилс';
    onGenerate(title, getMockReel(hook, content, cta));
  };

  return (
    <>
      <h2 className={s.formTitle}>Новый сценарий рилса</h2>

      <div className={s.reelBlocks}>
        <div className={s.reelBlock}>
          <label className={s.reelBlockLabel}>
            🎣 Хук
            <span className={s.reelBlockHint}>— первые 3 секунды, цепляет внимание</span>
          </label>
          <textarea
            className={s.formInput}
            rows={2}
            placeholder="Например: Знаете ли вы, что большинство ссор можно остановить за 3 секунды?"
            value={hook}
            onChange={(e) => setHook(e.target.value)}
          />
        </div>

        <div className={s.reelBlock}>
          <label className={s.reelBlockLabel}>
            📖 Контент
            <span className={s.reelBlockHint}>— основная часть, ценность</span>
          </label>
          <textarea
            className={s.formInput}
            rows={3}
            placeholder="Опишите основную идею или ключевой инсайт..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>

        <div className={s.reelBlock}>
          <label className={s.reelBlockLabel}>
            📢 Призыв
            <span className={s.reelBlockHint}>— что сделать после просмотра</span>
          </label>
          <textarea
            className={s.formInput}
            rows={2}
            placeholder="Например: Сохраните и напишите в комментариях..."
            value={cta}
            onChange={(e) => setCta(e.target.value)}
          />
        </div>
      </div>

      <button className={s.generateBtn} onClick={handleGenerate} disabled={loading}>
        {loading ? <><span className={s.spinner} /> Генерирую...</> : 'Сгенерировать сценарий →'}
      </button>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Reels() {
  return (
    <ContentWorkspace
      sectionTitle="Рилсы"
      initialMaterials={SEED}
      FormComponent={ReelsForm}
    />
  );
}
