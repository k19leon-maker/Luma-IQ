import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  useTasksStore,
  type Task,
  type TaskColumn,
  type TaskCategory,
} from '../../store/tasks.store';
import s from './Tasks.module.css';

// ── Constants ──────────────────────────────────────────────────────────────────

const COLUMNS: { id: TaskColumn; label: string; icon: string }[] = [
  { id: 'backlog', label: 'Список задач',   icon: '📋' },
  { id: 'week',    label: 'На этой неделе', icon: '📅' },
  { id: 'today',   label: 'Сегодня',        icon: '⚡' },
  { id: 'done',    label: 'Выполнено',      icon: '✅' },
];

export const CATEGORIES: {
  id: TaskCategory;
  icon: string;
  label: string;
  color: string;
}[] = [
  { id: 'strategy', icon: '🎯', label: 'Стратегия',    color: '#7c6cfc' },
  { id: 'products', icon: '🚀', label: 'Продукты',     color: '#f59e0b' },
  { id: 'content',  icon: '📱', label: 'Контент',      color: '#34d399' },
  { id: 'planning', icon: '📅', label: 'Планирование', color: '#3b82f6' },
];

function getCat(id: TaskCategory) {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0]!;
}

// ── Shared card content ────────────────────────────────────────────────────────

function CardContent({
  task,
  onDelete,
  onNavigate,
}: {
  task:        Task;
  onDelete?:   () => void;
  onNavigate?: () => void;
}) {
  const cat = getCat(task.category);
  return (
    <>
      <div className={s.cardCat} style={{ color: cat.color }}>
        {cat.icon} {cat.label}
      </div>
      <div className={s.cardTitle}>{task.title}</div>
      {task.description && (
        <div className={s.cardDesc}>{task.description}</div>
      )}
      {task.link && onNavigate && (
        <button
          className={s.cardLink}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onNavigate(); }}
        >
          Открыть раздел →
        </button>
      )}
      {onDelete && (
        <button
          className={s.cardDelete}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          aria-label="Удалить задачу"
        >
          ✕
        </button>
      )}
    </>
  );
}

// ── Draggable card ─────────────────────────────────────────────────────────────

function DraggableCard({ task, isActive }: { task: Task; isActive: boolean }) {
  const navigate   = useNavigate();
  const removeTask = useTasksStore((st) => st.removeTask);
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: task.id });

  const style: React.CSSProperties | undefined = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${s.card}${isActive ? ' ' + s.cardActive : ''}`}
      {...attributes}
      {...listeners}
    >
      <CardContent
        task={task}
        onDelete={() => removeTask(task.id)}
        onNavigate={() => { if (task.link) navigate(task.link); }}
      />
    </div>
  );
}

// ── Inline add form ────────────────────────────────────────────────────────────

function AddForm({ column, onClose }: { column: TaskColumn; onClose: () => void }) {
  const addTask  = useTasksStore((st) => st.addTask);
  const [title,  setTitle]  = useState('');
  const [desc,   setDesc]   = useState('');
  const [cat,    setCat]    = useState<TaskCategory>('strategy');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function handleSubmit() {
    const t = title.trim();
    if (!t) return;
    addTask({ title: t, description: desc.trim() || undefined, category: cat, column });
    onClose();
  }

  return (
    <div className={s.addForm}>
      <input
        ref={inputRef}
        className={s.addInput}
        placeholder="Заголовок задачи"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
      />
      <textarea
        className={s.addTextarea}
        placeholder="Описание (необязательно)"
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        rows={2}
      />
      <div className={s.addCatRow}>
        <span className={s.addCatLabel}>Категория:</span>
        <div className={s.addCatBtns}>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              className={`${s.addCatBtn}${cat === c.id ? ' ' + s.addCatBtnActive : ''}`}
              style={cat === c.id ? { borderColor: c.color, color: c.color } : undefined}
              title={c.label}
              onClick={() => setCat(c.id)}
            >
              {c.icon}
            </button>
          ))}
        </div>
      </div>
      <div className={s.addActions}>
        <button
          className={s.addSubmitBtn}
          onClick={handleSubmit}
          disabled={!title.trim()}
        >
          Добавить
        </button>
        <button className={s.addCancelBtn} onClick={onClose}>
          Отмена
        </button>
      </div>
    </div>
  );
}

// ── Droppable column ───────────────────────────────────────────────────────────

function DroppableColumn({
  col,
  tasks,
  activeId,
  addingIn,
  onStartAdd,
  onCloseAdd,
}: {
  col:       typeof COLUMNS[number];
  tasks:     Task[];
  activeId:  string | null;
  addingIn:  TaskColumn | null;
  onStartAdd: (col: TaskColumn) => void;
  onCloseAdd: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });

  return (
    <div
      ref={setNodeRef}
      className={`${s.column}${isOver && activeId ? ' ' + s.columnOver : ''}`}
    >
      <div className={s.colHeader}>
        <span className={s.colIcon}>{col.icon}</span>
        <span className={s.colLabel}>{col.label}</span>
        <span className={s.colCount}>{tasks.length}</span>
      </div>

      <div className={s.colCards}>
        {tasks.map((task) => (
          <DraggableCard key={task.id} task={task} isActive={task.id === activeId} />
        ))}
        {addingIn === col.id && (
          <AddForm column={col.id} onClose={onCloseAdd} />
        )}
      </div>

      {addingIn !== col.id && (
        <button className={s.colAddBtn} onClick={() => onStartAdd(col.id)}>
          + Добавить задачу
        </button>
      )}
    </div>
  );
}

// ── Toast ──────────────────────────────────────────────────────────────────────

function Toast({ title, visible }: { title: string; visible: boolean }) {
  return (
    <div className={`${s.toast}${visible ? ' ' + s.toastVisible : ''}`}>
      <span className={s.toastIcon}>🎉</span>
      <div>
        <div className={s.toastTitle}>Задача выполнена!</div>
        <div className={s.toastTask}>{title}</div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Tasks() {
  const { tasks, moveTask } = useTasksStore();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [addingIn, setAddingIn] = useState<TaskColumn | null>(null);
  const [toast,    setToast]    = useState({ visible: false, title: '' });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(title: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ visible: true, title });
    toastTimer.current = setTimeout(
      () => setToast((t) => ({ ...t, visible: false })),
      3000,
    );
  }

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(active.id as string);
    setAddingIn(null);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    if (!over) return;
    const targetCol = over.id as TaskColumn;
    const task = tasks.find((t) => t.id === active.id);
    if (!task || task.column === targetCol) return;
    moveTask(task.id, targetCol);
    if (targetCol === 'done') showToast(task.title);
  }

  const total  = tasks.length;
  const todayN = tasks.filter((t) => t.column === 'today').length;
  const doneN  = tasks.filter((t) => t.column === 'done').length;
  const pct    = total > 0 ? Math.round((doneN / total) * 100) : 0;

  const byCol      = (col: TaskColumn) => tasks.filter((t) => t.column === col);
  const activeTask = tasks.find((t) => t.id === activeId) ?? null;

  return (
    <div className={s.root}>

      {/* ── Stats ─────────────────────────────────────────────────────────────── */}
      <div className={s.statsSection}>
        <div className={s.statCards}>
          <div className={s.statCard}>
            <span className={s.statEmoji}>📋</span>
            <div>
              <div className={s.statValue}>{total}</div>
              <div className={s.statLabel}>Всего задач</div>
            </div>
          </div>
          <div className={s.statCard}>
            <span className={s.statEmoji}>⚡</span>
            <div>
              <div className={s.statValue}>{todayN}</div>
              <div className={s.statLabel}>На сегодня</div>
            </div>
          </div>
          <div className={s.statCard}>
            <span className={s.statEmoji}>✅</span>
            <div>
              <div className={s.statValue}>
                {doneN}
                {total > 0 && <span className={s.statPct}> ({pct}%)</span>}
              </div>
              <div className={s.statLabel}>Выполнено</div>
            </div>
          </div>
        </div>
        <div className={s.progressRow}>
          <div className={s.progressBar}>
            <div className={s.progressFill} style={{ width: `${pct}%` }} />
          </div>
          <span className={s.progressLabel}>{pct}% выполнено</span>
        </div>
      </div>

      {/* ── Board ─────────────────────────────────────────────────────────────── */}
      <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className={s.board}>
          {COLUMNS.map((col) => (
            <DroppableColumn
              key={col.id}
              col={col}
              tasks={byCol(col.id)}
              activeId={activeId}
              addingIn={addingIn}
              onStartAdd={setAddingIn}
              onCloseAdd={() => setAddingIn(null)}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeTask && (
            <div className={`${s.card} ${s.cardOverlay}`}>
              <CardContent task={activeTask} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* ── Toast ─────────────────────────────────────────────────────────────── */}
      <Toast title={toast.title} visible={toast.visible} />
    </div>
  );
}
