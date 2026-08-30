import { useEffect, useRef } from 'react';
import { ArrowLeft, Check, X } from 'lucide-react';
import type { UtpAiResult, WorkflowResponse } from '../../api/ai';
import { UtpMissingData } from './UtpMissingData';
import s from './UTP.module.css';

export interface UtpAiProposal {
  projectId: string;
  mode: 'generate' | 'improve';
  currentText: string;
  proposedText: string;
  instruction: string;
  result: UtpAiResult;
  response: WorkflowResponse<UtpAiResult>;
}

interface Props {
  proposal: UtpAiProposal;
  applying: boolean;
  onApply: () => void;
  onDismiss: () => void;
  onClarify: () => void;
}

export function UtpAiProposalPanel({
  proposal,
  applying,
  onApply,
  onDismiss,
  onClarify,
}: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const applyingRef = useRef(applying);
  const dismissRef = useRef(onDismiss);

  applyingRef.current = applying;
  dismissRef.current = onDismiss;

  useEffect(() => {
    headingRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || applyingRef.current) return;
      event.preventDefault();
      dismissRef.current();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <section className={s.proposalPanel} aria-labelledby="utp-proposal-title">
      <div className={s.proposalHeader}>
        <div>
          <span className={s.eyebrow}>Предложенная версия</span>
          <h3 id="utp-proposal-title" ref={headingRef} tabIndex={-1}>Сравните перед применением</h3>
          <p>AI-вариант пока не сохранён и не используется в других разделах проекта.</p>
        </div>
        <button
          type="button"
          className={s.helpClose}
          aria-label="Оставить текущую версию и закрыть сравнение"
          disabled={applying}
          onClick={onDismiss}
        >
          <X aria-hidden="true" size={17} />
        </button>
      </div>

      <div className={s.proposalComparison}>
        <article className={s.proposalColumn}>
          <span>Сейчас</span>
          <div>{proposal.currentText}</div>
        </article>
        <article className={`${s.proposalColumn} ${s.proposalColumnSuggested}`}>
          <span>Предложено AI</span>
          <div>{proposal.proposedText}</div>
        </article>
      </div>

      <div className={s.proposalActions}>
        <button type="button" className={s.secondaryButton} disabled={applying} onClick={onDismiss}>
          Оставить текущую
        </button>
        <button type="button" className={s.secondaryButton} disabled={applying} onClick={onClarify}>
          <ArrowLeft aria-hidden="true" size={16} /> Уточнить задачу
        </button>
        <button type="button" className={s.primaryButton} disabled={applying} onClick={onApply}>
          <Check aria-hidden="true" size={16} /> {applying ? 'Сохраняем…' : 'Применить'}
        </button>
      </div>

      <UtpMissingData items={proposal.result.missingData} />
    </section>
  );
}
