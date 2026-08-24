import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CalendarPlus,
  Copy,
  Ellipsis,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { AiBatchJob } from '../../api/ai';
import AiWorkflowCost from '../../components/AiWorkflowCost/AiWorkflowCost';
import { ContentRevisionComposer } from '../../components/ContentRevisionComposer/ContentRevisionComposer';
import { TgChannelResult, TgPlanItem, TgPostStatus } from './tgChannelWorkspace';
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
  generatingPlan: boolean;
  onSelectItem: (id: string) => void;
  onUpdateItem: (item: TgPlanItem) => void;
  onAddIdea: () => void;
  onDeleteItem: (id: string) => void;
  onGeneratePostsInBackground: () => void;
  onRunPostWorkflow: (item: TgPlanItem, step: 'post' | 'edit' | 'audio' | 'video', instruction?: string) => Promise<boolean>;
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
  generatingPlan,
  onSelectItem,
  onUpdateItem,
  onAddIdea,
  onDeleteItem,
  onGeneratePostsInBackground,
  onRunPostWorkflow,
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
    onSelectItem(id);
    setMobileDetailOpen(true);
  }

  function addIdea() {
    onAddIdea();
    setMobileDetailOpen(true);
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
              className={s.iconButton}
              type="button"
              aria-label="Действия с контент-планом"
              aria-expanded={planMenuOpen}
              title="Действия с контент-планом"
              onClick={() => setPlanMenuOpen((open) => !open)}
            >
              <Ellipsis aria-hidden="true" size={20} />
            </button>
            {planMenuOpen && (
              <div className={s.actionMenuPopover} role="menu">
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
        <div className={s.batchStatus} role="status">
          Фоновая генерация: {batchJob.status}. Готово {batchJob.completedItems} из {batchJob.totalItems}, ошибок {batchJob.failedItems}.
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
                  type="button"
                  className={`${s.planItem} ${selectedItem?.id === item.id ? s.planItemActive : ''}`}
                  aria-current={selectedItem?.id === item.id ? 'true' : undefined}
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

        <main className={s.planDetail} aria-live="polite">
          {selectedItem ? (
            <>
              <div className={s.mobileDetailHeader}>
                <button className={s.backToList} type="button" onClick={() => setMobileDetailOpen(false)}>
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
                    className={s.iconButton}
                    type="button"
                    aria-label="Действия с выбранным постом"
                    aria-expanded={itemMenuOpen}
                    title="Действия с выбранным постом"
                    onClick={() => setItemMenuOpen((open) => !open)}
                  >
                    <Ellipsis aria-hidden="true" size={20} />
                  </button>
                  {itemMenuOpen && (
                    <div className={`${s.actionMenuPopover} ${s.itemMenuPopover}`} role="menu">
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
                <div className={s.deleteConfirmation} role="alertdialog" aria-label="Удалить идею">
                  <span>Удалить эту идею и сохранённый в ней пост?</span>
                  <div>
                    <button className={s.button} type="button" onClick={() => setDeleteConfirmation(false)}>Отмена</button>
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
                      {selectedItem.plannedDate ? 'Изменить дату' : 'В Контент-план'}
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
