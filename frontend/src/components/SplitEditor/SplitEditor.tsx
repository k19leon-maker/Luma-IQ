import { ReactNode } from 'react';
import s from './SplitEditor.module.css';

export interface SplitItem {
  id: string;
  icon: string;
  title: string;
  meta: string;
  preview: string;
}

interface SplitEditorProps<T extends SplitItem> {
  items: T[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Renders the right panel. Receives the active item or null if nothing selected. */
  renderEditor: (item: T | null) => ReactNode;
  listTitle?: string;
}

export function SplitEditor<T extends SplitItem>({
  items,
  selectedId,
  onSelect,
  renderEditor,
  listTitle,
}: SplitEditorProps<T>) {
  const selected = items.find((i) => i.id === selectedId) ?? null;

  return (
    <div className={s.root}>
      {/* ── List panel ─────────────────────────────────────────── */}
      <div className={s.listPanel}>
        {listTitle && <div className={s.listHeader}>{listTitle}</div>}
        <div className={s.listScroll}>
          {items.map((item) => {
            const isActive = item.id === selectedId;
            return (
              <button
                key={item.id}
                className={`${s.card}${isActive ? ' ' + s.cardActive : ''}`}
                onClick={() => onSelect(item.id)}
              >
                <span className={s.cardIcon}>{item.icon}</span>
                <div className={s.cardBody}>
                  <div className={s.cardTitle}>{item.title}</div>
                  <div className={s.cardMeta}>{item.meta}</div>
                  <div className={s.cardPreview}>{item.preview}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Editor panel ───────────────────────────────────────── */}
      <div className={s.editorPanel}>
        {selected === null ? (
          <div className={s.emptyState}>
            <span className={s.emptyIcon}>☝️</span>
            <span className={s.emptyText}>Выберите продукт слева</span>
          </div>
        ) : (
          renderEditor(selected)
        )}
      </div>
    </div>
  );
}
