import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProjectsStore } from '../../store/projects.store';
import { useAudienceStore } from '../../store/audience.store';
import { PROJECTS_DATA, ProjectData, ProductDoc, StrategyDoc } from '../../data/projectsData';
import { exportToDocx } from '../../utils/exportDocx';
import s from './ProjectPage.module.css';

function buildStrategyFromAudienceStore(projectId: string): ProjectData | null {
  const store = useAudienceStore.getState();
  const { answers, completed } = store.get(projectId);
  if (!completed) return null;
  const segment = answers.chosenSegment || answers.segments || '';
  if (!segment) return null;
  const strategy: StrategyDoc = {
    segment,
    subsegment:    answers.chosenSubsegment || answers.subsegments || '',
    wantList:      answers.wants || '',
    tenRequests:   answers.requests || '',
    painQuestions: answers.painfulQuestions || '',
    deepDesires:   answers.deepDesires || '',
    finalResult:   answers.finalResult || '',
    triedBefore:   '',
    threeKeyPains: answers.corePains || '',
    mainAnnoying:  answers.corePains || '',
    createdAt:     new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }),
  };
  return {
    id: projectId,
    name: '',
    color: '#7c6cfc',
    createdAt: '',
    strategy,
    products: [],
  };
}

function countLocalProducts(projectId: string, type: 'main' | 'mini' | 'free'): number {
  try {
    const raw = localStorage.getItem(`products_${type}_${projectId}`);
    if (!raw) return 0;
    const arr = JSON.parse(raw) as unknown[];
    return Array.isArray(arr) ? arr.length : 0;
  } catch { return 0; }
}

const PANEL_WIDTH = 520;

// ─── Side panel ───────────────────────────────────────────────────────────────

type PanelContent =
  | { kind: 'strategy'; data: ProjectData }
  | { kind: 'product';  data: ProductDoc };

function SidePanel({
  content,
  open,
  onClose,
}: {
  content: PanelContent | null;
  open: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCopied(false);
  }, [content]);

  function handleCopy() {
    if (!content || content.kind !== 'product') return;
    navigator.clipboard.writeText(
      `${content.data.name}\n\n${content.data.description}`
    ).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownloadStrategy() {
    if (!content || content.kind !== 'strategy') return;
    const { strategy, name } = content.data;
    const text = [
      `Сегмент: ${strategy.segment}`,
      `Подсегмент: ${strategy.subsegment}`,
      `Список «ХОЧУ»:\n${strategy.wantList}`,
      `10 запросов сегмента:\n${strategy.tenRequests}`,
      `Болезненные вопросы:\n${strategy.painQuestions}`,
      `Сокровенные желания:\n${strategy.deepDesires}`,
      `Конечный результат:\n${strategy.finalResult}`,
      `Что уже пробовала ЦА:\n${strategy.triedBefore}`,
      `3 ключевые боли:\n${strategy.threeKeyPains}`,
      `Что бесит больше всего:\n${strategy.mainAnnoying}`,
    ].join('\n\n');
    void exportToDocx(`Стратегия: ${name}`, text, `strategy-${name.replace(/\s+/g, '-').toLowerCase()}`);
  }

  function handleDownloadProduct() {
    if (!content || content.kind !== 'product') return;
    const { name, description, price, duration } = content.data;
    const text = `${description}\n\nЦена: ${price}\nФормат: ${duration}`;
    void exportToDocx(name, text, name.replace(/\s+/g, '-').toLowerCase());
  }

  const isStrategy = content?.kind === 'strategy';
  const isProduct  = content?.kind === 'product';

  return (
    <>
      <div
        className={`${s.panelOverlay} ${open ? s.panelOverlayVisible : ''}`}
        onClick={onClose}
      />
      <div className={`${s.sidePanel} ${open ? s.sidePanelOpen : ''}`}>
        {content && (
          <>
            {/* Header */}
            <div className={s.sidePanelHeader}>
              <div className={s.sidePanelHeaderLeft}>
                <div className={s.sidePanelBadge}>
                  {isStrategy ? '📋 Стратегия' : `${(content as {kind:'product';data:ProductDoc}).data.icon} ${(content as {kind:'product';data:ProductDoc}).data.label}`}
                </div>
                <div className={s.sidePanelTitle}>
                  {isStrategy
                    ? `Стратегия: ${(content as {kind:'strategy';data:ProjectData}).data.name}`
                    : (content as {kind:'product';data:ProductDoc}).data.name}
                </div>
              </div>
              <button className={s.sidePanelCloseBtn} onClick={onClose}>✕</button>
            </div>

            {/* Body */}
            <div className={s.sidePanelBody}>
              {isStrategy && (() => {
                const { strategy } = (content as {kind:'strategy';data:ProjectData}).data;
                const sections: { title: string; text: string }[] = [
                  { title: 'Сегмент',                text: strategy.segment },
                  { title: 'Подсегмент',             text: strategy.subsegment },
                  { title: 'Список «ХОЧУ»',          text: strategy.wantList },
                  { title: '10 запросов сегмента',   text: strategy.tenRequests },
                  { title: 'Болезненные вопросы',    text: strategy.painQuestions },
                  { title: 'Сокровенные желания',    text: strategy.deepDesires },
                  { title: 'Конечный результат',     text: strategy.finalResult },
                  { title: 'Что уже пробовала ЦА',  text: strategy.triedBefore },
                  { title: '3 ключевые боли',        text: strategy.threeKeyPains },
                  { title: 'Что бесит больше всего', text: strategy.mainAnnoying },
                ];
                return sections.map(({ title, text }) => (
                  <div key={title} className={s.stratSection}>
                    <div className={s.stratSectionTitle}>{title}</div>
                    <div className={s.stratSectionText}>{text}</div>
                  </div>
                ));
              })()}

              {isProduct && (
                <div className={s.productPanelText}>
                  {(content as {kind:'product';data:ProductDoc}).data.description}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className={s.sidePanelFooter}>
              {isStrategy && (
                <button className={s.sidePanelBtn} onClick={handleDownloadStrategy}>
                  ⬇️ Скачать .docx
                </button>
              )}
              {isProduct && (
                <>
                  <button className={s.sidePanelBtn} onClick={handleCopy}>
                    {copied ? '✅ Скопировано!' : '📋 Копировать'}
                  </button>
                  <button className={s.sidePanelBtn} onClick={handleDownloadProduct}>
                    ⬇️ Скачать .docx
                  </button>
                </>
              )}
              <button className={s.sidePanelBtn} onClick={onClose}>✕ Закрыть</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const projects          = useProjectsStore((s) => s.projects);
  const activeProjectId  = useProjectsStore((s) => s.activeProjectId);
  const loading          = useProjectsStore((s) => s.loading);
  const setActiveProjectId = useProjectsStore((s) => s.setActiveProjectId);
  const renameProject    = useProjectsStore((s) => s.renameProject);
  const addProject       = useProjectsStore((s) => s.addProject);

  // Activate this project when the page mounts / id changes
  useEffect(() => {
    if (id && id !== activeProjectId) setActiveProjectId(id);
  }, [id]);

  const data = id ? PROJECTS_DATA[id] : undefined;
  const localProject = projects.find((p) => p.id === id);
  const audienceData = useAudienceStore((s) => id ? s.projects[id] : undefined);
  const localStrategyData = (!data && id && audienceData?.completed)
    ? buildStrategyFromAudienceStore(id)
    : null;

  // Panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [displayed, setDisplayed] = useState<PanelContent | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function openPanel(content: PanelContent) {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setDisplayed(content);
    requestAnimationFrame(() => setPanelOpen(true));
  }

  function closePanel() {
    setPanelOpen(false);
    closeTimer.current = setTimeout(() => setDisplayed(null), 320);
  }

  // Rename modal
  const [renameOpen,  setRenameOpen]  = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);

  function openRename() {
    setRenameValue(localProject?.name ?? data?.name ?? '');
    setRenameOpen(true);
    setTimeout(() => renameRef.current?.focus(), 50);
  }

  function handleRename() {
    const name = renameValue.trim();
    if (!name || !id) return;
    renameProject(id, name);
    setRenameOpen(false);
  }

  function handleNewProject() {
    addProject('Новый проект')
      .then((proj) => navigate(`/projects/${proj.id}`))
      .catch(() => undefined);
  }

  function handleCopyProduct(product: ProductDoc) {
    const text = `${product.name}\n\n${product.description}\n\nЦена: ${product.price}\nФормат: ${product.duration}`;
    navigator.clipboard.writeText(text).catch(() => undefined);
  }

  if (!data && !localProject) {
    if (loading) return null;
    return (
      <div className={s.notFound}>
        <div className={s.notFoundIcon}>🗂</div>
        <div className={s.notFoundTitle}>Проект не найден</div>
        <div className={s.notFoundText}>Возможно, этот проект был удалён</div>
      </div>
    );
  }

  const displayName = localProject?.name ?? data?.name ?? 'Проект';
  const color       = localProject?.color ?? data?.color ?? '#7c6cfc';
  const createdAt   = data?.createdAt ?? '';
  const panelWidth  = PANEL_WIDTH;

  return (
    <div className={s.root}>
      <div
        className={s.contentArea}
        style={{ marginRight: panelOpen ? panelWidth : 0 }}
      >
        {/* Page header */}
        <div className={s.pageHeader}>
          <div className={s.projectColorDot} style={{ background: color }} />
          <div className={s.pageHeaderMain}>
            <div className={s.projectName}>{displayName}</div>
            {createdAt && <div className={s.projectDate}>Создан: {createdAt}</div>}
          </div>
          <div className={s.pageHeaderActions}>
            <button className={s.headerBtn} onClick={openRename}>
              ✏️ Переименовать
            </button>
            <button className={`${s.headerBtn} ${s.headerBtnNew}`} onClick={handleNewProject}>
              + Создать новый проект
            </button>
          </div>
        </div>

        {data ? (
          <>
            {/* Section 1 — Упаковка */}
            <div className={s.section}>
              <div className={s.sectionTitle}>📋 Упаковка</div>

              <div className={s.docCard}>
                <div className={s.docCardHeader}>
                  <span className={s.docCardIcon}>📄</span>
                  <span className={s.docCardTitle}>Стратегия · {data.name}</span>
                </div>
                <div className={s.docCardMeta}>
                  <div className={s.docCardField}>
                    <span className={s.docCardLabel}>Сегмент:</span>
                    <span className={s.docCardValue}>
                      {data.strategy.segment.split('\n')[0].slice(0, 60)}{data.strategy.segment.length > 60 ? '…' : ''}
                    </span>
                  </div>
                  <div className={s.docCardField}>
                    <span className={s.docCardLabel}>Подсегмент:</span>
                    <span className={s.docCardValue}>
                      {data.strategy.subsegment.split('\n')[0].slice(0, 60)}{data.strategy.subsegment.length > 60 ? '…' : ''}
                    </span>
                  </div>
                </div>
                <div className={s.docCardDate}>Создан: {data.strategy.createdAt}</div>
                <div className={s.docCardActions}>
                  <button
                    className={s.docBtn}
                    onClick={() => openPanel({ kind: 'strategy', data })}
                  >
                    👁 Посмотреть
                  </button>
                  <button
                    className={s.docBtn}
                    onClick={() => {
                      openPanel({ kind: 'strategy', data });
                      // trigger download after panel opens
                    }}
                  >
                    ⬇️ Скачать .docx
                  </button>
                </div>
              </div>
            </div>

            {/* Section 2 — Продукты */}
            <div className={s.section}>
              <div className={s.sectionTitle}>📦 Продукты</div>
              <div className={s.productsGrid}>
                {data.products.map((product) => (
                  <div key={product.type} className={s.productCard}>
                    <div className={s.productCardHeader}>
                      <span className={s.productIcon}>{product.icon}</span>
                      <span className={s.productLabel}>{product.label}</span>
                    </div>
                    <div className={s.productName}>{product.name}</div>
                    <div className={s.productDesc}>{product.description}</div>
                    <div className={s.productPriceRow}>
                      <span className={s.productPrice}>{product.price}</span>
                      <span className={s.productDuration}>· {product.duration}</span>
                    </div>
                    <div className={s.productActions}>
                      <button
                        className={s.docBtn}
                        onClick={() => openPanel({ kind: 'product', data: product })}
                      >
                        👁 Посмотреть
                      </button>
                      <button
                        className={s.docBtn}
                        onClick={() => handleCopyProduct(product)}
                      >
                        📋 Копировать
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : localStrategyData ? (
          <>
            {/* Section 1 — Упаковка */}
            <div className={s.section}>
              <div className={s.sectionTitle}>📋 Упаковка</div>
              <div className={s.docCard}>
                <div className={s.docCardHeader}>
                  <span className={s.docCardIcon}>📄</span>
                  <span className={s.docCardTitle}>Стратегия · {displayName}</span>
                </div>
                <div className={s.docCardMeta}>
                  <div className={s.docCardField}>
                    <span className={s.docCardLabel}>Сегмент:</span>
                    <span className={s.docCardValue}>
                      {localStrategyData.strategy.segment.split('\n')[0].slice(0, 60)}
                      {localStrategyData.strategy.segment.length > 60 ? '…' : ''}
                    </span>
                  </div>
                  {localStrategyData.strategy.subsegment && (
                    <div className={s.docCardField}>
                      <span className={s.docCardLabel}>Подсегмент:</span>
                      <span className={s.docCardValue}>
                        {localStrategyData.strategy.subsegment.split('\n')[0].slice(0, 60)}
                        {localStrategyData.strategy.subsegment.length > 60 ? '…' : ''}
                      </span>
                    </div>
                  )}
                </div>
                <div className={s.docCardDate}>Создан: {localStrategyData.strategy.createdAt}</div>
                <div className={s.docCardActions}>
                  <button
                    className={s.docBtn}
                    onClick={() => openPanel({ kind: 'strategy', data: { ...localStrategyData, name: displayName } })}
                  >
                    👁 Посмотреть
                  </button>
                </div>
              </div>
            </div>

            {/* Section 2 — Продукты */}
            {id && (
              <div className={s.section}>
                <div className={s.sectionTitle}>📦 Продукты</div>
                <div className={s.productsGrid}>
                  {([
                    { type: 'main' as const, icon: '🚀', label: 'Основной продукт', path: '/products/main' },
                    { type: 'mini' as const, icon: '⚡', label: 'Мини-продукт',     path: '/products/mini' },
                    { type: 'free' as const, icon: '🎁', label: 'Бесплатный',       path: '/products/lead-magnet' },
                  ]).map(({ type, icon, label, path }) => {
                    const count = countLocalProducts(id, type);
                    return (
                      <div key={type} className={s.productCard}>
                        <div className={s.productCardHeader}>
                          <span className={s.productIcon}>{icon}</span>
                          <span className={s.productLabel}>{label}</span>
                        </div>
                        <div className={s.productName}>
                          {count > 0 ? `${count} вариант${count === 1 ? '' : count < 5 ? 'а' : 'ов'}` : 'Не создано'}
                        </div>
                        <div className={s.productDesc}>
                          {count > 0 ? 'Нажмите «Открыть» чтобы редактировать' : 'Создайте описание продукта'}
                        </div>
                        <div className={s.productActions}>
                          <button className={s.docBtn} onClick={() => navigate(path)}>
                            {count > 0 ? '✏️ Открыть' : '+ Создать'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className={s.section}>
            <div className={s.notFoundText}>
              Данные проекта ещё не заполнены. Начните со{' '}
              <a href="/strategy" style={{ color: 'var(--accent)' }}>Стратегии</a>.
            </div>
          </div>
        )}
      </div>

      {/* Side panel */}
      <SidePanel
        content={displayed}
        open={panelOpen}
        onClose={closePanel}
      />

      {/* Rename modal */}
      {renameOpen && (
        <div className={s.renameOverlay} onClick={() => setRenameOpen(false)}>
          <div className={s.renameModal} onClick={(e) => e.stopPropagation()}>
            <div className={s.renameTitle}>Переименовать проект</div>
            <input
              ref={renameRef}
              className={s.renameInput}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
              placeholder="Название проекта"
            />
            <div className={s.renameActions}>
              <button className={s.renameCancelBtn} onClick={() => setRenameOpen(false)}>
                Отмена
              </button>
              <button
                className={s.renameSaveBtn}
                onClick={handleRename}
                disabled={!renameValue.trim()}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
