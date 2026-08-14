import { useEffect, useMemo, useRef, useState } from 'react';
import type { CaseExtractionCandidate, CaseStudySourceType } from '../../api/cases';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import AiWorkflowCost from '../AiWorkflowCost/AiWorkflowCost';
import { VoiceComposer } from '../VoiceComposer/VoiceComposer';
import { casesApi } from '../../api/cases';
import toast from 'react-hot-toast';
import s from '../../pages/Cases/Cases.module.css';

interface Props {
  open: boolean;
  projectId: string;
  extracting: boolean;
  creating: boolean;
  analyzed: boolean;
  candidates: CaseExtractionCandidate[];
  onClose: () => void;
  onExtract: (input: { sourceText: string; sourceType: CaseStudySourceType; importId?: string }) => void;
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
  const [importBusy, setImportBusy] = useState(false);
  const [googleUrl, setGoogleUrl] = useState('');
  const [sourceImportId, setSourceImportId] = useState<string | undefined>();
  const [sourcePreviewOnly, setSourcePreviewOnly] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imagesInputRef = useRef<HTMLInputElement>(null);
  const [sourceType, setSourceType] = useState<CaseStudySourceType>('document');
  const textRef = useRef<HTMLDivElement>(null);
  const busy = extracting || creating || voiceBusy || importBusy;
  const dialogRef = useDialogFocus({
    open,
    onClose,
    closeDisabled: busy,
    initialFocusRef: textRef,
  });

  useEffect(() => {
    if (!open) return;
    setSourceText('');
    setSelected([]);
    setSourceType('document');
    setGoogleUrl('');
    setSourceImportId(undefined);
    setSourcePreviewOnly(false);
    onReset();
    return undefined;
  }, [onReset, open]);

  useEffect(() => {
    setSelected(candidates.map(() => true));
    setEditableCandidates(candidates);
  }, [candidates]);

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

  async function importDocument(file?: File) {
    if (!file) return;
    setImportBusy(true);
    try {
      const imported = await casesApi.importDocument(projectId, file);
      setSourceText(imported.sourceText);
      setSourceType('document');
      setSourceImportId(imported.importId);
      setSourcePreviewOnly(imported.previewOnly);
      onReset();
      toast.success(`Текст извлечён из «${imported.fileName}». Проверьте его перед анализом.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось прочитать документ');
    } finally {
      setImportBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function importGoogle() {
    if (!googleUrl.trim()) return;
    setImportBusy(true);
    try {
      const imported = await casesApi.importGoogleDocument(projectId, googleUrl.trim());
      setSourceText(imported.sourceText);
      setSourceType('document');
      setSourceImportId(imported.importId);
      setSourcePreviewOnly(imported.previewOnly);
      onReset();
      toast.success(`Текст извлечён из «${imported.fileName}». Проверьте его перед анализом.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось прочитать Google-файл');
    } finally {
      setImportBusy(false);
    }
  }

  async function recognizeScreenshots(files: File[]) {
    if (!files.length) return;
    setImportBusy(true);
    try {
      const result = await casesApi.recognizeScreenshots(projectId, files, crypto.randomUUID());
      setSourceText(result.sourceText);
      setSourceType('screenshot');
      setSourceImportId(result.importId);
      setSourcePreviewOnly(result.previewOnly);
      onReset();
      toast.success('Текст со скриншотов распознан. Проверьте и отредактируйте его перед анализом.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось распознать скриншоты');
    } finally {
      setImportBusy(false);
      if (imagesInputRef.current) imagesInputRef.current.value = '';
    }
  }

  return (
    <div className={s.dialogBackdrop} role="presentation" onMouseDown={() => !busy && onClose()}>
      <section ref={dialogRef} className={`${s.createDialog} ${s.importDialog}`} role="dialog" aria-modal="true" aria-labelledby="case-import-title" tabIndex={-1} onMouseDown={(event) => event.stopPropagation()}>
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
              disabled={busy}
              textareaClassName={s.importSource}
              rows={8}
              placeholder="Вставьте свободный рассказ или наговорите его голосом. Вы сможете проверить текст и найденные кейсы до сохранения."
              transcriptionContext={transcriptionContext}
              onBusyChange={setVoiceBusy}
              onTranscribed={() => { setSourceType('voice'); setSourceImportId(undefined); setSourcePreviewOnly(false); }}
              onChange={(nextValue) => {
                setSourceText(nextValue);
                setSourceImportId(undefined);
                setSourcePreviewOnly(false);
                if (analyzed) onReset();
              }}
            />
            <small className={s.voiceCostHint}>До 5 минут · 10 AI-баллов за транскрибацию. Анализ текста запускается отдельно после проверки.</small>
            {sourcePreviewOnly && <small className={s.voiceCostHint}>Показан только предпросмотр длинного документа. Анализ использует полный исходный файл на сервере.</small>}
          </div>

          {!analyzed && (
            <div className={s.importSources}>
              <span>Или добавьте материалы</span>
              <div className={s.importSourceActions}>
                <input ref={fileInputRef} className={s.srOnly} type="file" accept=".pdf,.doc,.docx,.pptx,.xls,.xlsx,.txt,.md,.csv" onChange={(event) => void importDocument(event.target.files?.[0])} />
                <button type="button" className={s.secondaryButton} disabled={busy} onClick={() => fileInputRef.current?.click()}>
                  Загрузить документ
                </button>
                <input ref={imagesInputRef} className={s.srOnly} type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(event) => void recognizeScreenshots(Array.from(event.target.files ?? []))} />
                <button type="button" className={s.secondaryButton} disabled={busy} onClick={() => imagesInputRef.current?.click()}>
                  Загрузить скриншоты
                </button>
              </div>
              <div className={s.googleImport}>
                <input value={googleUrl} disabled={busy} onChange={(event) => setGoogleUrl(event.target.value)} placeholder="Ссылка на публичный Google Docs, Slides, Sheets или Drive" />
                <button type="button" className={s.secondaryButton} disabled={busy || !googleUrl.trim()} onClick={() => void importGoogle()}>
                  Прочитать ссылку
                </button>
              </div>
              <small>Текстовые документы до 50 MB, сканированный PDF до 20 MB. Скриншоты: до 20 файлов, до 10 MB каждый. Распознавание скриншотов и сканов, а также последующий анализ - отдельные AI-действия. Личные Google-файлы сервис не запрашивает.</small>
            </div>
          )}

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
              <button type="button" className={s.primaryButton} disabled={sourceText.trim().length < 40 || busy} onClick={() => onExtract({ sourceText: sourcePreviewOnly ? '' : sourceText.trim(), sourceType, importId: sourceImportId })}>
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
