import { useEffect, useRef, useState } from 'react';
import type { CreateCaseStudyInput } from '../../api/cases';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import s from '../../pages/Cases/Cases.module.css';

interface CaseCreateDialogProps {
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onCreate: (input: CreateCaseStudyInput) => void;
}

const EMPTY_FORM: CreateCaseStudyInput = {
  title: '',
  beforeText: '',
  actionsText: '',
  afterText: '',
};

export default function CaseCreateDialog({ open, saving, onClose, onCreate }: CaseCreateDialogProps) {
  const [form, setForm] = useState<CreateCaseStudyInput>(EMPTY_FORM);
  const titleRef = useRef<HTMLInputElement>(null);
  const dialogRef = useDialogFocus({
    open,
    onClose,
    closeDisabled: saving,
    initialFocusRef: titleRef,
  });

  useEffect(() => {
    if (!open) return undefined;
    setForm(EMPTY_FORM);
    return undefined;
  }, [open]);

  if (!open) return null;

  const canSubmit = form.title.trim().length > 0 && !saving;

  return (
    <div className={s.dialogBackdrop} role="presentation" onMouseDown={() => !saving && onClose()}>
      <section
        ref={dialogRef}
        className={s.createDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-case-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={s.dialogHeader}>
          <div>
            <p className={s.dialogEyebrow}>Новый черновик</p>
            <h2 id="create-case-title">Добавить кейс</h2>
          </div>
          <button type="button" className={s.dialogClose} onClick={onClose} disabled={saving} aria-label="Закрыть">
            ×
          </button>
        </div>

        <form
          className={s.createForm}
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) onCreate({ ...form, title: form.title.trim() });
          }}
        >
          <label className={s.createField}>
            <span>Название кейса</span>
            <input
              ref={titleRef}
              value={form.title}
              maxLength={240}
              placeholder="Например: первые заявки из онлайна"
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            />
          </label>

          <div className={s.createStoryGrid}>
            <label className={s.createField}>
              <span>Что было</span>
              <textarea
                value={form.beforeText}
                maxLength={20_000}
                placeholder="Исходная ситуация клиента"
                onChange={(event) => setForm((current) => ({ ...current, beforeText: event.target.value }))}
              />
            </label>
            <label className={s.createField}>
              <span>Что сделали</span>
              <textarea
                value={form.actionsText}
                maxLength={20_000}
                placeholder="Какие действия помогли"
                onChange={(event) => setForm((current) => ({ ...current, actionsText: event.target.value }))}
              />
            </label>
            <label className={s.createField}>
              <span>Что стало</span>
              <textarea
                value={form.afterText}
                maxLength={20_000}
                placeholder="Полученный результат"
                onChange={(event) => setForm((current) => ({ ...current, afterText: event.target.value }))}
              />
            </label>
          </div>

          <div className={s.dialogActions}>
            <button type="button" className={s.secondaryButton} onClick={onClose} disabled={saving}>Отмена</button>
            <button type="submit" className={s.primaryButton} disabled={!canSubmit}>
              {saving ? 'Создаю...' : 'Создать черновик'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
