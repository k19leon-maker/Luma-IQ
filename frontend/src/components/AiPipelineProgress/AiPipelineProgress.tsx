import s from './AiPipelineProgress.module.css';

export default function AiPipelineProgress({ label = 'AI обрабатывает запрос. Этапы выполняются последовательно.' }: { label?: string }) {
  return (
    <div className={s.root} role="status" aria-live="polite">
      <span>{label}</span>
      <span className={s.track} aria-hidden="true"><span className={s.bar} /></span>
    </div>
  );
}
