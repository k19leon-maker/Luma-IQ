import { useState } from 'react';
import { ArrowUpRight, ChevronDown, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import type {
  UtpFoundation,
  UtpFoundationListSection,
  UtpFoundationSection,
} from '../../api/projects.api';
import s from './UTP.module.css';

interface Props {
  foundation: UtpFoundation | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
}

interface FoundationItemProps {
  itemKey: string;
  label: string;
  section: UtpFoundationSection | UtpFoundationListSection;
}

function isListSection(section: UtpFoundationSection | UtpFoundationListSection): section is UtpFoundationListSection {
  return 'values' in section;
}

function internalEditPath(path: string | null): string | null {
  return path?.startsWith('/app/') ? path : null;
}

function FoundationItem({ itemKey, label, section }: FoundationItemProps) {
  const [expanded, setExpanded] = useState(false);
  const values = isListSection(section) ? section.values.map((item) => item.value) : [section.value];
  const contentLength = values.join(' ').length;
  const expandable = contentLength > 220 || values.length > 3;
  const editPath = internalEditPath(section.editPath);
  const actionLabel = section.status === 'missing'
    ? (section.missingReason === 'ambiguous' ? 'Выбрать' : 'Заполнить')
    : 'Изменить';

  return (
    <section className={s.foundationItem} aria-labelledby={`utp-foundation-${itemKey}`}>
      <div className={s.foundationItemHeader}>
        <h3 id={`utp-foundation-${itemKey}`}>{label}</h3>
        {editPath ? (
          <Link to={editPath} className={s.editLink}>
            {actionLabel} <ArrowUpRight aria-hidden="true" size={13} />
          </Link>
        ) : null}
      </div>

      {section.status === 'missing' ? (
        <div className={s.foundationMissing}>
          <span>{section.missingReason === 'ambiguous' ? 'Нужно выбрать один вариант' : 'Не заполнено'}</span>
          {!isListSection(section) && section.options?.length ? (
            <small>{section.options.map((option) => option.label).slice(0, 3).join(' · ')}</small>
          ) : null}
        </div>
      ) : isListSection(section) ? (
        <ul className={`${s.foundationList}${expanded ? ` ${s.foundationContentExpanded}` : ''}`}>
          {section.values.map((item) => <li key={item.source}>{item.value}</li>)}
        </ul>
      ) : (
        <p className={`${s.foundationValue}${expanded ? ` ${s.foundationContentExpanded}` : ''}`}>
          {section.value}
        </p>
      )}

      {section.status === 'ready' && expandable ? (
        <button
          type="button"
          className={s.expandButton}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Свернуть' : 'Показать полностью'}
          <ChevronDown aria-hidden="true" size={14} className={expanded ? s.chevronExpanded : ''} />
        </button>
      ) : null}
    </section>
  );
}

export function UtpFoundationPanel({ foundation, loading, error, onRetry }: Props) {
  return (
    <aside className={s.foundationPanel} aria-labelledby="utp-foundation-title" aria-busy={loading}>
      <div className={s.panelIntro}>
        <span className={s.eyebrow}>Контекст проекта</span>
        <h2 id="utp-foundation-title">Основа для УТП</h2>
        <p>Данные текущего проекта, которые AI использует при формировании предложения.</p>
      </div>

      {loading ? (
        <div className={s.foundationLoading} aria-label="Загружаем основу для УТП">
          {[0, 1, 2, 3, 4].map((item) => <span key={item} />)}
        </div>
      ) : error ? (
        <div className={s.foundationError} role="alert">
          <p>{error}</p>
          <button type="button" onClick={onRetry}>
            <RefreshCw aria-hidden="true" size={15} /> Повторить
          </button>
        </div>
      ) : foundation ? (
        <div className={s.foundationItems}>
          <FoundationItem itemKey="niche" label="Ниша / специализация" section={foundation.niche} />
          <FoundationItem itemKey="audience" label="Целевая аудитория" section={foundation.audience} />
          <FoundationItem itemKey="jtbd" label="Задача / JTBD" section={foundation.jtbd} />
          <FoundationItem itemKey="pains" label="Боли и проблемы" section={foundation.pains} />
          <FoundationItem itemKey="desired-outcome" label="Желаемый результат" section={foundation.desiredOutcome} />
        </div>
      ) : (
        <div className={s.foundationError}><p>Выберите проект, чтобы увидеть его контекст.</p></div>
      )}
    </aside>
  );
}
