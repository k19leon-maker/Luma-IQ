import { useState, useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';
import { NavLink } from 'react-router-dom';
import { SplitEditor, SplitItem } from '../../components/SplitEditor/SplitEditor';
import { useProjectsStore } from '../../store/projects.store';
import { useAudienceStore } from '../../store/audience.store';
import { useContentPlanStore } from '../../store/contentPlan.store';
import { useContentApi } from '../../hooks/useContentApi';
import { exportToDocx } from '../../utils/exportDocx';
import { aiApi } from '../../api/ai';
import AiWorkflowCost from '../../components/AiWorkflowCost/AiWorkflowCost';
import type { ContentItem } from '../../api/content.api';
import { contentGenerationKey, useContentGenerationStore } from '../../store/content-generation.store';
import { createdDateRu, isMigrated, markMigrated, metadataString, readLegacyItemsWithProjectFallback } from '../../utils/generatedContentPersistence';
import { isDemoContentText } from '../../utils/demoDataCleanup';
import { VoiceComposer } from '../../components/VoiceComposer/VoiceComposer';
import { ContentRevisionComposer } from '../../components/ContentRevisionComposer/ContentRevisionComposer';
import { makeAiIdempotencyKey } from '../../utils/aiIdempotency';
import s from './VideoScripts.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type Duration = '8' | '10' | '12';
type CtaType  = 'telegram' | 'leadmagnet';
type Phase    = 'step1' | 'step2-loading' | 'step2' | 'generating' | 'editor';

interface StrategyData {
  chosenSegment?:    string;
  chosenSubsegment?: string;
}

interface SavedScript {
  id:            string;
  dbId?:         string;
  duration:      Duration;
  ctaType:       CtaType;
  botKeyword:    string;
  content:       string;
  editedContent: string;
  editedTitle:   string;
  createdAt:     string;
  workflowRunId?: string;
  workflowStepId?: string;
  artifactId?:    string;
  generationId?:  string;
}

interface ScriptItem extends SplitItem {
  duration: Duration;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DURATION_OPTIONS: { key: Duration; label: string; desc: string }[] = [
  { key: '8',  label: '8 мин',  desc: 'Компактный формат: крючок → проблема → кейс → решение → призыв' },
  { key: '10', label: '10 мин', desc: 'Стандартный формат с углублённой практикой'                      },
  { key: '12', label: '12 мин', desc: 'Расширенный формат с работой с возражениями'                     },
];

const DURATION_LABELS: Record<Duration, string> = {
  '8': '8 мин', '10': '10 мин', '12': '12 мин',
};

const FACTURE_HINTS = [
  '1. Есть ли реальный кейс из практики по этой теме?',
  '2. С каким запросом приходит клиент — как он формулирует проблему?',
  '3. Какой инсайт или разворот чаще всего меняет ситуацию?',
  '4. Какой инструмент или технику вы используете?',
  '5. Какой результат получают клиенты после работы с вами?',
];

// ─── Storage ──────────────────────────────────────────────────────────────────

function scriptsKey(projectId: string) { return `video_scripts_${projectId}`; }

function loadScripts(projectId: string): SavedScript[] {
  return readLegacyItemsWithProjectFallback<SavedScript>(scriptsKey(projectId), projectId);
}

function scriptFromDb(item: ContentItem): SavedScript {
  const duration = metadataString(item, 'duration', '10') as Duration;
  return {
    id: `db-${item.id}`,
    dbId: item.id,
    duration,
    ctaType: metadataString(item, 'ctaType', 'telegram') as CtaType,
    botKeyword: metadataString(item, 'botKeyword', ''),
    content: item.content,
    editedContent: '',
    editedTitle: item.title ?? `Сценарий · ${DURATION_LABELS[duration]}`,
    createdAt: createdDateRu(item),
    workflowRunId: metadataString(item, 'workflowRunId', undefined as unknown as string),
    workflowStepId: metadataString(item, 'workflowStepId', undefined as unknown as string),
    artifactId: metadataString(item, 'artifactId', undefined as unknown as string),
    generationId: metadataString(item, 'generationId', undefined as unknown as string),
  };
}

// ─── Stepper ──────────────────────────────────────────────────────────────────

function Stepper({ step }: { step: 1 | 2 }) {
  const steps = ['Настройка', 'Тема и фактура', 'Готовый сценарий'];
  return (
    <div className={s.stepper}>
      {steps.map((label, i) => {
        const n      = i + 1;
        const isDone = n < step;
        const isAct  = n === step;
        return (
          <div key={i} className={s.stepItem}>
            {i > 0 && <div className={s.stepLine} />}
            <div className={`${s.stepDot}${isAct ? ' ' + s.stepDotActive : ''}${isDone ? ' ' + s.stepDotDone : ''}`}>
              {isDone ? '✓' : n}
            </div>
            <span className={`${s.stepLabel}${isAct ? ' ' + s.stepLabelActive : ''}`}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VideoScripts() {
  const activeProjectId = useProjectsStore((s) => s.activeProjectId);
  const { openAddModal } = useContentPlanStore();
  const { dbItems, loaded: dbLoaded, saveItem: saveToApi, updateItem: updateInApi } = useContentApi({ projectId: activeProjectId, type: 'VIDEO_SCRIPT' });

  const generationTask = useContentGenerationStore((s) => s.tasks[contentGenerationKey(activeProjectId, 'video-scripts')]);
  const startGenerationTask = useContentGenerationStore((s) => s.startTask);
  const finishGenerationTask = useContentGenerationStore((s) => s.finishTask);

  const strat = (useAudienceStore((s) => s.projects[activeProjectId ?? '']?.answers) ?? {}) as StrategyData;
  const hasStrategy = !!(strat.chosenSegment || strat.chosenSubsegment);

  // Scripts
  const [scripts,    setScripts]    = useState<SavedScript[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Phase
  const [phase, setPhase] = useState<Phase>('step1');

  // Step 1
  const [duration,   setDuration]   = useState<Duration>('10');
  const [ctaType,    setCtaType]    = useState<CtaType>('telegram');
  const [botKeyword, setBotKeyword] = useState('');
  const [ideaFlow, setIdeaFlow] = useState('');

  // Step 2
  const [themes,        setThemes]        = useState<string[]>([]);
  const [selectedTheme, setSelectedTheme] = useState('');
  const [facture,       setFacture]       = useState('');
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [revisingId, setRevisingId] = useState<string | null>(null);

  // Editor unsaved changes
  const [editMap, setEditMap] = useState<Record<string, { title: string; content: string }>>({});

  // ── Persist ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeProjectId || !dbLoaded) return;

    const fromDb = dbItems.map(scriptFromDb).filter((script) => !isDemoContentText(script));
    if (fromDb.length > 0) {
      setScripts(fromDb);
      setSelectedId(fromDb[0]?.id ?? null);
      setPhase(fromDb.length ? 'editor' : 'step1');
      return;
    }

    const legacy = loadScripts(activeProjectId).filter((script) => !isDemoContentText(script));
    if (legacy.length > 0 && !isMigrated(activeProjectId, 'video-scripts')) {
      setScripts(legacy);
      setSelectedId(legacy[0]?.id ?? null);
      setPhase('editor');
      legacy.forEach((script) => {
        void saveToApi({
          title: script.editedTitle,
          content: script.editedContent || script.content,
          platform: 'YouTube',
          metadata: {
            duration: script.duration,
            ctaType: script.ctaType,
            botKeyword: script.botKeyword,
            workflowRunId: script.workflowRunId,
            workflowStepId: script.workflowStepId,
            artifactId: script.artifactId,
            generationId: script.generationId,
          },
        });
      });
      markMigrated(activeProjectId, 'video-scripts');
      return;
    }

    setScripts([]);
    setSelectedId(null);
    setPhase('step1');
  }, [activeProjectId, dbItems, dbLoaded, saveToApi]);

  const updateScripts = useCallback((next: SavedScript[]) => {
    setScripts(next);
  }, []);

  useEffect(() => {
    const entries = Object.entries(editMap);
    if (entries.length === 0) return;
    const timer = window.setTimeout(() => {
      entries.forEach(([scriptId, draft]) => {
        const script = scripts.find((item) => item.id === scriptId);
        if (!script?.dbId) return;
        void updateInApi(script.dbId, { title: draft.title, content: draft.content });
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [editMap, scripts, updateInApi]);

  // ── Step 1 → Step 2 ──────────────────────────────────────────────────────────
  async function handleGenerateThemes() {
    if (!activeProjectId) {
      toast.error('Сначала выберите проект');
      return;
    }
    setPhase('step2-loading');
    try {
      const seg      = strat.chosenSegment ?? strat.chosenSubsegment ?? 'взрослые с психологическими проблемами';
      const workflow = 'video.topic.generate';
      const inputs = {
        duration,
        segment: seg,
        ideaFlow: ideaFlow.trim() || null,
      };
      const resp = await aiApi.startWorkflow('video.topic.generate', {
        projectId: activeProjectId,
        provider: 'chatgpt',
        inputs,
        idempotencyKey: makeAiIdempotencyKey({ projectId: activeProjectId, workflow, inputs }),
      });

      const lines = resp.content
        .split('\n')
        .map((l) => l.replace(/^\d+[\.\)]\s*/, '').trim())
        .filter((l) => l.length > 10)
        .slice(0, 5);

      if (lines.length === 0) {
        toast.error('Неполадки со связью. Попробуйте обновить страницу и интернет соединение.');
        return;
      }
      setThemes(lines);
      setSelectedTheme(lines[0] ?? '');
      setFacture('');
    } catch (err) {
      console.error('[VideoScripts] themes AI error:', err);
      toast.error('Неполадки со связью. Попробуйте обновить страницу и интернет соединение.');
      return;
    }
    setPhase('step2');
  }

  // ── Step 2 → Editor ──────────────────────────────────────────────────────────
  async function handleGenerateScript() {
    if (!activeProjectId) {
      toast.error('Сначала выберите проект');
      return;
    }
    startGenerationTask(activeProjectId, 'video-scripts', 'Пишу сценарий видео', selectedTheme || 'Формирую структуру сценария');
    setPhase('generating');
    try {
      const seg      = strat.chosenSegment ?? strat.chosenSubsegment ?? '';
      const ctaText  = ctaType === 'telegram'
        ? 'CTA: подписаться на Telegram-канал эксперта'
        : `CTA: получить бесплатный материал, написав слово «${botKeyword || 'СТАРТ'}» боту`;

      const workflow = 'video.script.write';
      const inputs = {
        duration,
        topic: selectedTheme,
        segment: seg,
        facture,
        cta: ctaText,
        intent: ctaType === 'leadmagnet' ? 'selling' : 'education',
      };
      const resp = await aiApi.startWorkflow('video.script.write', {
        projectId: activeProjectId,
        provider: 'chatgpt',
        inputs,
        idempotencyKey: makeAiIdempotencyKey({ projectId: activeProjectId, workflow, inputs }),
      });

      const content = resp.content.trim();
      if (!content) {
        toast.error('AI вернул пустой сценарий. Попробуйте сгенерировать ещё раз.');
        setPhase('step2');
        return;
      }
      const id    = `vs-${Date.now()}`;
      const title = `${selectedTheme.slice(0, 50)}… · ${DURATION_LABELS[duration]}`;
      const now   = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
      const newScript: SavedScript = {
        id, duration, ctaType, botKeyword,
        content, editedContent: '', editedTitle: title, createdAt: now,
        workflowRunId: resp.workflowRunId,
        workflowStepId: resp.workflowStepId,
        artifactId: resp.artifactId,
        generationId: resp.generationId,
      };
      const next = [newScript, ...scripts];
      updateScripts(next);
      setSelectedId(id);
      setPhase('editor');
      void saveToApi({
        title,
        content,
        platform: 'YouTube',
        metadata: {
          duration,
          ctaType,
          botKeyword,
          workflowRunId: resp.workflowRunId,
          workflowStepId: resp.workflowStepId,
          artifactId: resp.artifactId,
          generationId: resp.generationId,
        },
      }).then((dbItem) => {
        if (!dbItem) return;
        updateScripts(next.map((script) => script.id === id ? { ...script, dbId: dbItem.id } : script));
      });
    } catch (err) {
      console.warn('[VideoScripts] generate AI error:', err);
      toast.error('Не удалось сгенерировать сценарий. Попробуйте ещё раз.');
      setPhase('step2');
    } finally {
      finishGenerationTask(activeProjectId, 'video-scripts');
    }
  }

  // ── Editor helpers ────────────────────────────────────────────────────────────
  function getEditorState(sc: SavedScript) {
    const ov = editMap[sc.id];
    return {
      title:   ov?.title   ?? sc.editedTitle,
      content: ov?.content ?? (sc.editedContent || sc.content),
    };
  }

  function setEditorField(scId: string, field: 'title' | 'content', value: string) {
    setEditMap(prev => {
      const sc  = scripts.find(s => s.id === scId)!;
      const cur = prev[scId] ?? { title: sc.editedTitle, content: sc.editedContent || sc.content };
      return { ...prev, [scId]: { ...cur, [field]: value } };
    });
  }

  function handleSave(scId: string) {
    const ov = editMap[scId];
    if (!ov) return;
    const next = scripts.map(sc =>
      sc.id === scId ? { ...sc, editedTitle: ov.title, editedContent: ov.content } : sc,
    );
    updateScripts(next);
    const script = next.find((sc) => sc.id === scId);
    if (script?.dbId) {
      void updateInApi(script.dbId, {
        title: ov.title,
        content: ov.content,
        metadata: {
          duration: script.duration,
          ctaType: script.ctaType,
          botKeyword: script.botKeyword,
          workflowRunId: script.workflowRunId,
          workflowStepId: script.workflowStepId,
          artifactId: script.artifactId,
          generationId: script.generationId,
        },
      });
    }
    setEditMap(prev => { const n = { ...prev }; delete n[scId]; return n; });
  }

  async function handleAiRevision(script: SavedScript, instruction: string): Promise<boolean> {
    if (!activeProjectId) return false;
    const current = getEditorState(script);
    setRevisingId(script.id);
    try {
      const workflow = 'video.script.edit';
      const inputs = { title: current.title, currentContent: current.content, instruction };
      const response = await aiApi.startWorkflow(workflow, {
        projectId: activeProjectId,
        provider: 'chatgpt',
        inputs,
        idempotencyKey: makeAiIdempotencyKey({ projectId: activeProjectId, workflow, inputs }),
      });
      setEditorField(script.id, 'content', response.content);
      toast.success('Сценарий доработан. Проверьте результат и сохраните.');
      return true;
    } catch (error) {
      console.error('[VideoScripts] AI revision failed', error);
      toast.error('Не удалось доработать сценарий. Попробуйте ещё раз.');
      return false;
    } finally {
      setRevisingId(null);
    }
  }

  function handleCopy(scId: string) {
    const sc = scripts.find(s => s.id === scId);
    if (sc) navigator.clipboard.writeText(getEditorState(sc).content);
  }

  function handleDownload(scId: string) {
    const sc = scripts.find(s => s.id === scId);
    if (!sc) return;
    const { title, content } = getEditorState(sc);
    void exportToDocx(title, content, title || 'video-script');
  }

  function goToStep1() {
    setDuration('10'); setCtaType('telegram'); setBotKeyword('');
    setPhase('step1');
  }

  // ── SplitEditor items ─────────────────────────────────────────────────────────
  const splitItems: ScriptItem[] = scripts.map(sc => ({
    id:       sc.id,
    icon:     '🎬',
    title:    sc.editedTitle,
    meta:     `${DURATION_LABELS[sc.duration]} · ${sc.createdAt}`,
    preview:  (sc.editedContent || sc.content).slice(0, 120),
    duration: sc.duration,
  }));

  // ── Editor right panel ────────────────────────────────────────────────────────
  function renderEditor(item: ScriptItem | null) {
    if (!item) {
      return (
        <div className={s.emptyEditor}>
          <span className={s.emptyIcon}>🎬</span>
          <span className={s.emptyText}>Выберите сценарий слева</span>
        </div>
      );
    }
    const sc              = scripts.find(s => s.id === item.id)!;
    const { title, content } = getEditorState(sc);
    const hasChanges      = !!editMap[sc.id];

    return (
      <div className={s.editorPanel}>
        <div className={s.editorHeader}>
          <input
            className={s.editorTitleInput}
            value={title}
            onChange={e => setEditorField(sc.id, 'title', e.target.value)}
          />
          <div className={s.editorMeta}>
            <span className={s.badge}>🎬 {DURATION_LABELS[sc.duration]}</span>
          </div>
        </div>

        <textarea
          className={s.editorTextarea}
          value={content}
          onChange={e => setEditorField(sc.id, 'content', e.target.value)}
        />

        <div className={s.editorActions}>
          <button className={s.actionBtn} onClick={() => handleCopy(sc.id)}>Копировать</button>
          <button className={s.actionBtn} onClick={() => { const st = getEditorState(sc); openAddModal({ type: 'video_script', title: st.title, content: st.content, preview: st.content.split('\n').filter(Boolean).slice(0,2).join('\n'), platform: 'YouTube', projectId: activeProjectId ?? undefined, sourceId: sc.id }); }}>
            📅 В контент-план
          </button>
          <button
            className={`${s.actionBtn} ${s.actionBtnPrimary}${!hasChanges ? ' ' + s.actionBtnDisabled : ''}`}
            onClick={() => handleSave(sc.id)}
            disabled={!hasChanges}
          >
            Сохранить
          </button>
          <button className={s.actionBtn} onClick={() => handleDownload(sc.id)}>Скачать .docx</button>
        </div>
        <ContentRevisionComposer
          key={sc.id}
          projectId={activeProjectId}
          workflow="video.script.edit"
          isLoading={revisingId === sc.id}
          onSubmit={(instruction) => handleAiRevision(sc, instruction)}
          placeholder="Например: усилите первые 30 секунд, добавьте пример и сохраните тайминги"
        />
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (phase === 'step2-loading') {
    return (
      <div className={s.loadingScreen}>
        <div className={s.loadingSpinner} />
        <p className={s.loadingText}>Генерирую темы для видео...</p>
      </div>
    );
  }

  if (phase === 'generating' || generationTask) {
    return (
      <div className={s.loadingScreen}>
        <span className={s.loadingSpinner} />
        <p className={s.loadingText}>{generationTask?.title ?? 'Пишу сценарий... это займёт несколько секунд'}</p>
      </div>
    );
  }

  // ── Editor ────────────────────────────────────────────────────────────────────
  if (phase === 'editor') {
    return (
      <SplitEditor
        items={splitItems}
        selectedId={selectedId}
        onSelect={setSelectedId}
        renderEditor={renderEditor}
        listTitle="Сценарии"
        listHeaderAction={
          <button className={s.newArticleBtn} onClick={goToStep1}>+ Создать</button>
        }
      />
    );
  }

  // ── Step 1 ────────────────────────────────────────────────────────────────────
  if (phase === 'step1') {
    return (
      <div className={s.page}>
        <Stepper step={1} />

        {hasStrategy ? (
          <div className={s.strategyBanner}>
            <span className={s.strategyLabel}>Из стратегии:</span>
            {strat.chosenSegment    && <span className={s.badge}>{strat.chosenSegment}</span>}
            {strat.chosenSubsegment && <span className={s.badge}>{strat.chosenSubsegment}</span>}
          </div>
        ) : (
          <div className={s.warnBanner}>
            <span>⚠️</span>
            <span>
              Сначала пройдите <NavLink to="/strategy" className={s.warnLink}>Стратегию</NavLink> — это улучшит темы видео
            </span>
          </div>
        )}

        {/* Duration */}
        <div className={s.section}>
          <div className={s.sectionTitle}>Хронометраж</div>
          <div className={s.chipGroup}>
            {DURATION_OPTIONS.map(d => (
              <button
                key={d.key}
                className={`${s.chip}${duration === d.key ? ' ' + s.chipActive : ''}`}
                onClick={() => setDuration(d.key)}
              >
                {d.label}
              </button>
            ))}
          </div>
          <div className={s.typeDesc}>
            {DURATION_OPTIONS.find(d => d.key === duration)?.desc}
          </div>
        </div>

        {/* CTA */}
        <div className={s.section}>
          <div className={s.sectionTitle}>Призыв к действию</div>
          <div className={s.chipGroup}>
            <button
              className={`${s.chip}${ctaType === 'telegram' ? ' ' + s.chipActive : ''}`}
              onClick={() => setCtaType('telegram')}
            >
              📱 Подписка на ТГ канал
            </button>
            <button
              className={`${s.chip}${ctaType === 'leadmagnet' ? ' ' + s.chipActive : ''}`}
              onClick={() => setCtaType('leadmagnet')}
            >
              🎁 Лид-магнит в боте
            </button>
          </div>
          {ctaType === 'leadmagnet' && (
            <div style={{ marginTop: 12 }}>
              <span className={s.sectionSub}>Кодовое слово для бота</span>
              <input
                className={s.textInput}
                placeholder="Например: БЛИЗОСТЬ, СТАРТ, ПОМОЩЬ"
                value={botKeyword}
                onChange={e => setBotKeyword(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className={s.section}>
          <div className={s.sectionTitle}>Ваши идеи для видео</div>
          <div className={s.sectionSub}>Надиктуйте поток мыслей. AI предложит темы, а сценарий будет создан только после вашего выбора.</div>
          <VoiceComposer
            value={ideaFlow}
            onChange={setIdeaFlow}
            placeholder="Наговорите тезисы, историю, пример или вопрос аудитории..."
            textareaClassName={s.factureTextarea}
            rows={4}
            onBusyChange={setVoiceBusy}
          />
        </div>

        <div className={s.btnRow}>
          {scripts.length > 0 && (
            <button className={s.secondaryBtn} onClick={() => setPhase('editor')}>
              ← Назад к сценариям
            </button>
          )}
          <button className={s.primaryBtn} onClick={() => void handleGenerateThemes()} disabled={voiceBusy}>
            Сгенерировать темы →
          </button>
        </div>
      </div>
    );
  }

  // ── Step 2 ────────────────────────────────────────────────────────────────────
  return (
    <div className={s.page}>
      <Stepper step={2} />

      <div className={s.section}>
        <div className={s.sectionTitle}>Выберите тему видео</div>
        <div className={s.sectionSub}>
          ИИ предложил 5 тем для формата «{DURATION_LABELS[duration]}»
        </div>
        <div className={s.themeList}>
          {themes.map((theme, i) => (
            <button
              key={i}
              className={`${s.themeItem}${selectedTheme === theme ? ' ' + s.themeItemActive : ''}`}
              onClick={() => setSelectedTheme(theme)}
            >
              <span className={s.themeRadio}>{selectedTheme === theme ? '◉' : '○'}</span>
              <span className={s.themeText}>«{theme}»</span>
            </button>
          ))}
        </div>
      </div>

      {/* Facture */}
      <div className={s.section}>
        <div className={s.sectionTitle}>Фактура</div>
        <div className={s.factureCard}>
          {FACTURE_HINTS.map((hint, i) => (
            <div key={i} className={s.factureHint}>{hint}</div>
          ))}
        </div>

        <VoiceComposer
          value={facture}
          onChange={setFacture}
          textareaClassName={s.factureTextarea}
          placeholder="Расскажите о своём опыте, случае из практики, кейсе клиента..."
          onBusyChange={setVoiceBusy}
        />

        <div className={s.factureCounter}>
          {facture.length} символов{' '}
          {facture.trim().length < 50 && (
            <span className={s.factureCounterWarn}>(минимум 50)</span>
          )}
        </div>
      </div>

      <div className={s.btnRow}>
        <button className={s.secondaryBtn} onClick={() => setPhase('step1')}>← Назад</button>
        <button
          className={s.primaryBtn}
          disabled={facture.trim().length < 50 || voiceBusy}
          onClick={() => void handleGenerateScript()}
        >
          Написать сценарий
          <AiWorkflowCost
            workflow="video.script.write"
            projectId={activeProjectId}
            inputs={{ intent: ctaType === 'leadmagnet' ? 'selling' : 'education' }}
          />
          {' →'}
        </button>
      </div>
    </div>
  );
}
