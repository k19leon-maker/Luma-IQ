import { type KeyboardEvent, type RefObject, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CalendarPlus,
  Copy,
  Ellipsis,
  Plus,
  RefreshCw,
  Check,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { AiBatchJob } from '../../api/ai';
import AiWorkflowCost from '../../components/AiWorkflowCost/AiWorkflowCost';
import { ContentRevisionComposer } from '../../components/ContentRevisionComposer/ContentRevisionComposer';
import { TgChannelResult, TgPlanItem, TgPostStatus } from './tgChannelWorkspace';
import { TgChannelIdeaProposal } from './tgChannelContentAi';
import s from './TgChannel.module.css';

interface Props {
  activeProjectId: string;
  result: TgChannelResult | null;
  selectedItem: TgPlanItem | null;
  pendingItems: TgPlanItem[];
  saved: boolean;
  batchJob: AiBatchJob | null;
  busyPostId: string | null;
  busyAction: string;
  ideaAiProposal: {
    itemId: string;
    current: TgPlanItem;
    proposed: TgChannelIdeaProposal;
  } | null;
  postAiProposal: {
    itemId: string;
    current: NonNullable<TgPlanItem['post']>;
    proposed: NonNullable<TgPlanItem['post']>;
  } | null;
  generatingPlan: boolean;
  onSelectItem: (id: string) => void;
  onUpdateItem: (item: TgPlanItem) => void;
  onAddIdea: () => void;
  onDeleteItem: (id: string) => void;
  onGeneratePostsInBackground: () => void;
  onImproveIdea: (item: TgPlanItem, instruction: string) => Promise<boolean>;
  onApplyIdeaProposal: () => void;
  onDismissIdeaProposal: () => void;
  onRunPostWorkflow: (item: TgPlanItem, step: 'post' | 'edit' | 'audio' | 'video', instruction?: string) => Promise<boolean>;
  onApplyPostProposal: () => void;
  onDismissPostProposal: () => void;
  onCopyPost: (item: TgPlanItem) => void;
  onAddToPlan: (item: TgPlanItem) => void;
  onOpenDescription: () => void;
  onGeneratePlan: () => void;
}

const STATUS_LABELS: Record<TgPostStatus, string> = {
  idea: 'Идея',
  draft: 'Черновик',
  ready: 'Готов',
  planned: 'В плане',
};

const BATCH_STATUS_LABELS: Record<string, string> = {
  pending: 'ожидает запуска',
  queued: 'в очереди',
  processing: 'создаёт посты',
  running: 'создаёт посты',
  completed: 'завершена',
  partially_failed: 'завершена частично',
  failed: 'завершилась с ошибкой',
  cancelled: 'отменена',
  expired: 'истекла',
};

function batchStatusLabel(status: string): string {
  return BATCH_STATUS_LABELS[status] ?? 'обновляется';
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function itemStatusLabel(item: TgPlanItem): string {
  if (item.plannedDate) return `В плане · ${formatDate(item.plannedDate)}`;
  return STATUS_LABELS[item.status];
}

function updatePost(item: TgPlanItem, patch: Partial<NonNullable<TgPlanItem['post']>>): TgPlanItem {
  if (!item.post) return item;
  return {
    ...item,
    post: { ...item.post, ...patch },
    status: item.plannedDate ? 'planned' : (patch.status ?? item.status),
  };
}

export function TgChannelContentPlanTab({
  activeProjectId,
  result,
  selectedItem,
  pendingItems,
  saved,
  batchJob,
  busyPostId,
  busyAction,
  ideaAiProposal,
  postAiProposal,
  generatingPlan,
  onSelectItem,
  onUpdateItem,
  onAddIdea,
  onDeleteItem,
  onGeneratePostsInBackground,
  onImproveIdea,
  onApplyIdeaProposal,
  onDismissIdeaProposal,
  onRunPostWorkflow,
  onApplyPostProposal,
  onDismissPostProposal,
  onCopyPost,
  onAddToPlan,
  onOpenDescription,
  onGeneratePlan,
}: Props) {
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [planMenuOpen, setPlanMenuOpen] = useState(false);
  const [itemMenuOpen, setItemMenuOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState(false);
  const planMenuRef = useRef<HTMLDivElement>(null);
  const itemMenuRef = useRef<HTMLDivElement>(null);
  const planMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const itemMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const backToListRef = useRef<HTMLButtonElement>(null);
  const selectedListItemRef = useRef<HTMLButtonElement>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);
  const pendingCompactFocusRef = useRef<'detail' | 'list' | null>(null);

  useEffect(() => {
    setItemMenuOpen(false);
    setDeleteConfirmation(false);
  }, [selectedItem?.id]);

  useEffect(() => {
    function closeMenus(event: PointerEvent) {
      const target = event.target as Node;
      if (!planMenuRef.current?.contains(target)) setPlanMenuOpen(false);
      if (!itemMenuRef.current?.contains(target)) setItemMenuOpen(false);
    }
    document.addEventListener('pointerdown', closeMenus);
    return () => document.removeEventListener('pointerdown', closeMenus);
  }, []);

  useEffect(() => {
    const openMenu = planMenuOpen ? planMenuRef.current : itemMenuOpen ? itemMenuRef.current : null;
    if (!openMenu) return;
    requestAnimationFrame(() => {
      openMenu.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
    });
  }, [itemMenuOpen, planMenuOpen]);

  useEffect(() => {
    if (!deleteConfirmation) return;
    requestAnimationFrame(() => cancelDeleteRef.current?.focus());
  }, [deleteConfirmation]);

  useEffect(() => {
    const target = pendingCompactFocusRef.current;
    if (!target) return;
    if (typeof window === 'undefined' || !window.matchMedia('(max-width: 1099px)').matches) {
      pendingCompactFocusRef.current = null;
      return;
    }
    requestAnimationFrame(() => {
      if (target === 'detail') backToListRef.current?.focus();
      else selectedListItemRef.current?.focus();
      pendingCompactFocusRef.current = null;
    });
  }, [mobileDetailOpen, selectedItem?.id]);

  if (!result) {
    return (
      <div className={s.emptyState}>
        <h2>Сначала соберите контент-план канала</h2>
        <p>Заполните описание и вводные проекта, после чего Luma IQ подготовит последовательность evergreen-постов.</p>
        <div className={s.emptyActions}>
          <button className={s.primaryButton} type="button" onClick={onGeneratePlan} disabled={generatingPlan}>
            {generatingPlan ? 'Собираю план…' : <>Собрать план с ИИ<AiWorkflowCost workflow="tg-channel.plan" projectId={activeProjectId} /></>}
          </button>
          <button className={s.button} type="button" onClick={onOpenDescription}>Проверить описание</button>
        </div>
      </div>
    );
  }

  const batchInProgress = Boolean(batchJob && !['completed', 'partially_failed', 'failed', 'cancelled', 'expired'].includes(batchJob.status));
  const isBusy = Boolean(selectedItem && busyPostId === selectedItem.id);

  function selectItem(id: string) {
    pendingCompactFocusRef.current = 'detail';
    onSelectItem(id);
    setMobileDetailOpen(true);
  }

  function addIdea() {
    pendingCompactFocusRef.current = 'detail';
    onAddIdea();
    setMobileDetailOpen(true);
  }

  function returnToList() {
    pendingCompactFocusRef.current = 'list';
    setMobileDetailOpen(false);
  }

  function closeMenu(
    setOpen: (open: boolean) => void,
    triggerRef: RefObject<HTMLButtonElement>,
  ) {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function handleMenuKeyDown(
    event: KeyboardEvent<HTMLDivElement>,
    setOpen: (open: boolean) => void,
    triggerRef: RefObject<HTMLButtonElement>,
  ) {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'));
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu(setOpen, triggerRef);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || items.length === 0) return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex = currentIndex;
    if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = items.length - 1;
    else if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1 + items.length) % items.length;
    else nextIndex = (currentIndex - 1 + items.length) % items.length;
    items[nextIndex]?.focus();
  }

  function confirmDelete() {
    if (!selectedItem) return;
    onDeleteItem(selectedItem.id);
    setDeleteConfirmation(false);
    setMobileDetailOpen(false);
  }

  return (
    <section className={s.planSection}>
      <header className={s.planHeader}>
        <div>
          <div className={s.planTitleRow}>
            <h2>{result.title}</h2>
            <span className={s.planCount}>{result.items.length} идей</span>
          </div>
          {result.strategySummary && <p>{result.strategySummary}</p>}
        </div>
        <div className={s.planHeaderActions}>
          <span className={s.autosaveLabel}>{saved ? 'Сохранено автоматически' : 'Сохранится автоматически'}</span>
          <button className={s.button} type="button" onClick={addIdea}>
            <Plus aria-hidden="true" size={16} />
            Добавить идею
          </button>
          <div className={s.actionMenu} ref={planMenuRef}>
            <button
              ref={planMenuTriggerRef}
              className={s.iconButton}
              type="button"
              aria-label="Действия с контент-планом"
              aria-haspopup="menu"
              aria-expanded={planMenuOpen}
              title="Действия с контент-планом"
              onClick={() => setPlanMenuOpen((open) => !open)}
            >
              <Ellipsis aria-hidden="true" size={20} />
            </button>
            {planMenuOpen && (
              <div
                className={s.actionMenuPopover}
                role="menu"
                aria-label="Действия с контент-планом"
                onKeyDown={(event) => handleMenuKeyDown(event, setPlanMenuOpen, planMenuTriggerRef)}
              >
                <button type="button" role="menuitem" onClick={() => { setPlanMenuOpen(false); onGeneratePlan(); }} disabled={generatingPlan}>
                  <RefreshCw aria-hidden="true" size={16} />
                  {generatingPlan ? 'Собираю план…' : 'Собрать план заново'}
                </button>
                {pendingItems.length >= 2 && (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={batchInProgress}
                    onClick={() => { setPlanMenuOpen(false); onGeneratePostsInBackground(); }}
                  >
                    <Sparkles aria-hidden="true" size={16} />
                    {batchInProgress ? 'Посты создаются…' : `Создать ${pendingItems.length} постов фоном`}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {batchJob && (
        <div className={s.batchStatus} role="status" aria-live="polite">
          Фоновая генерация: {batchStatusLabel(batchJob.status)}. Готово {batchJob.completedItems} из {batchJob.totalItems}, ошибок {batchJob.failedItems}.
        </div>
      )}

      <div className={`${s.planWorkspace} ${mobileDetailOpen ? s.planWorkspaceDetailOpen : ''}`}>
        <aside className={s.planList} aria-label="Идеи контент-плана">
          <div className={s.planListHeader}>
            <strong>Посты канала</strong>
            <span>{result.items.length}</span>
          </div>
          <ol className={s.planItems}>
            {result.items.map((item) => (
              <li key={item.id}>
                <button
                  ref={selectedItem?.id === item.id ? selectedListItemRef : undefined}
                  type="button"
                  className={`${s.planItem} ${selectedItem?.id === item.id ? s.planItemActive : ''}`}
                  aria-current={selectedItem?.id === item.id ? 'true' : undefined}
                  aria-controls="tg-channel-selected-post"
                  onClick={() => selectItem(item.id)}
                >
                  <span className={s.planItemNumber}>{String(item.number).padStart(2, '0')}</span>
                  <span className={s.planItemCopy}>
                    <strong>{item.role || 'Новая идея'}</strong>
                    <span>{item.topic || 'Добавьте тему поста'}</span>
                  </span>
                  <span className={`${s.itemStatus} ${s[`itemStatus_${item.status}`]}`}>{itemStatusLabel(item)}</span>
                </button>
              </li>
            ))}
          </ol>
          <button className={s.addIdeaButton} type="button" onClick={addIdea}>
            <Plus aria-hidden="true" size={18} />
            Добавить идею
          </button>
        </aside>

        <main id="tg-channel-selected-post" className={s.planDetail} aria-live="polite" tabIndex={-1}>
          {selectedItem ? (
            <>
              <div className={s.mobileDetailHeader}>
                <button ref={backToListRef} className={s.backToList} type="button" onClick={returnToList}>
                  <ArrowLeft aria-hidden="true" size={18} />
                  К плану
                </button>
              </div>

              <header className={s.detailHeader}>
                <div>
                  <div className={s.detailMeta}>
                    <span>{String(selectedItem.number).padStart(2, '0')}</span>
                    <span className={`${s.itemStatus} ${s[`itemStatus_${selectedItem.status}`]}`}>{itemStatusLabel(selectedItem)}</span>
                  </div>
                  <h3>{selectedItem.post?.title || selectedItem.topic || 'Новая идея'}</h3>
                </div>
                <div className={s.actionMenu} ref={itemMenuRef}>
                  <button
                    ref={itemMenuTriggerRef}
                    className={s.iconButton}
                    type="button"
                    aria-label="Действия с выбранным постом"
                    aria-haspopup="menu"
                    aria-expanded={itemMenuOpen}
                    title="Действия с выбранным постом"
                    onClick={() => setItemMenuOpen((open) => !open)}
                  >
                    <Ellipsis aria-hidden="true" size={20} />
                  </button>
                  {itemMenuOpen && (
                    <div
                      className={`${s.actionMenuPopover} ${s.itemMenuPopover}`}
                      role="menu"
                      aria-label="Действия с выбранным постом"
                      onKeyDown={(event) => handleMenuKeyDown(event, setItemMenuOpen, itemMenuTriggerRef)}
                    >
                      {selectedItem.post && (
                        <button type="button" role="menuitem" onClick={() => { setItemMenuOpen(false); onCopyPost(selectedItem); }}>
                          <Copy aria-hidden="true" size={16} />
                          Скопировать пост
                        </button>
                      )}
                      <button className={s.menuDanger} type="button" role="menuitem" onClick={() => { setItemMenuOpen(false); setDeleteConfirmation(true); }}>
                        <Trash2 aria-hidden="true" size={16} />
                        Удалить
                      </button>
                    </div>
                  )}
                </div>
              </header>

              {deleteConfirmation && (
                <div
                  className={s.deleteConfirmation}
                  role="alertdialog"
                  aria-labelledby="tg-delete-title"
                  aria-describedby="tg-delete-description"
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      setDeleteConfirmation(false);
                      requestAnimationFrame(() => itemMenuTriggerRef.current?.focus());
                    }
                  }}
                >
                  <span id="tg-delete-description">
                    <b id="tg-delete-title" className={s.visuallyHidden}>Удаление идеи</b>
                    Удалить эту идею и сохранённый в ней пост?
                    {selectedItem.contentPlanItemId && ' Связанный материал в Контент-плане останется.'}
                  </span>
                  <div>
                    <button ref={cancelDeleteRef} className={s.button} type="button" onClick={() => setDeleteConfirmation(false)}>Отмена</button>
                    <button className={s.dangerButton} type="button" onClick={confirmDelete}>Удалить</button>
                  </div>
                </div>
              )}

              {!selectedItem.post ? (
                <div className={s.detailForm}>
                  <label className={s.editorField}>
                    <span>Роль поста</span>
                    <input value={selectedItem.role} onChange={(event) => onUpdateItem({ ...selectedItem, role: event.target.value })} />
                  </label>
                  <label className={s.editorField}>
                    <span>Задача читателя</span>
                    <textarea rows={2} value={selectedItem.clientTask} onChange={(event) => onUpdateItem({ ...selectedItem, clientTask: event.target.value })} />
                  </label>
                  <label className={s.editorField}>
                    <span>Тема</span>
                    <textarea rows={2} value={selectedItem.topic} onChange={(event) => onUpdateItem({ ...selectedItem, topic: event.target.value })} />
                  </label>
                  <label className={s.editorField}>
                    <span>Ключевая мысль</span>
                    <textarea rows={3} value={selectedItem.keyMessage} onChange={(event) => onUpdateItem({ ...selectedItem, keyMessage: event.target.value })} />
                  </label>
                  <label className={s.editorField}>
                    <span>Призыв к действию (CTA)</span>
                    <textarea rows={2} value={selectedItem.callToAction} onChange={(event) => onUpdateItem({ ...selectedItem, callToAction: event.target.value })} />
                  </label>
                  <ContentRevisionComposer
                    key={`idea-${selectedItem.id}`}
                    projectId={activeProjectId}
                    workflow="tg-channel.idea-improve"
                    isLoading={isBusy && busyAction === 'idea-improve'}
                    onSubmit={(instruction) => onImproveIdea(selectedItem, instruction)}
                    title="Улучшить идею с AI"
                    placeholder="Например: сделайте тему конкретнее и свяжите её с главным возражением аудитории"
                  />
                  {ideaAiProposal?.itemId === selectedItem.id && (
                    <section className={s.aiProposal} aria-label="Предложенная версия идеи">
                      <div className={s.aiProposalHeader}>
                        <div>
                          <span className={s.aiProposalEyebrow}>Вариант AI</span>
                          <h4>Сравните идею перед применением</h4>
                        </div>
                      </div>
                      <div className={s.aiComparisonGrid}>
                        <div className={s.aiComparisonColumn}>
                          <strong>Текущая версия</strong>
                          <dl>
                            <dt>Роль</dt><dd>{ideaAiProposal.current.role || '—'}</dd>
                            <dt>Тема</dt><dd>{ideaAiProposal.current.topic || '—'}</dd>
                            <dt>Ключевая мысль</dt><dd>{ideaAiProposal.current.keyMessage || '—'}</dd>
                          </dl>
                        </div>
                        <div className={`${s.aiComparisonColumn} ${s.aiComparisonProposed}`}>
                          <strong>Предложение AI</strong>
                          <dl>
                            <dt>Роль</dt><dd>{ideaAiProposal.proposed.role}</dd>
                            <dt>Тема</dt><dd>{ideaAiProposal.proposed.topic}</dd>
                            <dt>Ключевая мысль</dt><dd>{ideaAiProposal.proposed.keyMessage}</dd>
                          </dl>
                        </div>
                      </div>
                      <div className={s.aiProposalActions}>
                        <button className={s.button} type="button" onClick={onDismissIdeaProposal}>Оставить текущую</button>
                        <button className={s.primaryButton} type="button" onClick={onApplyIdeaProposal}>
                          <Check aria-hidden="true" size={17} />
                          Применить вариант
                        </button>
                      </div>
                    </section>
                  )}
                  <div className={s.detailFooter}>
                    <button
                      className={s.primaryButton}
                      type="button"
                      onClick={() => void onRunPostWorkflow(selectedItem, 'post')}
                      disabled={isBusy}
                    >
                      <Sparkles aria-hidden="true" size={17} />
                      {isBusy ? 'Пишу пост…' : <>Создать пост<AiWorkflowCost workflow="tg-channel.post" projectId={activeProjectId} /></>}
                    </button>
                  </div>
                </div>
              ) : (
                <div className={s.postEditor}>
                  <div className={s.postEditorToolbar}>
                    {!selectedItem.plannedDate && (
                      <label>
                        <span>Статус</span>
                        <select
                          value={selectedItem.status === 'draft' ? 'draft' : 'ready'}
                          onChange={(event) => {
                            const status = event.target.value as 'draft' | 'ready';
                            onUpdateItem(updatePost(selectedItem, { status }));
                          }}
                        >
                          <option value="draft">Черновик</option>
                          <option value="ready">Готов</option>
                        </select>
                      </label>
                    )}
                    <button className={s.iconButton} type="button" onClick={() => onCopyPost(selectedItem)} aria-label="Скопировать пост" title="Скопировать пост">
                      <Copy aria-hidden="true" size={18} />
                    </button>
                    <button className={s.button} type="button" onClick={() => onAddToPlan(selectedItem)}>
                      <CalendarPlus aria-hidden="true" size={17} />
                      {selectedItem.contentPlanItemId ? 'Обновить в Контент-плане' : 'В Контент-план'}
                    </button>
                  </div>
                  <label className={s.editorField}>
                    <span>Заголовок</span>
                    <input value={selectedItem.post.title} onChange={(event) => onUpdateItem(updatePost(selectedItem, { title: event.target.value }))} />
                  </label>
                  <label className={s.editorField}>
                    <span>Текст поста</span>
                    <textarea className={s.postBodyInput} rows={14} value={selectedItem.post.text} onChange={(event) => onUpdateItem(updatePost(selectedItem, { text: event.target.value }))} />
                  </label>
                  <label className={s.editorField}>
                    <span>Призыв к действию (CTA)</span>
                    <textarea rows={2} value={selectedItem.post.callToAction} onChange={(event) => onUpdateItem(updatePost(selectedItem, { callToAction: event.target.value }))} />
                  </label>
                  <label className={s.editorField}>
                    <span>Комментарий автора</span>
                    <textarea rows={2} value={selectedItem.post.authorComment} onChange={(event) => onUpdateItem(updatePost(selectedItem, { authorComment: event.target.value }))} />
                  </label>
                  <ContentRevisionComposer
                    key={selectedItem.id}
                    projectId={activeProjectId}
                    workflow="tg-channel.edit"
                    isLoading={isBusy && busyAction !== ''}
                    onSubmit={(instruction) => onRunPostWorkflow(selectedItem, 'edit', instruction)}
                    placeholder="Например: добавьте мою историю, уберите давление и сделайте призыв конкретнее"
                  />
                  {postAiProposal?.itemId === selectedItem.id && (
                    <section className={s.aiProposal} aria-label="Предложенная версия поста">
                      <div className={s.aiProposalHeader}>
                        <div>
                          <span className={s.aiProposalEyebrow}>Вариант AI</span>
                          <h4>Текущий пост пока не изменён</h4>
                        </div>
                      </div>
                      <div className={s.aiComparisonGrid}>
                        <div className={s.aiComparisonColumn}>
                          <strong>Текущая версия</strong>
                          <h5>{postAiProposal.current.title}</h5>
                          <p>{postAiProposal.current.text}</p>
                        </div>
                        <div className={`${s.aiComparisonColumn} ${s.aiComparisonProposed}`}>
                          <strong>Предложение AI</strong>
                          <h5>{postAiProposal.proposed.title}</h5>
                          <p>{postAiProposal.proposed.text}</p>
                        </div>
                      </div>
                      <div className={s.aiProposalActions}>
                        <button className={s.button} type="button" onClick={onDismissPostProposal}>Оставить текущую</button>
                        <button
                          className={s.primaryButton}
                          type="button"
                          data-testid="tg-apply-post-proposal"
                          onClick={onApplyPostProposal}
                        >
                          <Check aria-hidden="true" size={17} />
                          Применить вариант
                        </button>
                      </div>
                    </section>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className={s.detailEmpty}>
              <h3>Выберите пост</h3>
              <p>Откройте идею слева, чтобы заполнить её или посмотреть готовый пост.</p>
            </div>
          )}
        </main>
      </div>
    </section>
  );
}
