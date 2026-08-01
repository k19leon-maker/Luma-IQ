import { useState, type ChangeEvent } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import toast from 'react-hot-toast';
import { aiApi } from '../../api/ai';
import type { InstagramHighlightDraft } from '../../api/projects.api';
import AiWorkflowCost from '../../components/AiWorkflowCost/AiWorkflowCost';
import {
  parseHighlightProposal,
  parseHighlightsProposal,
  parseScenarioProposal,
  storyDraft,
  type InstagramHighlightAiDraft,
} from '../../utils/instagramAiProposals';
import styles from './Social.module.css';
import InstagramStoriesEditor from './InstagramStoriesEditor';

type PreviewMode = 'desktop' | 'mobile';

interface Props {
  projectId: string;
  highlights: InstagramHighlightDraft[];
  activeId: string | null;
  dirty: boolean;
  saving: boolean;
  canSave: boolean;
  saveHint: string;
  previewMode: PreviewMode;
  onChange: (highlights: InstagramHighlightDraft[]) => void;
  onActiveChange: (id: string | null) => void;
  onPreviewModeChange: (mode: PreviewMode) => void;
  onSave: () => void;
}

type AiProposal = {
  mode: 'all' | 'single';
  title: string;
  highlights: InstagramHighlightDraft[];
  missingFacts: string[];
};

function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function withPositions(items: InstagramHighlightDraft[]): InstagramHighlightDraft[] {
  return items.map((item, position) => ({ ...item, position }));
}

function fromAiHighlight(
  proposal: InstagramHighlightAiDraft,
  position: number,
  current?: InstagramHighlightDraft,
): InstagramHighlightDraft {
  return {
    id: current?.id ?? newId(),
    position,
    title: proposal.title,
    goal: proposal.goal,
    description: proposal.description,
    icon: proposal.icon,
    stories: proposal.stories.map((item, storyPosition) => storyDraft(
      item,
      current?.stories[storyPosition]?.id ?? newId(),
      storyPosition,
    )),
  };
}

function SortableHighlight({
  highlight,
  active,
  index,
  total,
  menuOpen,
  onSelect,
  onMove,
  onToggleMenu,
  onDuplicate,
  onDelete,
}: {
  highlight: InstagramHighlightDraft;
  active: boolean;
  index: number;
  total: number;
  menuOpen: boolean;
  onSelect: () => void;
  onMove: (direction: -1 | 1) => void;
  onToggleMenu: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: highlight.id,
  });

  return (
    <div
      ref={setNodeRef}
      className={`${styles.highlightListItem} ${active ? styles.highlightListItemActive : ''} ${
        isDragging ? styles.highlightListItemDragging : ''
      }`}
      style={{
        transform: transform
          ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)`
          : undefined,
        transition,
      }}
    >
      <button
        type="button"
        className={styles.dragHandle}
        aria-label={`Изменить порядок «${highlight.title || 'Без названия'}»`}
        title="Перетащить"
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>
      <button type="button" className={styles.highlightSelect} onClick={onSelect}>
        <span className={styles.highlightListIcon}>{highlight.icon || String(index + 1)}</span>
        <span>
          <strong>{highlight.title || 'Без названия'}</strong>
          <small>{highlight.goal || 'Цель не указана'}</small>
        </span>
      </button>
      <div className={styles.highlightMoveButtons}>
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={index === 0}
          aria-label={`Переместить «${highlight.title || 'Highlight'}» вверх`}
          title="Вверх"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          aria-label={`Переместить «${highlight.title || 'Highlight'}» вниз`}
          title="Вниз"
        >
          ↓
        </button>
      </div>
      <div className={styles.highlightMenuWrap}>
        <button
          type="button"
          className={styles.highlightMenuButton}
          onClick={onToggleMenu}
          aria-expanded={menuOpen}
          aria-label={`Действия с «${highlight.title || 'Highlight'}»`}
          title="Другие действия"
        >
          ⋯
        </button>
        {menuOpen && (
          <div className={styles.highlightMenu}>
            <button type="button" onClick={onDuplicate}>Дублировать</button>
            <button type="button" className={styles.highlightDeleteAction} onClick={onDelete}>Удалить</button>
          </div>
        )}
      </div>
    </div>
  );
}

function HighlightsPreview({
  highlights,
  activeId,
  mode,
}: {
  highlights: InstagramHighlightDraft[];
  activeId: string | null;
  mode: PreviewMode;
}) {
  const active = highlights.find((item) => item.id === activeId) ?? highlights[0] ?? null;
  return (
    <div className={`${styles.highlightsPreviewShell} ${mode === 'mobile' ? styles.highlightsPreviewMobile : ''}`}>
      <div className={styles.previewToolbar}>
        <span className={styles.previewDot} />
        Предпросмотр Highlights
      </div>
      <div className={styles.highlightsPreviewBody}>
        {highlights.length === 0 ? (
          <div className={styles.highlightsPreviewEmpty}>
            Создайте первый Highlight — здесь появится его обложка и описание.
          </div>
        ) : (
          <>
            <div className={styles.highlightsPreviewRow}>
              {highlights.map((item, index) => (
                <div
                  key={item.id}
                  className={item.id === active?.id ? styles.previewHighlightActive : ''}
                >
                  <span>{item.icon || String(index + 1)}</span>
                  <small>{item.title || 'Без названия'}</small>
                </div>
              ))}
            </div>
            {active && (
              <div className={styles.highlightPreviewDetails}>
                <span className={styles.highlightPreviewEyebrow}>Актуальное</span>
                <h3>{active.title || 'Без названия'}</h3>
                <strong>{active.goal || 'Добавьте цель Highlight'}</strong>
                <p>{active.description || 'Здесь появится короткое описание содержания.'}</p>
                <small>{active.stories.length} сторис</small>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function InstagramHighlightsEditor({
  projectId,
  highlights,
  activeId,
  dirty,
  saving,
  canSave,
  saveHint,
  previewMode,
  onChange,
  onActiveChange,
  onPreviewModeChange,
  onSave,
}: Props) {
  const [menuId, setMenuId] = useState<string | null>(null);
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiAction, setAiAction] = useState<'all' | 'scenario' | 'improve' | null>(null);
  const [aiProposal, setAiProposal] = useState<AiProposal | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const active = highlights.find((item) => item.id === activeId) ?? null;

  function createHighlight() {
    if (highlights.length >= 100) return;
    const id = newId();
    onChange([...highlights, {
      id,
      title: `Новый Highlight ${highlights.length + 1}`,
      goal: '',
      description: '',
      icon: '',
      position: highlights.length,
      stories: [],
    }]);
    onActiveChange(id);
  }

  function updateActive(field: 'title' | 'goal' | 'description' | 'icon', value: string) {
    if (!active) return;
    onChange(highlights.map((item) => item.id === active.id ? { ...item, [field]: value } : item));
  }

  function moveHighlight(id: string, direction: -1 | 1) {
    const from = highlights.findIndex((item) => item.id === id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= highlights.length) return;
    onChange(withPositions(arrayMove(highlights, from, to)));
  }

  function duplicateHighlight(id: string) {
    const index = highlights.findIndex((item) => item.id === id);
    if (index < 0 || highlights.length >= 100) return;
    const source = highlights[index];
    const copyId = newId();
    const copy: InstagramHighlightDraft = {
      ...source,
      id: copyId,
      title: `${source.title || 'Highlight'} — копия`,
      stories: source.stories.map((story) => ({ ...story, id: newId() })),
    };
    const next = [...highlights];
    next.splice(index + 1, 0, copy);
    onChange(withPositions(next));
    onActiveChange(copyId);
    setMenuId(null);
  }

  function deleteHighlight(id: string) {
    const target = highlights.find((item) => item.id === id);
    if (!target || !window.confirm(`Удалить Highlight «${target.title || 'Без названия'}»?`)) return;
    const index = highlights.findIndex((item) => item.id === id);
    const next = withPositions(highlights.filter((item) => item.id !== id));
    onChange(next);
    onActiveChange(next[Math.min(index, next.length - 1)]?.id ?? null);
    setMenuId(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active: dragged, over } = event;
    if (!over || dragged.id === over.id) return;
    const from = highlights.findIndex((item) => item.id === dragged.id);
    const to = highlights.findIndex((item) => item.id === over.id);
    if (from < 0 || to < 0) return;
    onChange(withPositions(arrayMove(highlights, from, to)));
  }

  async function runAi(action: 'all' | 'scenario' | 'improve') {
    if (aiAction || (action !== 'all' && !active)) return;
    setAiAction(action);
    try {
      const workflow = action === 'all'
        ? 'instagram.highlights.generate'
        : action === 'scenario'
          ? 'instagram.highlight.scenario'
          : 'instagram.highlight.improve';
      const response = await aiApi.startWorkflow(workflow, {
        projectId,
        inputs: action === 'all'
          ? { currentHighlights: highlights, instruction: aiInstruction.trim() }
          : {
            highlight: active,
            neighborHighlights: highlights.filter((item) => item.id !== active?.id),
            instruction: aiInstruction.trim(),
          },
        idempotencyKey: newId(),
      });

      if (action === 'all') {
        const parsed = parseHighlightsProposal(response);
        setAiProposal({
          mode: 'all',
          title: 'Новая система Highlights',
          highlights: parsed.highlights.map((item, index) => fromAiHighlight(item, index)),
          missingFacts: parsed.missingFacts,
        });
      } else if (action === 'scenario' && active) {
        const parsed = parseScenarioProposal(response);
        setAiProposal({
          mode: 'single',
          title: `Новый сценарий «${active.title}»`,
          highlights: [{
            ...active,
            stories: parsed.stories.map((item, index) => storyDraft(
              item,
              active.stories[index]?.id ?? newId(),
              index,
            )),
          }],
          missingFacts: parsed.missingFacts,
        });
      } else if (active) {
        const parsed = parseHighlightProposal(response);
        setAiProposal({
          mode: 'single',
          title: `Доработанный Highlight «${active.title}»`,
          highlights: [fromAiHighlight(parsed.highlight, active.position, active)],
          missingFacts: parsed.missingFacts,
        });
      }
      toast.success(response.aiPointsCharged !== undefined
        ? `AI-вариант готов. Списано ${response.aiPointsCharged} AI-баллов`
        : 'AI-вариант готов');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось подготовить AI-вариант');
    } finally {
      setAiAction(null);
    }
  }

  function applyAiProposal() {
    if (!aiProposal) return;
    if (aiProposal.mode === 'all') {
      onChange(aiProposal.highlights);
      onActiveChange(aiProposal.highlights[0]?.id ?? null);
    } else {
      const next = aiProposal.highlights[0];
      onChange(highlights.map((item) => item.id === next.id ? next : item));
      onActiveChange(next.id);
    }
    setAiProposal(null);
    toast.success('AI-вариант применён. Проверьте и сохраните изменения');
  }

  return (
    <div className={styles.highlightsWorkspace}>
      <div className={styles.highlightsEditor}>
        <div className={styles.highlightsListHeader}>
          <div>
            <h2>Highlights</h2>
            <p>Соберите постоянные разделы профиля. Ручная работа не расходует AI-баланс.</p>
          </div>
          <button type="button" onClick={createHighlight} disabled={highlights.length >= 100}>
            + Добавить
          </button>
        </div>

        <div className={styles.highlightsAiPanel}>
          <div>
            <strong>AI-помощник</strong>
            <span>Снача покажет новую версию. Текущие данны не изменятся без вашего подтверждения.</span>
          </div>
          <input
            value={aiInstruction}
            onChange={(event) => setAiInstruction(event.target.value)}
            placeholder="Пожелание к сценариям, если нужно"
            maxLength={2000}
          />
          <div className={styles.highlightsAiActions}>
            <button type="button" disabled={aiAction !== null} onClick={() => void runAi('all')}>
              {aiAction === 'all' ? 'Собираем…' : 'Собрать Highlights'}
              <AiWorkflowCost workflow="instagram.highlights.generate" projectId={projectId} />
            </button>
            {active && (
              <>
                <button type="button" disabled={aiAction !== null} onClick={() => void runAi('scenario')}>
                  {aiAction === 'scenario' ? 'Собираем…' : 'Собрать сценарий'}
                  <AiWorkflowCost workflow="instagram.highlight.scenario" projectId={projectId} />
                </button>
                <button type="button" disabled={aiAction !== null} onClick={() => void runAi('improve')}>
                  {aiAction === 'improve' ? 'Дорабатываем…' : 'Доработать Highlight'}
                  <AiWorkflowCost workflow="instagram.highlight.improve" projectId={projectId} />
                </button>
              </>
            )}
          </div>
        </div>

        {aiProposal && (
          <div className={styles.highlightsAiProposal}>
            <div>
              <span>AI-предложение</span>
              <h3>{aiProposal.title}</h3>
              <p>
                {aiProposal.highlights.length} Highlights · {' '}
                {aiProposal.highlights.reduce((sum, item) => sum + item.stories.length, 0)} сторис
              </p>
            </div>
            <ul>
              {aiProposal.highlights.map((item) => (
                <li key={item.id}><strong>{item.title}</strong><span>{item.stories.length} сторис</span></li>
              ))}
            </ul>
            {aiProposal.missingFacts.length > 0 && (
              <div className={styles.aiMissingFacts}>
                <strong>Нужно дополнить вручную</strong>
                {aiProposal.missingFacts.map((fact) => <span key={fact}>{fact}</span>)}
              </div>
            )}
            <div className={styles.aiProposalButtons}>
              <button type="button" onClick={() => setAiProposal(null)}>Отклонить</button>
              <button type="button" onClick={applyAiProposal}>Применить вариант</button>
            </div>
          </div>
        )}

        {highlights.length === 0 ? (
          <div className={styles.highlightsEmptyState}>
            <div className={styles.placeholderIcon} aria-hidden="true">H</div>
            <h3>Пока нет Highlights</h3>
            <p>Добавьте первый раздел: например, «Обо мне», «Услуги», «Кейсы» или «Отзывы».</p>
            <button type="button" onClick={createHighlight}>Создать Highlight</button>
          </div>
        ) : (
          <div className={styles.highlightsBuilder}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={highlights.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                <div className={styles.highlightsList}>
                  {highlights.map((highlight, index) => (
                    <SortableHighlight
                      key={highlight.id}
                      highlight={highlight}
                      active={highlight.id === active?.id}
                      index={index}
                      total={highlights.length}
                      menuOpen={menuId === highlight.id}
                      onSelect={() => onActiveChange(highlight.id)}
                      onMove={(direction) => moveHighlight(highlight.id, direction)}
                      onToggleMenu={() => setMenuId(menuId === highlight.id ? null : highlight.id)}
                      onDuplicate={() => duplicateHighlight(highlight.id)}
                      onDelete={() => deleteHighlight(highlight.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {active && (
              <div className={styles.highlightForm}>
                <div className={styles.highlightFormHeading}>
                  <div>
                    <span>Выбранный Highlight</span>
                    <h3>{active.title || 'Без названия'}</h3>
                  </div>
                  <button type="button" onClick={() => duplicateHighlight(active.id)}>Дублировать</button>
                </div>
                <label>
                  <span>Название *</span>
                  <input
                    value={active.title}
                    maxLength={300}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => updateActive('title', event.target.value)}
                    placeholder="Например: Обо мне"
                  />
                  <small>{Array.from(active.title).length}/300</small>
                </label>
                <label>
                  <span>Цель</span>
                  <input
                    value={active.goal}
                    maxLength={2000}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => updateActive('goal', event.target.value)}
                    placeholder="Что должен понять или сделать человек"
                  />
                </label>
                <label>
                  <span>Описание</span>
                  <textarea
                    value={active.description}
                    maxLength={4000}
                    rows={5}
                    onChange={(event: ChangeEvent<HTMLTextAreaElement>) => updateActive('description', event.target.value)}
                    placeholder="Какие темы и истории войдут в этот раздел"
                  />
                </label>
                <label>
                  <span>Обозначение на обложке</span>
                  <input
                    value={active.icon}
                    maxLength={100}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => updateActive('icon', event.target.value)}
                    placeholder="Короткий символ или 1–2 буквы"
                  />
                </label>
                <InstagramStoriesEditor
                  projectId={projectId}
                  highlight={active}
                  onChange={(nextHighlight) => onChange(highlights.map((item) => (
                    item.id === nextHighlight.id ? nextHighlight : item
                  )))}
                />
              </div>
            )}
          </div>
        )}

        <div className={styles.saveBar}>
          <span>{dirty ? saveHint : 'Все изменения сохранены'}</span>
          <button type="button" disabled={!canSave} onClick={onSave}>
            {saving ? 'Сохраняем…' : 'Сохранить Highlights'}
          </button>
        </div>
      </div>

      <aside className={`${styles.previewPanel} ${styles.highlightsPreviewPanel}`}>
        <div className={styles.previewPanelHeader}>
          <div>
            <h2>Предпросмотр</h2>
            <p>Только Highlights, без повторения шапки профиля.</p>
          </div>
          <div className={styles.modeSwitch} aria-label="Размер предпросмотра Highlights">
            <button
              type="button"
              className={previewMode === 'desktop' ? styles.modeActive : ''}
              aria-pressed={previewMode === 'desktop'}
              onClick={() => onPreviewModeChange('desktop')}
            >
              Desktop
            </button>
            <button
              type="button"
              className={previewMode === 'mobile' ? styles.modeActive : ''}
              aria-pressed={previewMode === 'mobile'}
              onClick={() => onPreviewModeChange('mobile')}
            >
              Mobile
            </button>
          </div>
        </div>
        <HighlightsPreview highlights={highlights} activeId={activeId} mode={previewMode} />
      </aside>
    </div>
  );
}
