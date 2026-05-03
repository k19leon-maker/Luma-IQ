import { useState } from 'react';
import toast from 'react-hot-toast';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  useDroppable,
} from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';

// ─── Types ────────────────────────────────────────────────────────────────────

type Category = 'strategy' | 'content' | 'products';
type Priority = 'high' | 'medium' | 'low';
type Column   = 'all' | 'today' | 'week' | 'done';

interface Task {
  id:       string;
  title:    string;
  category: Category;
  dueLabel: string;
  priority: Priority;
  done:     boolean;
  column:   Column;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_STYLE: Record<Category, { bg: string; color: string; label: string }> = {
  strategy: { bg: '#FDF3EF', color: '#C1502A', label: 'Стратегия'  },
  content:  { bg: '#E6F1FB', color: '#185FA5', label: 'Контент'    },
  products: { bg: '#EAF3DE', color: '#3B6D11', label: 'Продукты'   },
};

const PRIORITY_STYLE: Record<Priority, { color: string; label: string }> = {
  high:   { color: '#C1502A', label: 'Важно'   },
  medium: { color: '#D4A847', label: 'Средний' },
  low:    { color: '#888',    label: 'Низкий'  },
};

const COLUMNS: { id: Column; label: string; dot: string }[] = [
  { id: 'all',   label: 'Все задачи', dot: '#888'    },
  { id: 'today', label: 'Сегодня',    dot: '#D4A847' },
  { id: 'week',  label: 'На неделе',  dot: '#2563EB' },
  { id: 'done',  label: 'Выполнено',  dot: '#4A7C59' },
];

// ─── Initial tasks ────────────────────────────────────────────────────────────

const INITIAL_TASKS: Task[] = [
  { id: '1',  title: 'Создать УТП',                   category: 'strategy', dueLabel: '7 мая',   priority: 'high',   done: false, column: 'all'   },
  { id: '2',  title: 'Создать мини-продукт',           category: 'products', dueLabel: '10 мая',  priority: 'medium', done: false, column: 'all'   },
  { id: '3',  title: 'Запланировать контент на май',   category: 'content',  dueLabel: '9 мая',   priority: 'low',    done: false, column: 'all'   },
  { id: '4',  title: 'Заполнить анкету распаковки',   category: 'strategy', dueLabel: 'Сегодня', priority: 'high',   done: false, column: 'today' },
  { id: '5',  title: 'Написать 3 поста для Telegram', category: 'content',  dueLabel: 'Сегодня', priority: 'medium', done: false, column: 'today' },
  { id: '6',  title: 'Выбрать целевую аудиторию',     category: 'strategy', dueLabel: '5 мая',   priority: 'high',   done: false, column: 'week'  },
  { id: '7',  title: 'Создать основной продукт',      category: 'products', dueLabel: '8 мая',   priority: 'medium', done: false, column: 'week'  },
  { id: '8',  title: 'Оформить профиль Instagram',    category: 'strategy', dueLabel: '2 мая',   priority: 'medium', done: true,  column: 'done'  },
  { id: '9',  title: 'Создать лид-магнит',            category: 'products', dueLabel: '2 мая',   priority: 'low',    done: true,  column: 'done'  },
  { id: '10', title: 'Снять рилс «Мой метод»',        category: 'content',  dueLabel: '1 мая',   priority: 'low',    done: true,  column: 'done'  },
  { id: '11', title: 'Распаковка завершена',          category: 'strategy', dueLabel: '30 апр',  priority: 'high',   done: true,  column: 'done'  },
];

// ─── Icons ────────────────────────────────────────────────────────────────────

function CalendarIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ marginRight: 3, verticalAlign: 'middle' }}>
      <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 9h18M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
      <path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── AddModal ─────────────────────────────────────────────────────────────────

function AddModal({ column, onClose, onAdd }: {
  column: Column;
  onClose: () => void;
  onAdd: (task: Omit<Task, 'id'>) => void;
}) {
  const [title,    setTitle]    = useState('');
  const [category, setCategory] = useState<Category>('strategy');
  const [priority, setPriority] = useState<Priority>('medium');

  function handleSubmit() {
    if (!title.trim()) return;
    onAdd({ title: title.trim(), category, priority, dueLabel: column === 'today' ? 'Сегодня' : '', done: column === 'done', column });
    onClose();
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 12, padding: 28, width: 440, display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: 17, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>Новая задача</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, color: '#888' }}>Название</label>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="Что нужно сделать?"
            style={{ padding: '10px 12px', border: '1px solid #E5E3DC', borderRadius: 8, fontSize: 14, outline: 'none', fontFamily: 'inherit' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: '#888' }}>Раздел</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              style={{ padding: '10px 12px', border: '1px solid #E5E3DC', borderRadius: 8, fontSize: 14, outline: 'none', fontFamily: 'inherit', background: '#fff' }}
            >
              <option value="strategy">Стратегия</option>
              <option value="content">Контент</option>
              <option value="products">Продукты</option>
            </select>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: '#888' }}>Приоритет</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              style={{ padding: '10px 12px', border: '1px solid #E5E3DC', borderRadius: 8, fontSize: 14, outline: 'none', fontFamily: 'inherit', background: '#fff' }}
            >
              <option value="high">Важно</option>
              <option value="medium">Средний</option>
              <option value="low">Низкий</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #E5E3DC', background: '#fff', color: '#555', fontSize: 14, cursor: 'pointer' }}>
            Отмена
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim()}
            style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: title.trim() ? '#D4A847' : '#F0EEE8', color: title.trim() ? '#fff' : '#bbb', fontSize: 14, fontWeight: 500, cursor: title.trim() ? 'pointer' : 'not-allowed' }}
          >
            Создать
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── TaskCardInner ─────────────────────────────────────────────────────────────
// Shared rendering for both draggable card and overlay ghost

function TaskCardInner({ task, onToggle, isDragging = false }: {
  task: Task;
  onToggle?: (id: string) => void;
  isDragging?: boolean;
}) {
  const cat     = CATEGORY_STYLE[task.category];
  const pri     = PRIORITY_STYLE[task.priority];
  const isToday = task.dueLabel === 'Сегодня';

  return (
    <div style={{
      background: '#fff',
      border: `0.5px solid ${isDragging ? '#D4A847' : '#E5E3DC'}`,
      borderRadius: 8,
      padding: '12px 14px',
      cursor: isDragging ? 'grabbing' : 'grab',
      opacity: isDragging ? 0.95 : 1,
      boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.15)' : 'none',
      transition: 'border-color 0.15s, box-shadow 0.15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 500, background: cat.bg, color: cat.color }}>
          {cat.label}
        </span>
        {onToggle && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onToggle(task.id); }}
            style={{
              width: 18, height: 18, borderRadius: 4,
              border: task.done ? 'none' : '1.5px solid #D3D1C7',
              background: task.done ? '#4A7C59' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', padding: 0, flexShrink: 0,
            }}
          >
            {task.done && <CheckIcon />}
          </button>
        )}
      </div>

      <div style={{ fontSize: 14, fontWeight: 500, color: task.done ? '#aaa' : '#1a1a1a', textDecoration: task.done ? 'line-through' : 'none', marginBottom: 8, lineHeight: 1.4 }}>
        {task.title}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: isToday ? '#C1502A' : '#aaa', display: 'flex', alignItems: 'center' }}>
          <CalendarIcon />
          {task.dueLabel}
        </span>
        <span style={{ fontSize: 11, color: pri.color, fontWeight: 500 }}>
          {pri.label}
        </span>
      </div>
    </div>
  );
}

// ─── DraggableTaskCard ────────────────────────────────────────────────────────

function DraggableTaskCard({ task, onToggle }: { task: Task; onToggle: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ marginBottom: 8, opacity: isDragging ? 0.35 : 1, transition: 'opacity 0.15s' }}
    >
      <TaskCardInner task={task} onToggle={onToggle} />
    </div>
  );
}

// ─── DroppableColumn ──────────────────────────────────────────────────────────

function DroppableColumn({ col, tasks, onToggle, onAddClick }: {
  col: typeof COLUMNS[number];
  tasks: Task[];
  onToggle: (id: string) => void;
  onAddClick: (column: Column) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      {/* Column header */}
      <div style={{ borderBottom: `2px solid ${col.dot}`, paddingBottom: 8, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.dot, flexShrink: 0, display: 'inline-block' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', flex: 1 }}>{col.label}</span>
        <span style={{
          minWidth: 20, height: 20, borderRadius: 10, background: '#F5F4F0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 600, color: '#888', padding: '0 6px',
        }}>
          {tasks.length}
        </span>
      </div>

      {/* Add button */}
      <button
        onClick={() => onAddClick(col.id)}
        style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 13, cursor: 'pointer', textAlign: 'left', padding: '0 0 10px', transition: 'color 0.15s' }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#D4A847')}
        onMouseLeave={(e) => (e.currentTarget.style.color = '#aaa')}
      >
        + Добавить задачу
      </button>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        style={{
          flex: 1,
          minHeight: 80,
          borderRadius: 8,
          background: isOver ? 'rgba(212, 168, 71, 0.06)' : 'transparent',
          border: isOver ? '1.5px dashed #D4A847' : '1.5px dashed transparent',
          transition: 'background 0.15s, border-color 0.15s',
          padding: isOver ? 4 : 0,
        }}
      >
        {tasks.map((t) => (
          <DraggableTaskCard key={t.id} task={t} onToggle={onToggle} />
        ))}

        {tasks.length === 0 && !isOver && (
          <div style={{ fontSize: 12, color: '#ddd', textAlign: 'center', paddingTop: 16 }}>
            Перетащите сюда
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Tasks() {
  const [tasks,     setTasks]     = useState<Task[]>(INITIAL_TASKS);
  const [addColumn, setAddColumn] = useState<Column | null>(null);
  const [activeId,  setActiveId]  = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const total      = tasks.length;
  const doneCount  = tasks.filter((t) => t.done).length;
  const todayCount = tasks.filter((t) => t.column === 'today').length;
  const weekCount  = tasks.filter((t) => t.column === 'week').length;
  const pct        = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  function handleToggle(id: string) {
    setTasks((prev) => {
      const task = prev.find((t) => t.id === id);
      if (!task) return prev;
      const nowDone = !task.done;
      if (nowDone) toast.success('Задача выполнена 🎉');
      return prev.map((t) =>
        t.id === id
          ? { ...t, done: nowDone, column: nowDone ? 'done' : t.column === 'done' ? 'all' : t.column }
          : t
      );
    });
  }

  function handleAdd(task: Omit<Task, 'id'>) {
    setTasks((prev) => [...prev, { ...task, id: crypto.randomUUID() }]);
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const taskId    = active.id as string;
    const targetCol = over.id as Column;
    const validCols = new Set<Column>(['all', 'today', 'week', 'done']);
    if (!validCols.has(targetCol)) return;

    setTasks((prev) => prev.map((t) => {
      if (t.id !== taskId) return t;
      if (t.column === targetCol) return t;
      const nowDone = targetCol === 'done';
      if (nowDone && !t.done) toast.success('Задача выполнена 🎉');
      return { ...t, column: targetCol, done: nowDone };
    }));
  }

  const tasksByColumn: Record<Column, Task[]> = {
    all:   tasks.filter((t) => t.column === 'all'),
    today: tasks.filter((t) => t.column === 'today'),
    week:  tasks.filter((t) => t.column === 'week'),
    done:  tasks.filter((t) => t.column === 'done'),
  };

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  return (
    <div style={{ backgroundColor: '#fff', minHeight: '100%', paddingBottom: 40 }}>

      {/* Header row 1 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: '#1a1a1a', margin: 0 }}>План задач</h1>
          <span style={{ fontSize: 13, color: '#888' }}>{total} задач · {pct}% выполнено</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E5E3DC', background: '#fff', color: '#555', fontSize: 13, cursor: 'pointer' }}>
            Фильтр
          </button>
          <button
            onClick={() => setAddColumn('all')}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#D4A847', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
          >
            + Добавить задачу
          </button>
        </div>
      </div>

      {/* Header row 2 — stats */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 28 }}>
        <span style={{ fontSize: 13, color: '#888' }}><strong style={{ color: '#1a1a1a' }}>{total}</strong> Всего</span>
        <span style={{ fontSize: 13, color: '#888' }}><strong style={{ color: '#D4A847' }}>{todayCount}</strong> Сегодня</span>
        <span style={{ fontSize: 13, color: '#888' }}><strong style={{ color: '#2563EB' }}>{weekCount}</strong> На неделе</span>
        <span style={{ fontSize: 13, color: '#888' }}><strong style={{ color: '#4A7C59' }}>{doneCount}</strong> Выполнено</span>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 120, height: 6, borderRadius: 3, background: '#F0EEE8', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: '#D4A847', borderRadius: 3, transition: 'width 0.3s' }} />
          </div>
          <span style={{ fontSize: 12, color: '#888', fontWeight: 500 }}>{pct}%</span>
        </div>
      </div>

      {/* Kanban with DnD */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {COLUMNS.map((col) => (
            <DroppableColumn
              key={col.id}
              col={col}
              tasks={tasksByColumn[col.id]}
              onToggle={handleToggle}
              onAddClick={setAddColumn}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTask && <TaskCardInner task={activeTask} isDragging />}
        </DragOverlay>
      </DndContext>

      {addColumn !== null && (
        <AddModal
          column={addColumn}
          onClose={() => setAddColumn(null)}
          onAdd={handleAdd}
        />
      )}
    </div>
  );
}
