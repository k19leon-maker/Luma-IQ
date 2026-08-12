import { useEffect, useMemo, useRef, useState } from 'react';
import type { CaseExtractionCandidate, CaseStudySourceType } from '../../api/cases';
import AiWorkflowCost from '../AiWorkflowCost/AiWorkflowCost';
import { VoiceComposer } from '../VoiceComposer/VoiceComposer';
import s from '../../pages/Cases/Cases.module.css';

interface Props {
  open: boolean;
  projectId: string;
  extracting: boolean;
  creating: boolean;
  analyzed: boolean;
  candidates: CaseExtractionCandidate[];
  onClose: () => void;
  onExtract: (sourceText: string, sourceType: CaseStudySourceType) => void;
  onCreate: (candidates: CaseExtractionCandidate[]) => void;
  onReset: () => void;
}

export default function CaseImportDialog({
  open, projectId, extracting, creating, analyzed, candidates, onClose, onExtract, onCreate, onReset,
}: Props) {
  const [sourceText, setSourceText] = useState('');
  const [selected, setSelected] = useState<boolean[]>([]);
  const [editableCandidates, setEditableCandidates] = useState<CaseExtractionCandidate[]>([]);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [sourceType, setSourceType] = useState<CaseStudySourceType>('document');
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setSourceText('');
    setSelected([]);
    setSourceType('document');
    onReset();
    const timer = window.setTimeout(() => textRef.current?.querySelector('textarea')?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [onReset, open]);

  useEffect(() => {
    setSelected(candidates.map(() => true));
    setEditableCandidates(candidates);
  }, [candidates]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !extracting && !creating && !voiceBusy) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [creating, extracting, onClose, open, voiceBusy]);

  const selectedCandidates = useMemo(
    () => editableCandidates.filter((_, index) => selected[index]),
    [editableCandidates, selected],
  );
  const transcriptionContext = useMemo(
    () => ({ purpose: 'cases' as const, projectId }),
    [projectId],
  );
  const selectedCandidatesValid = selectedCandidates.length > 0
    && selectedCandidates.every((candidate) => candidate.title.trim().length > 0);

  if (!open) return null;
  const busy = extracting || creating || voiceBusy;

  return (
    <div className={s.dialogBackdrop} role="presentation" onMouseDown={() => !busy && onClose()}>
      <section className={`${s.createDialog} ${s.importDialog}`} role="dialog" aria-modal="true" aria-labelledby="case-import-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className={s.dialogHeader}>
          <div>
            <p className={s.dialogEyebrow}>AI-анализ</p>
            <h2 id="case-import-title">Создать кейсы из голоса или текста</h2>
          </div>
          <button type="button" className={s.dialogClose} onClick={onClose} disabled={busy} aria-label="Закрыть">×</button>
        </div>

        <div className={s.createForm}>
          <div className={s.createField} ref={textRef}>
            <span>Рассказ о клиентах</span>
            <VoiceComposer
              value={sourceText}
              maxLength={50_000}
              disabled={busy}
              textareaClassName={s.importSource}
              rows={8}
              placeholder="Вставьте свободный рассказ или наговорите его голосом. Вы сможете проверить текст и найденные кейсы до сохранения."
              transcriptionContext={transcriptionContext}
              onBusyChange={setVoiceBusy}
              onTranscribed={() => setSourceType('voice')}
              onChange={(nextValue) => {
                setSourceText(nextValue);
                if (analyzed) onReset();
              }}
            />
            <small className={s.voiceCostHint}>До 5 минут · 10 AI-баллов за транскрибацию. Анализ текста запускается отдельно после проверки.</small>
          </div>

          {analyzed && candidates.length === 0 && (
            <div className={s.importEmpty} role="status">
              В тексте не найдены отдельные клиентские истории. Добавьте исходную ситуацию, ваши действия и результат клиента.
            </div>
          )}

          {editableCandidates.length > 0 && (
            <section className={s.candidateSection} aria-labelledby="candidate-title">
              <div className={s.candidateHeading}>
                <h3 id="candidate-title">Найдено кейсов: {editableCandidates.length}</h3>
                <span>Выберите черновики для создания</span>
              </div>
              <div className={s.candidateList}>
                {editableCandidates.map((candidate, index) => (
                  <div key={index} className={s.candidateRow}>
                    <input
                      type="checkbox"
                      aria-label={`Выбрать кейс ${index + 1}`}
                      checked={selected[index] ?? false}
                      disabled={busy}
                      onChange={(event) => setSelected((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.checked : value))}
                    />
                    <span className={s.candidateContent}>
                      <label htmlFor={`candidate-title-${index}`}>Название черновика</label>
                      <input
                        id={`candidate-title-${index}`}
                        value={candidate.title}
                        maxLength={240}
                        disabled={busy}
                        onChange={(event) => setEditableCandidates((current) => current.map((item, itemIndex) => (
                          itemIndex === index ? { ...item, title: event.target.value } : item
                        )))}
                      />
                      <small>{candidate.beforeText || candidate.actionsText || candidate.afterText || 'Нужно дополнить данные'}</small>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className={s.dialogActions}>
            <button type="button" className={s.secondaryButton} disabled={busy} onClick={onClose}>Отмена</button>
            {editableCandidates.length === 0 ? (
              <button type="button" className={s.primaryButton} disabled={sourceText.trim().length < 40 || sourceText.length > 50_000 || busy} onClick={() => onExtract(sourceText.trim(), sourceType)}>
                {extracting ? 'Собираем кейсы...' : <>Найти кейсы<AiWorkflowCost workflow="cases.extract" projectId={projectId} inputs={{ transcriptChars: sourceText.length }} /></>}
              </button>
            ) : (
              <button type="button" className={s.primaryButton} disabled={!selectedCandidatesValid || busy} onClick={() => onCreate(selectedCandidates)}>
                {creating ? 'Создаём черновики...' : `Создать черновики: ${selectedCandidates.length}`}
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
