import { useState, useMemo, useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { useProjectsStore } from '../../store/projects.store';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  closestCenter,
} from '@dnd-kit/core';
import {
  useContentPlanStore,
  ContentPlanItem,
  ContentType,
  ContentStatus,
} from '../../store/contentPlan.store';
import AddToPlanModal from '../../components/AddToPlanModal/AddToPlanModal';
import s from './ContentPlan.module.css';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const TYPE_LABELS: Record<ContentType, string> = {
  post:         'Пост',
  reel:         'Рилс',
  article:      'Статья',
  video_script: 'Видео',
  chatbot:      'Бот',
  custom:       'Другое',
};

const TYPE_CLASS: Record<ContentType, string> = {
  post:         s.typePost,
  reel:         s.typeReel,
  article:      s.typeArticle,
  video_script: s.typeVideoScript,
  chatbot:      s.typeChatbot,
  custom:       s.typeCustom,
};

const DOT_CLASS: Record<ContentType, string> = {
  post:         s.dotPost,
  reel:         s.dotReel,
  article:      s.dotArticle,
  video_script: s.dotVideoScript,
  chatbot:      s.dotChatbot,
  custom:       s.dotCustom,
};

const STATUS_LABELS: Record<ContentStatus, string> = {
  draft:     'Черновик',
  ready:     'Готов',
  published: 'Опубликован',
};

const STATUS_CLASS: Record<ContentStatus, string> = {
  draft:     s.statusDraft,
  ready:     s.statusReady,
  published: s.statusPublished,
};

const STATUS_CYCLE: Record<ContentStatus, ContentStatus> = {
  draft:     'ready',
  ready:     'published',
  published: 'draft',
};

const MONTH_RU = [
  'января','февраля','марта','апреля','мая','июня',
  'июля','августа','сентября','октября','ноября','декабря',
];

const PANEL_WIDTH = 480;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getMondayOf(d: Date): Date {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  const m = new Date(d);
  m.setDate(d.getDate() + diff);
  return m;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}

function formatWeekLabel(monday: Date): string {
  const sunday = addDays(monday, 6);
  return `${monday.getDate()} — ${sunday.getDate()} ${MONTH_RU[sunday.getMonth()]} ${sunday.getFullYear()}`;
}

function formatFullDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTH_RU[d.getMonth()]} ${d.getFullYear()}`;
}

// ─── Side panel ───────────────────────────────────────────────────────────────

function DetailPanel({
  item,
  open,
  onClose,
  onUpdate,
  onDelete,
}: {
  item: ContentPlanItem | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (patch: Partial<ContentPlanItem>) => void;
  onDelete: () => void;
}) {
  const [editing,       setEditing]       = useState(false);
  const [content,       setContent]       = useState('');
  const [copied,        setCopied]        = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync content state and reset UI when item changes
  useEffect(() => {
    if (item) {
      setContent(item.content ?? '');
      setEditing(false);
      setCopied(false);
      setConfirmDelete(false);
    }
  }, [item?.id]);

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  function handleSave() {
    onUpdate({ content });
    setEditing(false);
  }

  function handleCopy() {
    const text = [item?.title, item?.content].filter(Boolean).join('\n\n');
    navigator.clipboard.writeText(text).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleCycleStatus() {
    if (!item) return;
    onUpdate({ status: STATUS_CYCLE[item.status] });
  }

  function handleDeleteConfirm() {
    onDelete();
    setConfirmDelete(false);
  }

  return (
    <>
      {/* Overlay */}
      <div
        className={`${s.panelOverlay} ${open ? s.panelOverlayVisible : ''}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div className={`${s.detailPanel} ${open ? s.detailPanelOpen : ''}`}>
        {item && (
          <>
            {/* Header — fixed */}
            <div className={s.panelHeader}>
              <div className={s.panelHeaderTop}>
                <div className={s.panelBadges}>
                  <span className={`${s.panelTypeBadge} ${TYPE_CLASS[item.type]}`}>
                    {TYPE_LABELS[item.type]}
                  </span>
                  {item.platform && (
                    <span className={s.panelPlatformBadge}>{item.platform}</span>
                  )}
                </div>
                <button className={s.panelCloseBtn} onClick={onClose}>✕</button>
              </div>
              <div className={s.panelTitle}>{item.title}</div>
              <div className={s.panelMeta}>
                <span>{formatFullDate(item.date)}</span>
              </div>
            </div>

            {/* Body — scrollable */}
            <div className={s.panelBody}>
              {editing ? (
                <textarea
                  ref={textareaRef}
                  className={s.panelTextarea}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Текст материала..."
                />
              ) : (
                <div className={s.panelContent}>
                  {content
                    ? content.split('\n').map((line, i) =>
                        line.trim()
                          ? <p key={i} className={s.panelLine}>{line}</p>
                          : <div key={i} className={s.panelLineSpacer} />
                      )
                    : <span className={s.panelEmpty}>Текст не добавлен. Нажмите «Редактировать» чтобы добавить.</span>
                  }
                </div>
              )}
            </div>

            {/* Footer — fixed */}
            <div className={s.panelFooter}>
              {/* Status chip row */}
              <div className={s.panelStatusRow}>
                <span className={s.panelStatusLabel}>Статус:</span>
                <button
                  className={`${s.panelStatusChip} ${STATUS_CLASS[item.status]}`}
                  onClick={handleCycleStatus}
                  title="Нажмите чтобы изменить статус"
                >
                  {STATUS_LABELS[item.status]} →
                </button>
              </div>

              {/* Action buttons */}
              <div className={s.panelActions}>
                {editing ? (
                  <button className={`${s.panelBtn} ${s.panelBtnPrimary}`} onClick={handleSave}>
                    💾 Сохранить
                  </button>
                ) : (
                  <button className={s.panelBtn} onClick={() => setEditing(true)}>
                    ✏️ Редактировать
                  </button>
                )}
                <button className={s.panelBtn} onClick={handleCopy}>
                  {copied ? '✅ Скопировано!' : '📋 Копировать'}
                </button>

                {!confirmDelete ? (
                  <button className={`${s.panelBtn} ${s.panelBtnDelete}`} onClick={() => setConfirmDelete(true)}>
                    🗑 Удалить
                  </button>
                ) : (
                  <div className={s.panelConfirm}>
                    <span className={s.panelConfirmText}>Удалить из плана?</span>
                    <button className={s.panelConfirmYes} onClick={handleDeleteConfirm}>Да</button>
                    <button className={s.panelConfirmNo} onClick={() => setConfirmDelete(false)}>Нет</button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─── Delete confirm (from card ✕ button) ─────────────────────────────────────

function DeleteConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className={s.deleteConfirmOverlay} onClick={onCancel}>
      <div className={s.deleteConfirmBox} onClick={(e) => e.stopPropagation()}>
        <div className={s.deleteConfirmTitle}>Удалить из контент-плана?</div>
        <div className={s.deleteConfirmText}>Сам материал останется в разделе Контент.</div>
        <div className={s.deleteConfirmBtns}>
          <button className={s.deleteConfirmCancel} onClick={onCancel}>Отмена</button>
          <button className={s.deleteConfirmOk} onClick={onConfirm}>Удалить</button>
        </div>
      </div>
    </div>
  );
}

// ─── DnD Card ─────────────────────────────────────────────────────────────────

function DraggableCard({
  item,
  onOpenDetail,
  onDeleteRequest,
}: {
  item: ContentPlanItem;
  onOpenDetail: () => void;
  onDeleteRequest: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      className={`${s.card} ${isDragging ? s.cardDragging : ''}`}
    >
      <div {...listeners} className={s.cardDragHandle} onClick={onOpenDetail}>
        <div className={`${s.cardType} ${TYPE_CLASS[item.type]}`}>
          {TYPE_LABELS[item.type]}
        </div>
        <div className={s.cardTitle}>{item.title}</div>
        <div className={s.cardMeta}>
          <span className={s.cardPlatform}>{item.platform ?? ''}</span>
          <span className={`${s.cardStatus} ${STATUS_CLASS[item.status]}`}>
            {STATUS_LABELS[item.status]}
          </span>
        </div>
      </div>
      <button
        className={s.cardDelete}
        onClick={(e) => { e.stopPropagation(); onDeleteRequest(); }}
      >
        ✕
      </button>
    </div>
  );
}

// ─── Droppable day ────────────────────────────────────────────────────────────

function DroppableDay({
  dateStr, items, isToday, dayName, dayNum, onOpenDetail, onDeleteRequest,
}: {
  dateStr: string;
  items: ContentPlanItem[];
  isToday: boolean;
  dayName: string;
  dayNum: number;
  onOpenDetail: (item: ContentPlanItem) => void;
  onDeleteRequest: (id: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: dateStr });

  return (
    <div className={s.dayColumn}>
      <div className={s.dayHeader}>
        <div className={s.dayName}>{dayName}</div>
        <div className={s.dayNum}>
          {isToday ? <span className={s.dayNumToday}>{dayNum}</span> : dayNum}
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={`${s.dayItems} ${s.dropZone} ${isOver ? s.dropZoneOver : ''}`}
      >
        {items.map((item) => (
          <DraggableCard
            key={item.id}
            item={item}
            onOpenDetail={() => onOpenDetail(item)}
            onDeleteRequest={() => onDeleteRequest(item.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ContentPlan() {
  const { items, loadItems, removeItem, updateItem, moveItem } = useContentPlanStore();
  const activeProjectId = useProjectsStore((s) => s.activeProjectId);

  useEffect(() => {
    if (activeProjectId) void loadItems(activeProjectId);
  }, [activeProjectId]); // eslint-disable-line
  const [view,        setView]        = useState<'week' | 'list'>('week');
  const [weekOffset,  setWeekOffset]  = useState(0);
  const [activeId,    setActiveId]    = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Panel state: selectedItem drives content; panelOpen drives CSS
  const [selectedItem,  setSelectedItem]  = useState<ContentPlanItem | null>(null);
  const [displayedItem, setDisplayedItem] = useState<ContentPlanItem | null>(null);
  const [panelOpen,     setPanelOpen]     = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function openPanel(item: ContentPlanItem) {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setSelectedItem(item);
    setDisplayedItem(item);
    // rAF ensures the element is in the DOM before we apply the open class
    requestAnimationFrame(() => setPanelOpen(true));
  }

  function closePanel() {
    setPanelOpen(false);
    setSelectedItem(null);
    // keep displayedItem alive so content is visible during slide-out
    closeTimerRef.current = setTimeout(() => setDisplayedItem(null), 320);
  }

  // Keep displayedItem in sync with live store updates while panel is open
  useEffect(() => {
    if (displayedItem) {
      const live = items.find((i) => i.id === displayedItem.id);
      if (live) setDisplayedItem(live);
    }
  }, [items]);

  const todayStr = toISO(new Date());

  const monday = useMemo(() => {
    const m = getMondayOf(new Date());
    m.setDate(m.getDate() + weekOffset * 7);
    return m;
  }, [weekOffset]);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(monday, i)),
    [monday]
  );

  const itemsByDate = useMemo(() => {
    const map: Record<string, ContentPlanItem[]> = {};
    items.forEach((item) => {
      if (!map[item.date]) map[item.date] = [];
      map[item.date].push(item);
    });
    return map;
  }, [items]);

  const weekItems = useMemo(
    () => weekDays.flatMap((d) => itemsByDate[toISO(d)] ?? []),
    [weekDays, itemsByDate]
  );

  const stats = useMemo(() => {
    const counts: Record<ContentType, number> = {
      post: 0, reel: 0, article: 0, video_script: 0, chatbot: 0, custom: 0,
    };
    weekItems.forEach((i) => counts[i.type]++);
    return counts;
  }, [weekItems]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const dndActiveItem = activeId ? items.find((i) => i.id === activeId) : null;

  function handleDragStart(e: DragStartEvent) {
    setActiveId(e.active.id as string);
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const targetDate = over.id as string;
    const item = items.find((i) => i.id === active.id);
    if (item && item.date !== targetDate) void moveItem(item.id, targetDate);
  }

  function handleDeleteFromCard(id: string) {
    setDeleteTarget(id);
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    if (selectedItem?.id === deleteTarget) closePanel();
    void removeItem(deleteTarget);
    setDeleteTarget(null);
  }

  const listGroups = useMemo(() => {
    const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
    const byWeek: Record<string, { label: string; items: ContentPlanItem[] }> = {};
    sorted.forEach((item) => {
      const m = getMondayOf(new Date(item.date));
      const key = toISO(m);
      if (!byWeek[key]) byWeek[key] = { label: formatWeekLabel(m), items: [] };
      byWeek[key].items.push(item);
    });
    return Object.entries(byWeek).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const isEmpty = items.length === 0;

  return (
    <div className={s.root}>

      {/* Content area — shrinks when panel is open */}
      <div
        className={s.contentArea}
        style={{ marginRight: panelOpen ? PANEL_WIDTH : 0 }}
      >
        {/* Info banner */}
        <div className={s.infoBanner}>
          <span className={s.infoBannerIcon}>💡</span>
          <span className={s.infoBannerText}>
            Добавляйте контент из разделов{' '}
            <NavLink to="/app/posts" className={s.infoBannerLink}>Посты</NavLink>,{' '}
            <NavLink to="/app/reels" className={s.infoBannerLink}>Рилсы</NavLink>,{' '}
            <NavLink to="/app/articles" className={s.infoBannerLink}>Статьи</NavLink>,{' '}
            <NavLink to="/app/video-scripts" className={s.infoBannerLink}>Сценарии видео</NavLink>,{' '}
            <NavLink to="/app/chatbot-chains" className={s.infoBannerLink}>Цепочка текстов</NavLink>{' '}
            через кнопку «📅 Включить в контент-план»
          </span>
        </div>

        {/* Toolbar */}
        <div className={s.toolbar}>
          {view === 'week' && (
            <div className={s.weekNav}>
              <button className={s.weekNavBtn} onClick={() => setWeekOffset((o) => o - 1)}>‹</button>
              <span className={s.weekLabel}>{formatWeekLabel(monday)}</span>
              <button className={s.weekNavBtn} onClick={() => setWeekOffset((o) => o + 1)}>›</button>
            </div>
          )}
          {view === 'week' && weekOffset !== 0 && (
            <button className={s.todayBtn} onClick={() => setWeekOffset(0)}>Сегодня</button>
          )}
          <div className={s.spacer} />
          <div className={s.viewToggle}>
            <button
              className={`${s.viewBtn} ${view === 'week' ? s.viewBtnActive : ''}`}
              onClick={() => setView('week')}
            >
              Неделя
            </button>
            <button
              className={`${s.viewBtn} ${view === 'list' ? s.viewBtnActive : ''}`}
              onClick={() => setView('list')}
            >
              Список
            </button>
          </div>
        </div>

        {/* Stats bar */}
        {view === 'week' && !isEmpty && (
          <div className={s.statsBar}>
            <span className={s.statLabel} style={{ fontWeight: 600 }}>
              Эта неделя: {weekItems.length} материалов
            </span>
            <div className={s.statDivider} />
            {(Object.entries(stats) as [ContentType, number][])
              .filter(([, count]) => count > 0)
              .map(([type, count]) => (
                <div key={type} className={s.statItem}>
                  <div className={`${s.statDot} ${DOT_CLASS[type]}`} />
                  <span className={s.statLabel}>{TYPE_LABELS[type]}</span>
                  <span className={s.statCount}>{count}</span>
                </div>
              ))}
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <div className={s.emptyState}>
            <div className={s.emptyStateIcon}>📅</div>
            <div className={s.emptyStateTitle}>Контент-план пуст</div>
            <div className={s.emptyStateText}>
              Создайте посты, рилсы или статьи в разделе Контент
              <br />и добавьте их в план через кнопку «Включить в контент-план»
            </div>
            <NavLink to="/app/posts" className={s.emptyStateBtn}>
              Перейти в Посты →
            </NavLink>
          </div>
        )}

        {/* Week grid */}
        {view === 'week' && !isEmpty && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className={s.weekGrid}>
              {weekDays.map((day, i) => {
                const dateStr = toISO(day);
                return (
                  <DroppableDay
                    key={dateStr}
                    dateStr={dateStr}
                    items={itemsByDate[dateStr] ?? []}
                    isToday={dateStr === todayStr}
                    dayName={DAY_NAMES[i]}
                    dayNum={day.getDate()}
                    onOpenDetail={openPanel}
                    onDeleteRequest={handleDeleteFromCard}
                  />
                );
              })}
            </div>
            <DragOverlay>
              {dndActiveItem && (
                <div className={`${s.card} ${s.cardDragging}`} style={{ width: 150 }}>
                  <div className={`${s.cardType} ${TYPE_CLASS[dndActiveItem.type]}`}>
                    {TYPE_LABELS[dndActiveItem.type]}
                  </div>
                  <div className={s.cardTitle}>{dndActiveItem.title}</div>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}

        {/* List view */}
        {view === 'list' && !isEmpty && (
          <div className={s.listView}>
            {listGroups.map(([weekKey, { label, items: groupItems }]) => (
              <div key={weekKey} className={s.listGroup}>
                <div className={s.listGroupHeader}>{label}</div>
                {groupItems.map((item) => {
                  const d = new Date(item.date);
                  return (
                    <div
                      key={item.id}
                      className={`${s.listRow} ${selectedItem?.id === item.id ? s.listRowActive : ''}`}
                      onClick={() => openPanel(item)}
                    >
                      <div className={s.listDate}>
                        {DAY_NAMES[(d.getDay() + 6) % 7]} {d.getDate()}
                      </div>
                      <div className={`${s.listTypeDot} ${DOT_CLASS[item.type]}`} />
                      <div className={s.listTitle}>{item.title}</div>
                      <div className={s.listPlatform}>{item.platform ?? ''}</div>
                      <button
                        className={`${s.listStatusChip} ${STATUS_CLASS[item.status]}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          void updateItem(item.id, { status: STATUS_CYCLE[item.status] });
                        }}
                      >
                        {STATUS_LABELS[item.status]}
                      </button>
                      <button
                        className={s.listDeleteBtn}
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(item.id); }}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Side detail panel */}
      <DetailPanel
        item={displayedItem}
        open={panelOpen}
        onClose={closePanel}
        onUpdate={(patch) => {
          if (selectedItem) void updateItem(selectedItem.id, patch);
        }}
        onDelete={() => {
          if (selectedItem) {
            void removeItem(selectedItem.id);
            closePanel();
          }
        }}
      />

      {/* Delete confirmation from card ✕ button */}
      {deleteTarget && (
        <DeleteConfirm
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <AddToPlanModal />
    </div>
  );
}
