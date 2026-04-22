import { useState, useRef, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { productsApi, ProductType } from '../../api/products.api';
import { useProjectsStore } from '../../store/projects.store';
import s from './ProductWorkspace.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StrategyData {
  chosenSegment?:    string;
  chosenSubsegment?: string;
  wants?:            string;
  corePains?:        string;
  deepDesires?:      string;
  finalResult?:      string;
  triedSolutions?:   string;
}

export interface ProductItem {
  id:      string;
  dbId?:   string;   // ID в БД
  title:   string;
  preview: string;
  date:    string;
  status:  'draft' | 'ready';
  content: string;
  type:    string;
}

export interface ProductFormProps {
  onGenerate: (title: string, content: string) => void;
  loading:    boolean;
  strategy:   StrategyData | null;
}

interface Props {
  sectionTitle: string;
  productIcon:  string;
  emptyHint:    string;
  storageKey:   string;
  productType:  ProductType;
  FormComponent: React.ComponentType<ProductFormProps>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function makePreview(content: string): string {
  return content.replace(/\n+/g, ' ').trim().slice(0, 110);
}

function loadStrategy(): StrategyData | null {
  try {
    const raw = localStorage.getItem('strategy_answers');
    if (!raw) return null;
    const d = JSON.parse(raw) as StrategyData;
    if (!d.chosenSegment && !d.corePains) return null;
    return d;
  } catch { return null; }
}

function loadItems(key: string): ProductItem[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw) as ProductItem[];
  } catch { return []; }
}

function firstLine(text: string | undefined, fallback = ''): string {
  if (!text) return fallback;
  return text.split('\n')[0]?.replace(/^\d+\.\s*/, '').slice(0, 80) ?? fallback;
}

// ─── Strategy context block ───────────────────────────────────────────────────

export function StrategyContext({ strategy }: { strategy: StrategyData | null }) {
  if (!strategy) {
    return (
      <div className={s.strategyBanner}>
        💡 Для лучшего результата сначала пройдите{' '}
        <NavLink to="/strategy" className={s.strategyBannerLink}>Стратегию</NavLink>
        {' '}— ИИ использует данные о вашей аудитории.
      </div>
    );
  }
  return (
    <div className={s.strategyContext}>
      <span className={s.strategyContextLabel}>Из стратегии:</span>
      {strategy.chosenSegment && (
        <span className={s.strategyBadge}>{firstLine(strategy.chosenSegment)}</span>
      )}
      {strategy.chosenSubsegment && (
        <span className={s.strategyBadge}>{firstLine(strategy.chosenSubsegment)}</span>
      )}
      {strategy.finalResult && (
        <span className={s.strategyBadge}>{firstLine(strategy.finalResult, '').slice(0, 50)}</span>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProductWorkspace({
  sectionTitle,
  productIcon,
  emptyHint,
  storageKey,
  productType,
  FormComponent,
}: Props) {
  const strategy = loadStrategy();
  const { activeProjectId } = useProjectsStore();

  const [items,    setItems]    = useState<ProductItem[]>(() => loadItems(storageKey));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode,     setMode]     = useState<'generate' | 'editor'>('generate');
  const [loading,  setLoading]  = useState(false);

  const [editTitle,   setEditTitle]   = useState('');
  const [editContent, setEditContent] = useState('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeItem  = items.find((m) => m.id === activeId) ?? null;

  useEffect(() => {
    const local = loadItems(storageKey);
    setItems(local);
    setActiveId(null);
    setMode(local.length > 0 ? 'editor' : 'generate');
    // Загружаем из API и мёржим (API приоритет)
    if (activeProjectId) {
      productsApi.list(activeProjectId, productType)
        .then((apiProducts) => {
          if (!apiProducts.length) return;
          const merged: ProductItem[] = apiProducts.map((p) => ({
            id:      `prod-${p.id}`,
            dbId:    p.id,
            title:   p.title,
            content: p.shortDescription ?? '',
            preview: makePreview(p.shortDescription ?? ''),
            date:    formatDate(new Date(p.createdAt)),
            status:  'ready' as const,
            type:    p.title,
          }));
          setItems(merged);
          localStorage.setItem(storageKey, JSON.stringify(merged));
        })
        .catch(() => { /* БД недоступна — используем localStorage */ });
    }
  }, [storageKey, activeProjectId, productType]); // eslint-disable-line

  useEffect(() => {
    if (activeItem && mode === 'editor') {
      setEditTitle(activeItem.title);
      setEditContent(activeItem.content);
    }
  }, [activeId]); // eslint-disable-line

  const storageKeyRef = useRef(storageKey);
  useEffect(() => { storageKeyRef.current = storageKey; }, [storageKey]);

  const updateItems = useCallback((updater: ProductItem[] | ((prev: ProductItem[]) => ProductItem[])) => {
    setItems((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      localStorage.setItem(storageKeyRef.current, JSON.stringify(next));
      return next;
    });
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleCreateNew() {
    setActiveId(null);
    setMode('generate');
    setEditTitle('');
    setEditContent('');
  }

  function handleCardClick(item: ProductItem) {
    setActiveId(item.id);
    setEditTitle(item.title);
    setEditContent(item.content);
    setMode('editor');
  }

  function handleGenerate(title: string, content: string) {
    setLoading(true);
    setTimeout(() => {
      const id  = `prod-${Date.now()}`;
      const now = formatDate(new Date());
      const newItem: ProductItem = {
        id, title, content,
        preview: makePreview(content),
        date:    now,
        status:  'draft',
        type:    title,
      };
      updateItems((prev) => [newItem, ...prev]);
      setActiveId(id);
      setEditTitle(title);
      setEditContent(content);
      setMode('editor');
      setLoading(false);
      // Сохраняем в БД
      if (activeProjectId) {
        productsApi.create({ projectId: activeProjectId, type: productType, title, content, isAiGenerated: true })
          .then((dbProduct) => {
            updateItems((prev) =>
              prev.map((item) => item.id === id ? { ...item, dbId: dbProduct.id } : item),
            );
          })
          .catch(() => { /* fire-and-forget */ });
      }
    }, 1800);
  }

  function handleSave() {
    updateItems((prev) =>
      prev.map((m) =>
        m.id === activeId
          ? { ...m, title: editTitle, content: editContent, preview: makePreview(editContent), status: 'ready' }
          : m,
      ),
    );
    const dbId = items.find((m) => m.id === activeId)?.dbId;
    if (dbId) {
      void productsApi.update(dbId, { title: editTitle, content: editContent });
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(`${editTitle}\n\n${editContent}`).catch(() => undefined);
  }

  function handleDownload() {
    const text = `${editTitle}\n\n${editContent}`;
    const blob  = new Blob([text], { type: 'application/octet-stream' });
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement('a');
    a.href      = url;
    a.download  = `${editTitle.slice(0, 40).replace(/[^а-яёa-z0-9\s]/gi, '').trim() || 'product'}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={s.root}>

      {/* ── Column: list ─────────────────────────────────────────────────────── */}
      <div className={s.listCol}>
        <div className={s.listHeader}>
          <span className={s.listTitle}>
            {productIcon} {sectionTitle}
          </span>
          <button className={s.createBtn} onClick={handleCreateNew} disabled={loading}>
            + Создать
          </button>
        </div>

        <div className={s.listBody}>
          {items.length === 0 ? (
            <div className={s.emptyList}>{emptyHint}</div>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                className={`${s.card}${item.id === activeId && mode === 'editor' ? ' ' + s.cardActive : ''}`}
                onClick={() => handleCardClick(item)}
              >
                <div className={s.cardTitle}>{item.title}</div>
                <div className={s.cardPreview}>{item.preview}</div>
                <div className={s.cardMeta}>
                  <span className={s.cardDate}>{item.date}</span>
                  <span className={`${s.badge} ${item.status === 'ready' ? s.badgeReady : s.badgeDraft}`}>
                    {item.status === 'ready' ? 'Готов' : 'Черновик'}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Column: workspace ────────────────────────────────────────────────── */}
      <div className={s.workspaceCol}>

        {/* Generate form */}
        {mode === 'generate' && (
          <div className={s.generatePane}>
            <StrategyContext strategy={strategy} />
            <FormComponent onGenerate={handleGenerate} loading={loading} strategy={strategy} />
          </div>
        )}

        {/* Editor */}
        {mode === 'editor' && activeItem && (
          <div className={s.editorPane}>
            <div className={s.editorHeader}>
              <input
                className={s.editorTitleInput}
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Название продукта"
              />
            </div>

            <div className={s.editorBody}>
              <textarea
                ref={textareaRef}
                className={s.editorTextarea}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                placeholder="Структура продукта..."
              />
            </div>

            <div className={s.editorFooter}>
              <span className={s.charCount}>{editContent.length} символов</span>
              <div className={s.editorActions}>
                <button className={s.actionBtn} onClick={handleCopy}>📋 Копировать</button>
                <button className={s.actionBtn} onClick={handleDownload}>⬇️ Скачать</button>
                <button className={`${s.actionBtn} ${s.actionBtnPrimary}`} onClick={handleSave}>
                  💾 Сохранить
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Empty state when no item selected */}
        {mode === 'editor' && !activeItem && (
          <div className={s.emptyWorkspace}>
            <div className={s.emptyIcon}>{productIcon}</div>
            <div>Выберите продукт из списка или создайте новый</div>
          </div>
        )}

        {/* Loading overlay */}
        {loading && mode === 'generate' && (
          <div className={s.loadingPane}>
            <div className={s.loadingSpinner} />
            <div className={s.loadingText}>Генерирую структуру продукта…</div>
          </div>
        )}

      </div>
    </div>
  );
}
