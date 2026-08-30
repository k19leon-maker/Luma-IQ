import { useEffect, useState } from 'react';
import { Copy, History, WandSparkles } from 'lucide-react';
import AiWorkflowCost from '../../components/AiWorkflowCost/AiWorkflowCost';
import type { AiResultVersion } from '../../store/generated.store';
import { UtpAiImprovePanel } from './UtpAiImprovePanel';
import { UtpAiProposalPanel, type UtpAiProposal } from './UtpAiProposalPanel';
import { UtpHelpPopover } from './UtpHelpPopover';
import { UtpMissingData, type UtpMissingDataItem } from './UtpMissingData';
import type { UtpSaveStatus } from './utpAutosave';
import s from './UTP.module.css';

interface Props {
  activeProjectId: string;
  utpText: string;
  instruction: string;
  loading: boolean;
  voiceBusy: boolean;
  workspaceLoading: boolean;
  editorDisabled: boolean;
  saveStatus: UtpSaveStatus;
  saveError: string;
  aiError: string;
  proposal: UtpAiProposal | null;
  applyingProposal: boolean;
  history: AiResultVersion<string>[];
  missingData: UtpMissingDataItem[];
  onUtpChange: (value: string) => void;
  onEditorBlur: () => void;
  onInstructionChange: (value: string) => void;
  onVoiceBusyChange: (busy: boolean) => void;
  onGenerate: () => void;
  onImprove: () => void;
  onCopy: () => void;
  onRetrySave: () => void;
  onRetryAi: () => void;
  onApplyProposal: () => void;
  onDismissProposal: () => void;
  onClarifyProposal: () => void;
  onRestoreVersion: (version: AiResultVersion<string>) => void;
}

export function UtpEditorPanel({
  activeProjectId,
  utpText,
  instruction,
  loading,
  voiceBusy,
  workspaceLoading,
  editorDisabled,
  saveStatus,
  saveError,
  aiError,
  proposal,
  applyingProposal,
  history,
  missingData,
  onUtpChange,
  onEditorBlur,
  onInstructionChange,
  onVoiceBusyChange,
  onGenerate,
  onImprove,
  onCopy,
  onRetrySave,
  onRetryAi,
  onApplyProposal,
  onDismissProposal,
  onClarifyProposal,
  onRestoreVersion,
}: Props) {
  const [improveOpen, setImproveOpen] = useState(false);
  const hasUtp = Boolean(utpText.trim());
  const interactionLocked = editorDisabled || loading || applyingProposal || Boolean(proposal);

  useEffect(() => {
    if (proposal) setImproveOpen(false);
  }, [proposal]);

  return (
    <section className={s.editorPanel} aria-labelledby="utp-editor-title">
      <div className={s.editorHeader}>
        <div>
          <span className={s.eyebrow}>Рабочая формулировка</span>
          <h2 id="utp-editor-title">Ваше УТП</h2>
        </div>
        <UtpHelpPopover />
      </div>

      <label className={s.visuallyHidden} htmlFor="utp-editor-textarea">Текст УТП</label>
      <textarea
        id="utp-editor-textarea"
        className={`${s.editorTextarea}${hasUtp ? '' : ` ${s.editorTextareaEmpty}`}`}
        value={utpText}
        onChange={(event) => onUtpChange(event.target.value)}
        onBlur={onEditorBlur}
        disabled={interactionLocked}
        aria-busy={workspaceLoading}
        placeholder="Сформулируйте УТП на основе данных вашего проекта"
        maxLength={4000}
      />

      <div className={s.editorMeta} aria-live="polite">
        <span>{utpText.length.toLocaleString('ru-RU')} символов</span>
        <span className={saveStatus === 'error' ? s.saveStatusError : s.saveStatus}>
          {workspaceLoading ? 'Загружаем сохранённое УТП…' : null}
          {!workspaceLoading && saveStatus === 'pending' ? 'Есть несохранённые изменения' : null}
          {!workspaceLoading && saveStatus === 'saving' ? 'Сохраняем…' : null}
          {!workspaceLoading && saveStatus === 'saved' ? 'Сохранено автоматически' : null}
          {!workspaceLoading && saveStatus === 'error' ? saveError : null}
          {!workspaceLoading && saveStatus === 'error' ? (
            <button type="button" onClick={onRetrySave}>Повторить</button>
          ) : null}
        </span>
      </div>

      <div className={s.editorActions}>
        {hasUtp ? (
          <>
            <button
              type="button"
              className={s.primaryButton}
              disabled={interactionLocked || voiceBusy}
              onClick={() => setImproveOpen((value) => !value)}
            >
              <WandSparkles aria-hidden="true" size={17} /> Улучшить с AI
            </button>
            <button type="button" className={s.secondaryButton} disabled={interactionLocked || voiceBusy} onClick={onGenerate}>
              {loading && !improveOpen ? 'Формулируем…' : 'Создать новый вариант'}
              {!loading ? <AiWorkflowCost workflow="strategy.utp.generate" projectId={activeProjectId} /> : null}
            </button>
            <button type="button" className={s.iconActionButton} disabled={!hasUtp || applyingProposal} onClick={onCopy}>
              <Copy aria-hidden="true" size={17} /> Копировать
            </button>
          </>
        ) : (
          <button type="button" className={s.primaryButton} disabled={interactionLocked || voiceBusy} onClick={onGenerate}>
            <WandSparkles aria-hidden="true" size={17} />
            {loading ? 'Формулируем…' : 'Сформулировать с AI'}
            {!loading ? <AiWorkflowCost workflow="strategy.utp.generate" projectId={activeProjectId} /> : null}
          </button>
        )}
      </div>

      {aiError ? (
        <div className={s.aiInlineError} role="alert">
          <span>{aiError}</span>
          <button type="button" disabled={interactionLocked || voiceBusy} onClick={onRetryAi}>Повторить запрос</button>
        </div>
      ) : null}

      {improveOpen && hasUtp ? (
        <UtpAiImprovePanel
          activeProjectId={activeProjectId}
          value={instruction}
          currentUtp={utpText}
          loading={loading}
          voiceBusy={voiceBusy}
          onChange={onInstructionChange}
          onBusyChange={onVoiceBusyChange}
          onSubmit={onImprove}
          onClose={() => setImproveOpen(false)}
        />
      ) : null}

      {proposal ? (
        <UtpAiProposalPanel
          proposal={proposal}
          applying={applyingProposal}
          onApply={onApplyProposal}
          onDismiss={onDismissProposal}
          onClarify={() => {
            onClarifyProposal();
            setImproveOpen(true);
          }}
        />
      ) : null}

      <UtpMissingData items={missingData} />

      {history.length ? (
        <details className={s.historyPanel}>
          <summary><History aria-hidden="true" size={16} /> История версий</summary>
          <div className={s.historyList}>
            {history.slice(0, 6).map((version) => (
              <button key={version.id} type="button" disabled={editorDisabled} onClick={() => onRestoreVersion(version)}>
                <strong>{version.title}</strong>
                <span>{new Date(version.createdAt).toLocaleString('ru-RU')}</span>
              </button>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
