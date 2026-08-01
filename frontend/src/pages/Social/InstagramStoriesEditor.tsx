import { useState } from 'react';
import toast from 'react-hot-toast';
import { aiApi } from '../../api/ai';
import type { InstagramHighlightDraft, InstagramStoryDraft } from '../../api/projects.api';
import AiWorkflowCost from '../../components/AiWorkflowCost/AiWorkflowCost';
import { parseStoryProposal, storyDraft } from '../../utils/instagramAiProposals';
import styles from './Social.module.css';

const FORMAT_LABELS: Record<InstagramStoryDraft['format'], string> = {
  talking_head: 'Разговорное видео',
  text: 'Текстовая сторис',
  screen_recording: 'Запись экрана',
  b_roll: 'Видео с закадровым текстом',
  poll: 'Опрос',
  quiz: 'Тест',
  question: 'Вопрос',
  custom: 'Собственный формат',
};

function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function withPositions(stories: InstagramStoryDraft[]): InstagramStoryDraft[] {
  return stories.map((story, position) => ({ ...story, position }));
}

function emptyStory(position: number): InstagramStoryDraft {
  return {
    id: newId(),
    title: `Сторис ${position + 1}`,
    role: '',
    goal: '',
    format: 'talking_head',
    customFormat: '',
    frame: '',
    screenText: '',
    speech: '',
    interactive: '',
    callToAction: '',
    transition: '',
    position,
  };
}

export default function InstagramStoriesEditor({
  projectId,
  highlight,
  onChange,
}: {
  projectId: string;
  highlight: InstagramHighlightDraft;
  onChange: (highlight: InstagramHighlightDraft) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiStoryId, setAiStoryId] = useState<string | null>(null);
  const [aiProposal, setAiProposal] = useState<{
    storyId: string;
    story: InstagramStoryDraft;
    missingFacts: string[];
  } | null>(null);

  function changeStories(stories: InstagramStoryDraft[]) {
    onChange({ ...highlight, stories: withPositions(stories) });
  }

  function createStory() {
    if (highlight.stories.length >= 100) return;
    const story = emptyStory(highlight.stories.length);
    changeStories([...highlight.stories, story]);
    setExpandedId(story.id);
  }

  function updateStory(id: string, patch: Partial<InstagramStoryDraft>) {
    changeStories(highlight.stories.map((story) => story.id === id ? { ...story, ...patch } : story));
  }

  function duplicateStory(id: string) {
    if (highlight.stories.length >= 100) return;
    const index = highlight.stories.findIndex((story) => story.id === id);
    if (index < 0) return;
    const source = highlight.stories[index];
    const copy = { ...source, id: newId(), title: `${source.title || 'Сторис'} — копия` };
    const next = [...highlight.stories];
    next.splice(index + 1, 0, copy);
    changeStories(next);
    setExpandedId(copy.id);
  }

  function deleteStory(id: string) {
    const story = highlight.stories.find((item) => item.id === id);
    if (!story || !window.confirm(`Удалить сторис «${story.title || 'Без названия'}»?`)) return;
    changeStories(highlight.stories.filter((item) => item.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  function moveStory(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= highlight.stories.length) return;
    const next = [...highlight.stories];
    [next[index], next[target]] = [next[target], next[index]];
    changeStories(next);
  }

  async function improveStory(current: InstagramStoryDraft, index: number) {
    if (aiStoryId) return;
    setAiStoryId(current.id);
    try {
      const response = await aiApi.startWorkflow('instagram.story.improve', {
        projectId,
        inputs: {
          highlight: {
            title: highlight.title,
            goal: highlight.goal,
            description: highlight.description,
          },
          story: current,
          neighborStories: highlight.stories.filter((_, itemIndex) => (
            itemIndex === index - 1 || itemIndex === index + 1
          )),
          instruction: aiInstruction.trim(),
        },
        idempotencyKey: newId(),
      });
      const parsed = parseStoryProposal(response);
      setAiProposal({
        storyId: current.id,
        story: storyDraft(parsed.story, current.id, current.position),
        missingFacts: parsed.missingFacts,
      });
      toast.success(response.aiPointsCharged !== undefined
        ? `Вариант готов. Списано ${response.aiPointsCharged} AI-баллов`
        : 'Вариант сторис готов');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось доработать сторис');
    } finally {
      setAiStoryId(null);
    }
  }

  function applyStoryProposal() {
    if (!aiProposal) return;
    changeStories(highlight.stories.map((story) => (
      story.id === aiProposal.storyId ? aiProposal.story : story
    )));
    setAiProposal(null);
    toast.success('AI-вариант применён. Сохраните Highlights');
  }

  return (
    <section className={styles.storiesEditor} aria-labelledby="stories-editor-title">
      <div className={styles.storiesHeader}>
        <div>
          <h4 id="stories-editor-title">Сценарии сторис</h4>
          <p>Экранный текст и речь разделены. Открыта может быть только одна сторис.</p>
        </div>
        <button type="button" onClick={createStory} disabled={highlight.stories.length >= 100}>
          + Сторис
        </button>
      </div>

      {highlight.stories.length === 0 ? (
        <div className={styles.storiesEmpty}>
          <strong>Сценариев пока нет</strong>
          <span>Добавьте первую сторис и опишите, что человек увидит и услышит.</span>
          <button type="button" onClick={createStory}>Добавить сторис</button>
        </div>
      ) : (
        <div className={styles.storiesList}>
          {highlight.stories.map((story, index) => {
            const expanded = expandedId === story.id;
            const invalid = !story.title.trim()
              || (story.format === 'custom' && !story.customFormat.trim());
            return (
              <article className={`${styles.storyItem} ${expanded ? styles.storyItemExpanded : ''}`} key={story.id}>
                <div className={styles.storySummary}>
                  <button
                    type="button"
                    className={styles.storyToggle}
                    onClick={() => setExpandedId(expanded ? null : story.id)}
                    aria-expanded={expanded}
                  >
                    <span className={styles.storyNumber}>{String(index + 1).padStart(2, '0')}</span>
                    <span className={styles.storySummaryText}>
                      <strong>{story.title || 'Без названия'}</strong>
                      <small>{story.format === 'custom' ? story.customFormat || 'Собственный формат' : FORMAT_LABELS[story.format]}</small>
                    </span>
                    {invalid && <span className={styles.storyInvalid}>Заполните</span>}
                    <span className={styles.storyChevron} aria-hidden="true">{expanded ? '↑' : '↓'}</span>
                  </button>
                  <div className={styles.storyRowActions}>
                    <button type="button" onClick={() => moveStory(index, -1)} disabled={index === 0} title="Вверх" aria-label="Переместить сторис вверх">↑</button>
                    <button type="button" onClick={() => moveStory(index, 1)} disabled={index === highlight.stories.length - 1} title="Вниз" aria-label="Переместить сторис вниз">↓</button>
                    <button type="button" onClick={() => duplicateStory(story.id)}>Копия</button>
                    <button type="button" className={styles.storyDelete} onClick={() => deleteStory(story.id)}>Удалить</button>
                  </div>
                </div>

                {expanded && (
                  <div className={styles.storyForm}>
                    <label>
                      <span>Название *</span>
                      <input value={story.title} maxLength={300} onChange={(event) => updateStory(story.id, { title: event.target.value })} />
                    </label>
                    <label>
                      <span>Роль в последовательности</span>
                      <input value={story.role} maxLength={300} onChange={(event) => updateStory(story.id, { role: event.target.value })} placeholder="Например: знакомство, доверие, доказательство" />
                    </label>
                    <label className={styles.storyFieldWide}>
                      <span>Задача сторис</span>
                      <textarea value={story.goal} maxLength={2000} rows={2} onChange={(event) => updateStory(story.id, { goal: event.target.value })} placeholder="Что должен понять или сделать зритель" />
                    </label>
                    <label>
                      <span>Формат</span>
                      <select value={story.format} onChange={(event) => updateStory(story.id, { format: event.target.value as InstagramStoryDraft['format'] })}>
                        {Object.entries(FORMAT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                    {story.format === 'custom' && (
                      <label>
                        <span>Собственный формат *</span>
                        <input value={story.customFormat} maxLength={300} onChange={(event) => updateStory(story.id, { customFormat: event.target.value })} placeholder="Опишите формат" />
                      </label>
                    )}
                    <label className={styles.storyFieldWide}>
                      <span>Кадр и визуал</span>
                      <textarea value={story.frame} maxLength={4000} rows={3} onChange={(event) => updateStory(story.id, { frame: event.target.value })} placeholder="Что находится в кадре, что показать на экране" />
                    </label>
                    <label className={styles.storyFieldWide}>
                      <span>Экранный текст</span>
                      <textarea value={story.screenText} maxLength={4000} rows={3} onChange={(event) => updateStory(story.id, { screenText: event.target.value })} placeholder="Короткий текст, который увидит зритель" />
                    </label>
                    <label className={styles.storyFieldWide}>
                      <span>Что сказать</span>
                      <textarea value={story.speech} maxLength={8000} rows={5} onChange={(event) => updateStory(story.id, { speech: event.target.value })} placeholder="Речь или голосовой сценарий" />
                    </label>
                    <label>
                      <span>Интерактив</span>
                      <input value={story.interactive} maxLength={2000} onChange={(event) => updateStory(story.id, { interactive: event.target.value })} placeholder="Опрос, вопрос, реакция" />
                    </label>
                    <label>
                      <span>Призыв к действию</span>
                      <input value={story.callToAction} maxLength={2000} onChange={(event) => updateStory(story.id, { callToAction: event.target.value })} placeholder="Следующий шаг для зрителя" />
                    </label>
                    <label className={styles.storyFieldWide}>
                      <span>Переход к следующей сторис</span>
                      <input value={story.transition} maxLength={2000} onChange={(event) => updateStory(story.id, { transition: event.target.value })} placeholder="Как связать эту сторис со следующей" />
                    </label>
                    <div className={`${styles.storyAiPanel} ${styles.storyFieldWide}`}>
                      <div>
                        <strong>AI-доработка этой сторис</strong>
                        <span>Текущая версия сохранится, пока вы не примените предложение.</span>
                      </div>
                      <input
                        value={aiInstruction}
                        onChange={(event) => setAiInstruction(event.target.value)}
                        maxLength={2000}
                        placeholder="Например: сделай мягче, сократи, усиль призыв"
                      />
                      <button
                        type="button"
                        disabled={aiStoryId !== null}
                        onClick={() => void improveStory(story, index)}
                      >
                        {aiStoryId === story.id ? 'Дорабатываем…' : 'Доработать через AI'}
                        <AiWorkflowCost workflow="instagram.story.improve" projectId={projectId} />
                      </button>
                    </div>
                    {aiProposal?.storyId === story.id && (
                      <div className={`${styles.storyAiProposal} ${styles.storyFieldWide}`}>
                        <span>AI-предложение</span>
                        <strong>{aiProposal.story.title}</strong>
                        <p><b>Текст на экране:</b> {aiProposal.story.screenText || 'нет'}</p>
                        <p><b>Что сказать:</b> {aiProposal.story.speech || 'нет'}</p>
                        {aiProposal.missingFacts.length > 0 && (
                          <div className={styles.aiMissingFacts}>
                            <strong>Нужно дополнить вручную</strong>
                            {aiProposal.missingFacts.map((fact) => <span key={fact}>{fact}</span>)}
                          </div>
                        )}
                        <div className={styles.aiProposalButtons}>
                          <button type="button" onClick={() => setAiProposal(null)}>Отклонить</button>
                          <button type="button" onClick={applyStoryProposal}>Применить к сторис</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
