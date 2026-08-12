import type { CaseStudy, UpdateCaseStudyInput } from '../../api/cases';
import s from '../../pages/Cases/Cases.module.css';
import CaseStatusBadge from './CaseStatusBadge';

export type CaseDraft = Pick<CaseStudy,
  | 'title'
  | 'beforeText'
  | 'actionsText'
  | 'afterText'
  | 'clientTask'
  | 'clientProblem'
  | 'desiredResult'
  | 'marketingInsight'
  | 'status'
>;

interface CaseEditorProps {
  record: CaseStudy;
  draft: CaseDraft;
  saving: boolean;
  dirty: boolean;
  onChange: (patch: UpdateCaseStudyInput) => void;
  onSave: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
  onBack: () => void;
}

const insightFields: Array<{
  key: keyof Pick<CaseDraft, 'clientTask' | 'clientProblem' | 'desiredResult' | 'marketingInsight'>;
  label: string;
  hint: string;
}> = [
  { key: 'clientTask', label: 'Задача клиента', hint: 'Какую задачу клиент хотел решить?' },
  { key: 'clientProblem', label: 'Проблема клиента', hint: 'Что мешало получить результат?' },
  { key: 'desiredResult', label: 'Желаемый результат', hint: 'К какому изменению стремился клиент?' },
  { key: 'marketingInsight', label: 'Главный вывод для контента', hint: 'Какую мысль можно использовать в маркетинге?' },
];

export default function CaseEditor({
  record,
  draft,
  saving,
  dirty,
  onChange,
  onSave,
  onToggleStatus,
  onDelete,
  onBack,
}: CaseEditorProps) {
  return (
    <article className={s.detailCard}>
      <div className={s.detailToolbar}>
        <button type="button" className={s.backButton} onClick={onBack}>← Назад к списку</button>
        <button type="button" className={s.deleteButton} onClick={onDelete} aria-label="Удалить кейс">Удалить</button>
      </div>

      <div className={s.detailHeader}>
        <CaseStatusBadge status={draft.status} />
        <label className={s.srOnly} htmlFor={`case-title-${record.id}`}>Название кейса</label>
        <textarea
          id={`case-title-${record.id}`}
          className={s.titleInput}
          value={draft.title}
          maxLength={240}
          rows={2}
          onChange={(event) => onChange({ title: event.target.value })}
        />
      </div>

      <div className={s.storyFields}>
        <label className={s.storyField}>
          <span>Что было</span>
          <textarea
            value={draft.beforeText}
            maxLength={20_000}
            placeholder="Опишите исходную ситуацию клиента"
            onChange={(event) => onChange({ beforeText: event.target.value })}
          />
        </label>
        <label className={s.storyField}>
          <span>Что сделали</span>
          <textarea
            value={draft.actionsText}
            maxLength={20_000}
            placeholder="Какие действия и решения помогли клиенту"
            onChange={(event) => onChange({ actionsText: event.target.value })}
          />
        </label>
        <label className={s.storyField}>
          <span>Что стало / результат</span>
          <textarea
            value={draft.afterText}
            maxLength={20_000}
            placeholder="Что изменилось после работы"
            onChange={(event) => onChange({ afterText: event.target.value })}
          />
        </label>
      </div>

      <section className={s.insightsSection} aria-labelledby="case-insights-title">
        <div className={s.sectionHeading}>
          <h2 id="case-insights-title">Маркетинговые тезисы</h2>
        </div>
        <div className={s.insightGrid}>
          {insightFields.map((field) => (
            <label key={field.key} className={s.insightField}>
              <span>{field.label}</span>
              <textarea
                value={draft[field.key] ?? ''}
                maxLength={8_000}
                placeholder={field.hint}
                onChange={(event) => onChange({ [field.key]: event.target.value || null })}
              />
            </label>
          ))}
        </div>
      </section>

      <div className={s.detailActions}>
        <button type="button" className={s.primaryButton} disabled={!dirty || saving} onClick={onSave}>
          {saving ? 'Сохраняю...' : 'Сохранить изменения'}
        </button>
        <button type="button" className={s.secondaryButton} disabled={saving} onClick={onToggleStatus}>
          {draft.status === 'ready' ? 'Вернуть в черновики' : 'Сделать готовым кейсом'}
        </button>
      </div>
    </article>
  );
}
