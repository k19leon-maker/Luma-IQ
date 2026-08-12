import type { CaseStudyStatus } from '../../api/cases';
import s from '../../pages/Cases/Cases.module.css';

export default function CaseStatusBadge({ status }: { status: CaseStudyStatus }) {
  return (
    <span className={`${s.statusBadge} ${status === 'ready' ? s.statusReady : s.statusDraft}`}>
      {status === 'ready' ? 'Готовый кейс' : 'Черновик'}
    </span>
  );
}
