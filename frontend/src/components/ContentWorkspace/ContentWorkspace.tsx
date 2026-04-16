import { useState, useRef, useEffect } from 'react';
import s from './ContentWorkspace.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContentMaterial {
  id: string;
  title: string;
  preview: string;
  date: string;
  status: 'draft' | 'ready';
  content: string;
}

export interface FormProps {
  onGenerate: (title: string, content: string) => void;
  loading: boolean;
}

interface Props {
  sectionTitle: string;
  initialMaterials: ContentMaterial[];
  FormComponent: React.ComponentType<FormProps>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function makePreview(content: string): string {
  return content.replace(/\n/g, ' ').trim().slice(0, 120);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ContentWorkspace({ sectionTitle, initialMaterials, FormComponent }: Props) {
  const [materials, setMaterials] = useState<ContentMaterial[]>(initialMaterials);
  const [activeId,  setActiveId]  = useState<string | null>(initialMaterials[0]?.id ?? null);
  const [mode,      setMode]      = useState<'generate' | 'editor'>(
    initialMaterials.length > 0 ? 'editor' : 'generate',
  );
  const [loading, setLoading] = useState(false);

  // Editor state
  const [editTitle,   setEditTitle]   = useState(initialMaterials[0]?.title   ?? '');
  const [editContent, setEditContent] = useState(initialMaterials[0]?.content ?? '');

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeMaterial = materials.find((m) => m.id === activeId) ?? null;

  // Sync editor when active material changes
  useEffect(() => {
    if (activeMaterial && mode === 'editor') {
      setEditTitle(activeMaterial.title);
      setEditContent(activeMaterial.content);
    }
  }, [activeId]); // eslint-disable-line

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleCreateNew() {
    setActiveId(null);
    setMode('generate');
    setEditTitle('');
    setEditContent('');
  }

  function handleCardClick(m: ContentMaterial) {
    setActiveId(m.id);
    setEditTitle(m.title);
    setEditContent(m.content);
    setMode('editor');
  }

  function handleGenerate(title: string, content: string) {
    setLoading(true);
    setTimeout(() => {
      const id = `m-${Date.now()}`;
      const now = formatDate(new Date());
      const newMaterial: ContentMaterial = {
        id,
        title,
        preview: makePreview(content),
        date: now,
        status: 'draft',
        content,
      };
      setMaterials((prev) => [newMaterial, ...prev]);
      setActiveId(id);
      setEditTitle(title);
      setEditContent(content);
      setMode('editor');
      setLoading(false);
    }, 1500);
  }

  function handleSave() {
    setMaterials((prev) =>
      prev.map((m) =>
        m.id === activeId
          ? { ...m, title: editTitle, content: editContent, preview: makePreview(editContent), status: 'ready' }
          : m,
      ),
    );
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
    a.download  = `${editTitle.slice(0, 40).replace(/[^а-яёa-z0-9\s]/gi, '').trim() || 'material'}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleContentPlan() {
    alert('Добавлено в контент-план (функция в разработке)');
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className={s.root}>

      {/* ── Column 2: list ───────────────────────────────────────────────────── */}
      <div className={s.listCol}>
        <div className={s.listHeader}>
          <span className={s.listTitle}>{sectionTitle}</span>
          <button className={s.createBtn} onClick={handleCreateNew} disabled={loading}>
            ➕ Создать новый
          </button>
        </div>

        <div className={s.listBody}>
          {materials.length === 0 ? (
            <div className={s.emptyList}>
              Пока нет материалов.<br />Создайте первый!
            </div>
          ) : (
            materials.map((m) => (
              <button
                key={m.id}
                className={`${s.card}${m.id === activeId && mode === 'editor' ? ' ' + s.cardActive : ''}`}
                onClick={() => handleCardClick(m)}
              >
                <div className={s.cardTitle}>{m.title}</div>
                <div className={s.cardPreview}>{m.preview}</div>
                <div className={s.cardMeta}>
                  <span className={s.cardDate}>{m.date}</span>
                  <span className={`${s.badge} ${m.status === 'ready' ? s.badgeReady : s.badgeDraft}`}>
                    {m.status === 'ready' ? 'Готов' : 'Черновик'}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Column 3: workspace ──────────────────────────────────────────────── */}
      <div className={s.workspaceCol}>

        {mode === 'generate' && (
          <div className={s.generatePane}>
            <FormComponent onGenerate={handleGenerate} loading={loading} />
          </div>
        )}

        {mode === 'editor' && activeMaterial && (
          <div className={s.editorPane}>
            <div className={s.editorHeader}>
              <input
                className={s.editorTitleInput}
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Заголовок материала"
              />
            </div>

            <div className={s.editorBody}>
              <textarea
                ref={textareaRef}
                className={s.editorTextarea}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                placeholder="Текст материала..."
              />
            </div>

            <div className={s.editorFooter}>
              <span className={s.charCount}>{editContent.length} символов</span>
              <div className={s.editorActions}>
                <button className={s.actionBtn} onClick={handleCopy}>📋 Копировать</button>
                <button className={s.actionBtn} onClick={handleContentPlan}>📅 В контент-план</button>
                <button className={s.actionBtn} onClick={handleDownload}>⬇️ Скачать .docx</button>
                <button className={`${s.actionBtn} ${s.actionBtnPrimary}`} onClick={handleSave}>
                  💾 Сохранить
                </button>
              </div>
            </div>
          </div>
        )}

        {mode === 'editor' && !activeMaterial && (
          <div className={s.emptyWorkspace}>
            <div className={s.emptyWorkspaceIcon}>✏️</div>
            <div>Выберите материал из списка или создайте новый</div>
          </div>
        )}

      </div>
    </div>
  );
}
