import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { castDevApi, type CastDevRecord, type CastDevStatus } from '../../api/castdev.api';
import { getCastDevAnalysisCost, getCastDevTranscriptionCost } from '../../config/ai-balance';
import { useProjectsStore } from '../../store/projects.store';
import s from './CastDev.module.css';

const STATUS_LABELS: Record<CastDevStatus, string> = {
  pending: 'Ожидает транскрибации',
  transcribing: 'Транскрибируется',
  ready_for_analysis: 'Готово к AI-разбору',
  analyzing: 'AI-разбор',
  completed: 'Готово',
  failed: 'Ошибка',
};

function statusClass(status: CastDevStatus): string {
  if (status === 'failed') return s.statusFailed;
  if (status === 'completed') return s.statusDone;
  if (status === 'transcribing' || status === 'analyzing') return s.statusProgress;
  if (status === 'ready_for_analysis') return s.statusReady;
  return s.statusPending;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(durationSec: number | null): string {
  if (!durationSec || durationSec <= 0) return '';
  const minutes = Math.max(1, Math.ceil(durationSec / 60));
  return `${minutes.toLocaleString('ru-RU')} мин.`;
}

function formatChars(value: number): string {
  return value.toLocaleString('ru-RU');
}

function isGoogleDriveLikeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    return hostname === 'drive.google.com'
      || hostname === 'docs.google.com'
      || hostname === 'drive.usercontent.google.com'
      || hostname.endsWith('.googleusercontent.com');
  } catch {
    return false;
  }
}

function previewFor(record: CastDevRecord): string {
  if (record.errorMessage) return record.errorMessage;
  if (record.transcriptText) return record.transcriptText;
  return 'Ссылка добавлена. На следующем этапе запись можно будет транскрибировать и разобрать с ИИ.';
}

type AnalysisItem = {
  title?: unknown;
  type?: unknown;
  quote?: unknown;
};

type CastDevAnalysis = {
  transcriptFormatted?: unknown;
  customerTasks?: unknown;
  fearsProblemsObjections?: unknown;
  desiresGoalsResults?: unknown;
  summaryForContext?: unknown;
};

function getAnalysis(record: CastDevRecord | null): CastDevAnalysis | null {
  if (!record?.analysis || typeof record.analysis !== 'object') return null;
  return record.analysis as CastDevAnalysis;
}

function analysisItems(value: unknown): AnalysisItem[] {
  return Array.isArray(value)
    ? value.filter((item) => item && typeof item === 'object') as AnalysisItem[]
    : [];
}

function analysisText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function typeLabel(value: unknown): string {
  if (value === 'fear') return 'Страх';
  if (value === 'problem') return 'Проблема';
  if (value === 'objection') return 'Возражение';
  return '';
}

export default function CastDev() {
  const activeProjectId = useProjectsStore((state) => state.activeProjectId);
  const [records, setRecords] = useState<CastDevRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [transcribingId, setTranscribingId] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');

  const selected = useMemo(
    () => records.find((record) => record.id === selectedId) ?? null,
    [records, selectedId],
  );
  const selectedAnalysis = useMemo(() => getAnalysis(selected), [selected]);

  useEffect(() => {
    if (!activeProjectId) {
      setRecords([]);
      setSelectedId(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    castDevApi.list(activeProjectId)
      .then((items) => {
        if (cancelled) return;
        setRecords(items);
        setSelectedId((current) => {
          if (current && items.some((item) => item.id === current)) return current;
          return items[0]?.id ?? null;
        });
        setShowForm(items.length === 0);
      })
      .catch(() => {
        if (!cancelled) toast.error('Не удалось загрузить записи CustDev');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeProjectId]);

  async function handleCreate() {
    if (!activeProjectId || creating) return;
    const cleanTitle = title.trim();
    const cleanUrl = sourceUrl.trim();
    if (!cleanTitle) {
      toast.error('Укажите название встречи');
      return;
    }
    if (!isGoogleDriveLikeUrl(cleanUrl)) {
      toast.error('Добавьте ссылку на файл Google Drive');
      return;
    }

    setCreating(true);
    try {
      const record = await castDevApi.create({
        projectId: activeProjectId,
        title: cleanTitle,
        sourceUrl: cleanUrl,
      });
      setRecords((prev) => [record, ...prev]);
      setSelectedId(record.id);
      setTitle('');
      setSourceUrl('');
      setShowForm(false);
      toast.success('Запись CustDev добавлена');
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } }; message?: string };
      const message = error.response?.data?.error || error.message;
      toast.error(message || 'Не удалось добавить запись. Проверьте ссылку и выбранный проект.');
    } finally {
      setCreating(false);
    }
  }

  async function handleRemove(record: CastDevRecord) {
    if (!window.confirm(`Удалить запись «${record.title}»?`)) return;
    try {
      await castDevApi.remove(record.id);
      setRecords((prev) => prev.filter((item) => item.id !== record.id));
      setSelectedId((current) => current === record.id ? records.find((item) => item.id !== record.id)?.id ?? null : current);
      toast.success('Запись удалена');
    } catch {
      toast.error('Не удалось удалить запись');
    }
  }

  async function handleTranscribe(record: CastDevRecord) {
    if (transcribingId) return;
    setTranscribingId(record.id);
    setRecords((prev) => prev.map((item) => item.id === record.id ? { ...item, status: 'transcribing', errorMessage: null } : item));
    try {
      const result = await castDevApi.transcribe(record.id);
      const updated = result.record;
      setRecords((prev) => prev.map((item) => item.id === updated.id ? updated : item));
      setSelectedId(updated.id);
      setTranscriptExpanded(false);
      const balanceText = typeof result.aiBalanceRemaining === 'number'
        ? ` Осталось ${result.aiBalanceRemaining.toLocaleString('ru-RU')} AI-баллов.`
        : '';
      toast.success(`Транскрибация готова. Списано ${result.aiPointsCharged} AI-баллов.${balanceText}`);
    } catch (err) {
      const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Не удалось транскрибировать запись';
      setRecords((prev) => prev.map((item) => item.id === record.id ? { ...item, status: 'failed', errorMessage: message } : item));
      toast.error(message);
    } finally {
      setTranscribingId(null);
    }
  }

  async function handleAnalyze(record: CastDevRecord) {
    if (analyzingId || !record.transcriptText) return;
    setAnalyzingId(record.id);
    setRecords((prev) => prev.map((item) => item.id === record.id ? { ...item, status: 'analyzing', errorMessage: null } : item));
    try {
      const result = await castDevApi.analyze(record.id);
      setRecords((prev) => prev.map((item) => item.id === result.record.id ? result.record : item));
      setSelectedId(result.record.id);
      const balanceText = typeof result.aiBalanceRemaining === 'number'
        ? ` Осталось ${result.aiBalanceRemaining.toLocaleString('ru-RU')} AI-баллов.`
        : '';
      const chargeText = result.replayed || result.aiPointsCharged === 0
        ? 'AI-разбор уже был сохранён, повторного списания нет.'
        : `Списано ${result.aiPointsCharged} AI-баллов.${balanceText}`;
      toast.success(chargeText);
    } catch (err) {
      const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Не удалось выполнить AI-разбор';
      setRecords((prev) => prev.map((item) => item.id === record.id ? { ...item, status: 'ready_for_analysis', errorMessage: message } : item));
      toast.error(message);
    } finally {
      setAnalyzingId(null);
    }
  }

  if (!activeProjectId) {
    return (
      <div className={s.empty}>
        <div className={s.emptyInner}>
          <span className={s.emptyIcon}>🎙️</span>
          <div className={s.emptyTitle}>Выберите проект</div>
          <div className={s.emptyText}>CustDev хранится внутри конкретного проекта и потом будет использоваться в стратегии, продуктах и контенте.</div>
        </div>
      </div>
    );
  }

  return (
    <div className={s.root}>
      <aside className={s.listPanel}>
        <div className={s.listHeader}>
          <span className={s.listTitle}>Записи CustDev</span>
          <button className={s.addBtn} onClick={() => setShowForm(true)}>+ Добавить</button>
        </div>
        <div className={s.listScroll}>
          {loading && <div className={s.recordPreview}>Загружаю записи...</div>}
          {!loading && records.length === 0 && (
            <button className={`${s.recordCard} ${s.recordCardActive}`} onClick={() => setShowForm(true)}>
              <span className={s.recordIcon}>🎙️</span>
              <span className={s.recordBody}>
                <span className={s.recordTitle}>Пока нет записей</span>
                <span className={s.recordMeta}>Добавьте ссылку на Google Drive</span>
                <span className={s.recordPreview}>Здесь появятся встречи, интервью и созвоны с клиентами.</span>
              </span>
            </button>
          )}
          {records.map((record) => (
            <button
              key={record.id}
              className={`${s.recordCard}${record.id === selectedId ? ' ' + s.recordCardActive : ''}`}
              onClick={() => {
                setSelectedId(record.id);
                setShowForm(false);
              }}
            >
              <span className={s.recordIcon}>🎧</span>
              <span className={s.recordBody}>
                <span className={s.recordTitle}>{record.title}</span>
                <span className={s.recordMeta}>{formatDate(record.createdAt)}</span>
                <span className={s.recordPreview}>{previewFor(record)}</span>
                <span className={`${s.status} ${statusClass(record.status)}`}>{STATUS_LABELS[record.status]}</span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <main className={s.detailPanel}>
        <div className={s.detailScroll}>
          <header className={s.hero}>
            <div>
              <div className={s.eyebrow}>Стратегия · реальные интервью</div>
              <h1 className={s.title}>CustDev</h1>
              <p className={s.subtitle}>
                Добавляйте записи встреч с клиентами. На следующем этапе Luma IQ будет транскрибировать их и выделять задачи клиента, страхи, возражения и желаемые результаты.
              </p>
            </div>
          </header>

          {(showForm || !selected) && (
            <section className={s.formCard}>
              <div>
                <div className={s.infoTitle}>Добавить запись</div>
                <p className={s.infoText}>
                  Добавьте публичную ссылку на файл Google Drive. Luma IQ скачает аудио или видео, извлечёт звук при необходимости и сохранит транскрипт.
                </p>
              </div>
              <label className={s.field}>
                <span className={s.label}>Название встречи</span>
                <input
                  className={s.input}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Например: Интервью с клиентом после консультации"
                />
              </label>
              <label className={s.field}>
                <span className={s.label}>Ссылка на файл Google Drive</span>
                <input
                  className={s.input}
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  placeholder="https://drive.google.com/file/d/..."
                />
                <span className={s.hint}>
                  Файл должен быть доступен по ссылке. Поддерживаются mp3, m4a, wav, ogg, mp4, mov и webm.
                </span>
              </label>
              <div className={s.actions}>
                <button className={s.primaryBtn} onClick={handleCreate} disabled={creating}>
                  {creating ? 'Добавляю...' : 'Добавить запись'}
                </button>
                {records.length > 0 && (
                  <button className={s.secondaryBtn} onClick={() => setShowForm(false)}>Отмена</button>
                )}
              </div>
            </section>
          )}

          {selected && !showForm && (
            <>
              <section className={s.block}>
                <div className={s.blockHeader}>
                  <div>
                    <div className={s.eyebrow}>Выбранная запись</div>
                    <h2 className={s.blockTitle}>{selected.title}</h2>
                    <span className={`${s.status} ${statusClass(selected.status)}`}>{STATUS_LABELS[selected.status]}</span>
                  </div>
                  <button className={s.dangerBtn} onClick={() => handleRemove(selected)}>Удалить</button>
                </div>
                <div className={s.field}>
                  <span className={s.label}>Источник</span>
                  <a className={s.sourceLink} href={selected.sourceUrl} target="_blank" rel="noreferrer">
                    {selected.sourceUrl}
                  </a>
                </div>
                <div className={s.actions}>
                  <button
                    className={s.primaryBtn}
                    onClick={() => handleTranscribe(selected)}
                    disabled={transcribingId === selected.id || selected.status === 'transcribing' || selected.status === 'analyzing'}
                  >
                    {transcribingId === selected.id || selected.status === 'transcribing'
                      ? 'Транскрибирую...'
                      : selected.transcriptText
                        ? 'Транскрибировать заново'
                        : 'Транскрибировать запись'}
                  </button>
                  <span className={s.costHint}>{transcribeCostHint(selected)}</span>
                  {selected.transcriptText && (
                    <button
                      className={s.secondaryBtn}
                      onClick={() => handleAnalyze(selected)}
                      disabled={analyzingId === selected.id || selected.status === 'analyzing' || selected.status === 'transcribing'}
                    >
                      {analyzingId === selected.id || selected.status === 'analyzing'
                        ? 'Анализирую...'
                        : selected.analysis
                          ? 'Обновить AI-разбор'
                          : 'Сделать AI-разбор'}
                    </button>
                  )}
                  {selected.transcriptText && (
                    <span className={s.costHint}>{analysisCostHint(selected)}</span>
                  )}
                </div>
              </section>

              {selected.errorMessage && (
                <section className={s.infoCard}>
                  <h3 className={s.infoTitle}>Ошибка обработки</h3>
                  <p className={s.infoText}>{selected.errorMessage}</p>
                </section>
              )}

              {selected.transcriptText ? (
                <section className={s.block}>
                  <div className={s.blockHeader}>
                    <div>
                      <div className={s.eyebrow}>Транскрибация</div>
                      <h3 className={s.blockTitle}>Полная транскрибация</h3>
                    </div>
                    <button className={s.secondaryBtn} onClick={() => setTranscriptExpanded((value) => !value)}>
                      {transcriptExpanded ? 'Свернуть' : 'Раскрыть полностью'}
                    </button>
                  </div>
                  <div className={`${s.transcript}${transcriptExpanded ? '' : ' ' + s.transcriptCollapsed}`}>
                    {(analysisText(selectedAnalysis?.transcriptFormatted) || selected.transcriptFormatted || selected.transcriptText).split(/\n{2,}/).map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))}
                  </div>
                </section>
              ) : (
                <section className={s.infoCard}>
                  <h3 className={s.infoTitle}>Транскрибация ещё не выполнена</h3>
                  <p className={s.infoText}>
                    Нажмите `Транскрибировать запись`. После успешной обработки здесь появится полный текст встречи.
                  </p>
                </section>
              )}

              {selectedAnalysis ? (
                <section className={s.analysisGrid}>
                  <AnalysisBlock
                    title="Ключевые задачи клиента"
                    items={analysisItems(selectedAnalysis.customerTasks)}
                    emptyText="В transcript не найдено явных задач клиента."
                  />
                  <AnalysisBlock
                    title="Страхи, проблемы, возражения"
                    items={analysisItems(selectedAnalysis.fearsProblemsObjections)}
                    emptyText="В transcript не найдено явных страхов, проблем или возражений."
                    showType
                  />
                  <AnalysisBlock
                    title="Желания, цели и результат"
                    items={analysisItems(selectedAnalysis.desiresGoalsResults)}
                    emptyText="В transcript не найдено явных желаний или целей."
                  />
                  <section className={s.analysisBlock}>
                    <h3 className={s.analysisTitle}>Контекст для упаковки</h3>
                    <p className={s.analysisSummary}>
                      {analysisText(selectedAnalysis.summaryForContext) || 'Краткий вывод пока не сформирован.'}
                    </p>
                  </section>
                </section>
              ) : selected.transcriptText ? (
                <section className={s.infoCard}>
                  <h3 className={s.infoTitle}>AI-разбор ещё не выполнен</h3>
                  <p className={s.infoText}>
                    Нажмите «Сделать AI-разбор». Luma IQ выделит ключевые задачи клиента, страхи, проблемы, возражения и желаемые результаты.
                  </p>
                </section>
              ) : null}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function transcribeCostHint(record: CastDevRecord): string {
  if (record.durationSec) {
    const cost = getCastDevTranscriptionCost(record.durationSec);
    return `Длительность: ${formatDuration(record.durationSec)}. Транскрибация спишет ${cost} AI-баллов после успеха.`;
  }
  return 'Транскрибация спишет 10-70 AI-баллов после успеха. Стоимость зависит от длительности записи.';
}

function analysisCostHint(record: CastDevRecord): string {
  const transcriptChars = record.transcriptText?.length ?? 0;
  const cost = getCastDevAnalysisCost(transcriptChars);
  return `AI-разбор спишет ${cost} AI-баллов после успеха. Длина transcript: ${formatChars(transcriptChars)} симв.`;
}

function AnalysisBlock(props: {
  title: string;
  items: AnalysisItem[];
  emptyText: string;
  showType?: boolean;
}) {
  return (
    <section className={s.analysisBlock}>
      <h3 className={s.analysisTitle}>{props.title}</h3>
      {props.items.length === 0 ? (
        <p className={s.analysisEmpty}>{props.emptyText}</p>
      ) : (
        <div className={s.analysisList}>
          {props.items.map((item, index) => {
            const label = typeLabel(item.type);
            return (
              <article className={s.analysisItem} key={index}>
                <div className={s.analysisItemHeader}>
                  <h4>{analysisText(item.title) || `Пункт ${index + 1}`}</h4>
                  {props.showType && label && <span>{label}</span>}
                </div>
                <p>{analysisText(item.quote) || 'Дословная формулировка не найдена.'}</p>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
