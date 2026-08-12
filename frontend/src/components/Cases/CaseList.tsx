import type { CaseStudy, CaseStudyStatus } from '../../api/cases';
import s from '../../pages/Cases/Cases.module.css';
import CaseStatusBadge from './CaseStatusBadge';

type Filter = 'all' | CaseStudyStatus;

interface CaseListProps {
  cases: CaseStudy[];
  selectedId: string | null;
  filter: Filter;
  loading: boolean;
  onFilterChange: (filter: Filter) => void;
  onSelect: (record: CaseStudy) => void;
  onAdd: () => void;
  onImport: () => void;
}

const filters: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'Все кейсы' },
  { value: 'draft', label: 'Черновики' },
  { value: 'ready', label: 'Готовые кейсы' },
];

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export default function CaseList({
  cases,
  selectedId,
  filter,
  loading,
  onFilterChange,
  onSelect,
  onAdd,
  onImport,
}: CaseListProps) {
  return (
    <section className={s.listColumn} aria-label="Список кейсов">
      <div className={s.intro}>
        <h1>Кейсы</h1>
        <p>Собирайте истории клиентов в формате «Было → Что сделали → Стало» и используйте их в контенте.</p>
        <div className={s.introActions}>
          <button type="button" className={s.primaryButton} onClick={onImport}>
            Создать из текста
          </button>
          <button type="button" className={s.secondaryButton} onClick={onAdd}>
            <span aria-hidden="true">+</span>
            Вручную
          </button>
        </div>
      </div>

      <div className={s.tabs} role="tablist" aria-label="Фильтр кейсов">
        {filters.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={filter === item.value}
            className={filter === item.value ? s.tabActive : s.tab}
            onClick={() => onFilterChange(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className={s.caseList} aria-live="polite">
        {loading && <div className={s.listState}>Загружаю кейсы...</div>}
        {!loading && cases.length === 0 && (
          <div className={s.listState}>
            {filter === 'all' ? 'Здесь появятся кейсы этого проекта.' : 'В этом разделе пока нет кейсов.'}
          </div>
        )}
        {!loading && cases.map((record) => (
          <button
            key={record.id}
            type="button"
            className={`${s.caseRow} ${selectedId === record.id ? s.caseRowActive : ''}`}
            onClick={() => onSelect(record)}
          >
            <CaseStatusBadge status={record.status} />
            <span className={s.caseRowTitle}>{record.title}</span>
            <span className={s.caseRowDate}>{formatDate(record.updatedAt)}</span>
            <span className={s.caseChevron} aria-hidden="true">›</span>
          </button>
        ))}
        {!loading && (
          <button type="button" className={s.addRow} onClick={onAdd}>
            <span className={s.addCircle} aria-hidden="true">+</span>
            Добавить ещё кейс
          </button>
        )}
      </div>
    </section>
  );
}
