import { useState, useCallback, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useProjectsStore } from '../../store/projects.store';
import { useAudienceStore } from '../../store/audience.store';
import { useContentPlanStore } from '../../store/contentPlan.store';
import { useContentApi } from '../../hooks/useContentApi';
import { exportToDocx } from '../../utils/exportDocx';
import { ModelBar } from '../../components/MessageInput/MessageInput';
import { VoiceComposer } from '../../components/VoiceComposer/VoiceComposer';
import { ContentRevisionComposer } from '../../components/ContentRevisionComposer/ContentRevisionComposer';
import AiWorkflowCost from '../../components/AiWorkflowCost/AiWorkflowCost';
import { aiApi } from '../../api/ai';
import { useModelStore } from '../../store/model.store';
import type { ContentItem } from '../../api/content.api';
import { contentGenerationKey, useContentGenerationStore } from '../../store/content-generation.store';
import { isMigrated, markMigrated, metadataString, readLegacyObjectWithProjectFallback } from '../../utils/generatedContentPersistence';
import { isDemoContentText } from '../../utils/demoDataCleanup';
import { makeAiIdempotencyKey } from '../../utils/aiIdempotency';
import s from './ChatbotChains.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type Format = 'article' | 'video';
type Phase  = 'step1' | 'generating' | 'step2';

interface StrategyData {
  chosenSegment?:    string;
  chosenSubsegment?: string;
}

interface ChainMessage {
  id:            string;
  index:         number;
  part:          1 | 2 | 3;
  role:          string;
  dayDelay:      number;
  content:       string;
  editedContent: string;
}

interface StoredChain {
  dbId?:           string;
  format:          Format;
  botName:         string;
  meetingSchedule: string;
  messages:        ChainMessage[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PART_LABELS: Record<1 | 2 | 3, string> = {
  1: 'ЧАСТЬ 1 — ЛИД-МАГНИТ',
  2: 'ЧАСТЬ 2 — МИНИ-ПРОДУКТ',
  3: 'ЧАСТЬ 3 — ВСТРЕЧА',
};

const MSG_DEFS: Array<{ index: number; part: 1|2|3; role: string; dayDelay: number }> = [
  { index: 1,  part: 1, role: 'Приветствие',    dayDelay: 0  },
  { index: 2,  part: 1, role: 'Боль',            dayDelay: 1  },
  { index: 3,  part: 1, role: 'Инсайт',          dayDelay: 2  },
  { index: 4,  part: 1, role: 'История клиента', dayDelay: 3  },
  { index: 5,  part: 1, role: 'Дожим',           dayDelay: 4  },
  { index: 6,  part: 2, role: 'Переход',         dayDelay: 5  },
  { index: 7,  part: 2, role: 'Проблема глубже', dayDelay: 6  },
  { index: 8,  part: 2, role: 'Продукт',         dayDelay: 7  },
  { index: 9,  part: 2, role: 'Возражение',      dayDelay: 9  },
  { index: 10, part: 2, role: 'Призыв',          dayDelay: 10 },
  { index: 11, part: 3, role: 'Анонс',           dayDelay: 12 },
  { index: 12, part: 3, role: 'Ценность',        dayDelay: 14 },
  { index: 13, part: 3, role: 'Последний шанс',  dayDelay: 16 },
];

const EMPTY_CHAIN: StoredChain = {
  format: 'article',
  botName: '',
  meetingSchedule: '',
  messages: [],
};

// ─── Storage ──────────────────────────────────────────────────────────────────

function chainKey(projectId: string) { return `chatbot_chain_${projectId}`; }

function loadChain(projectId: string): StoredChain | null {
  return readLegacyObjectWithProjectFallback<StoredChain>(chainKey(projectId), projectId);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lineCount(text: string): number {
  return text.trim() === '' ? 0 : text.split('\n').length;
}

function formatDayDelay(d: number): string {
  if (d === 0) return 'Отправить сразу при подписке';
  return `Отправить через ${d} ${d === 1 ? 'день' : d < 5 ? 'дня' : 'дней'}`;
}

function buildFullText(messages: ChainMessage[]): string {
  const parts = [1, 2, 3] as const;
  return parts.map(part => {
    const label = PART_LABELS[part];
    const partMsgs = messages.filter(m => m.part === part);
    const body = partMsgs.map(m => {
      const text = m.editedContent || m.content;
      return `Сообщение ${m.index} — ${m.role} | День ${m.dayDelay}\n\n${text}`;
    }).join('\n\n---\n\n');
    return `=== ${label} ===\n\n${body}`;
  }).join('\n\n\n');
}

function isChainMessageArray(value: unknown): value is ChainMessage[] {
  return Array.isArray(value) && value.every((item) =>
    typeof item === 'object' &&
    item !== null &&
    typeof (item as ChainMessage).id === 'string' &&
    typeof (item as ChainMessage).content === 'string',
  );
}

function parseMessagesFromText(content: string): ChainMessage[] {
  const chunks = content.split(/\n\n---\n\n/g).map((part) => part.trim()).filter(Boolean);
  return MSG_DEFS.map((def, index) => ({
    id: `db-msg-${def.index}`,
    index: def.index,
    part: def.part,
    role: def.role,
    dayDelay: def.dayDelay,
    content: chunks[index]?.replace(/^Сообщение\s+\d+\s*/i, '').trim() ?? '',
    editedContent: '',
  }));
}

function chainFromDb(item: ContentItem): StoredChain {
  const rawMessages = item.metadata?.messages;
  const messages = isChainMessageArray(rawMessages) ? rawMessages : parseMessagesFromText(item.content);
  return {
    dbId: item.id,
    format: metadataString(item, 'format', 'article') as Format,
    botName: metadataString(item, 'botName', ''),
    meetingSchedule: metadataString(item, 'meetingSchedule', ''),
    messages,
  };
}

function chainMetadata(chain: StoredChain): Record<string, unknown> {
  return {
    format: chain.format,
    botName: chain.botName,
    meetingSchedule: chain.meetingSchedule,
    messages: chain.messages,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChatbotChains() {
  const activeProjectId = useProjectsStore((s) => s.activeProjectId);
  const { openAddModal } = useContentPlanStore();
  const { dbItems, loaded: dbLoaded, saveItem: saveToApi, updateItem: updateInApi } = useContentApi({ projectId: activeProjectId, type: 'CHATBOT_CHAIN' });

  const getSettings = useModelStore((s) => s.getSettings);
  const generationTask = useContentGenerationStore((s) => s.tasks[contentGenerationKey(activeProjectId, 'chatbot-chains')]);
  const startGenerationTask = useContentGenerationStore((s) => s.startTask);
  const finishGenerationTask = useContentGenerationStore((s) => s.finishTask);

  const strat = (useAudienceStore((s) => s.projects[activeProjectId ?? '']?.answers) ?? {}) as StrategyData;
  const hasStrategy = !!(strat.chosenSegment || strat.chosenSubsegment);

  // Phase
  const [phase, setPhase] = useState<Phase>('step1');

  // Step 1 state
  const [format,          setFormat]          = useState<Format>('article');
  const [botName,         setBotName]         = useState('');
  const [meetingSchedule, setMeetingSchedule] = useState('');
  const [customInstruction, setCustomInstruction] = useState('');

  // Step 2 state
  const [chain,      setChain]      = useState<StoredChain>(EMPTY_CHAIN);
  const [activeId,   setActiveId]   = useState<string>('');

  // Unsaved edits per message
  const [editMap, setEditMap] = useState<Record<string, string>>({});
  const [revisingId, setRevisingId] = useState<string | null>(null);

  // ── Persist ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeProjectId || !dbLoaded) return;

    const dbItem = dbItems.find((item) => !isDemoContentText(item));
    const dbChain = dbItem ? chainFromDb(dbItem) : null;
    if (dbChain) {
      setChain(dbChain);
      setActiveId(dbChain.messages[0]?.id ?? '');
      setPhase('step2');
      return;
    }

    const legacy = loadChain(activeProjectId);
    if (legacy && !isDemoContentText(legacy) && !isMigrated(activeProjectId, 'chatbot-chain')) {
      setChain(legacy);
      setActiveId(legacy.messages[0]?.id ?? '');
      setPhase('step2');
      void saveToApi({
        title: `Цепочка бота: ${legacy.botName || 'Telegram'}`,
        content: buildFullText(legacy.messages),
        platform: 'Telegram',
        metadata: chainMetadata(legacy),
      }).then((item) => {
        if (item) setChain((current) => ({ ...current, dbId: item.id }));
      });
      markMigrated(activeProjectId, 'chatbot-chain');
      return;
    }

    setChain(EMPTY_CHAIN);
    setActiveId('');
    setPhase('step1');
  }, [activeProjectId, dbItems, dbLoaded, saveToApi]);

  const updateChain = useCallback((next: StoredChain) => {
    setChain(next);
  }, []);

  useEffect(() => {
    const entries = Object.entries(editMap);
    if (entries.length === 0 || !chain.dbId) return;
    const timer = window.setTimeout(() => {
      const next: StoredChain = {
        ...chain,
        messages: chain.messages.map((message) => (
          editMap[message.id] !== undefined
            ? { ...message, editedContent: editMap[message.id] }
            : message
        )),
      };
      void updateInApi(chain.dbId!, {
        content: buildFullText(next.messages),
        metadata: chainMetadata(next),
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [chain, editMap, updateInApi]);

  // ── Generate ──────────────────────────────────────────────────────────────

  async function handleGenerate() {
    if (!activeProjectId) {
      return;
    }
    startGenerationTask(activeProjectId, 'chatbot-chains', 'Пишу цепочку сообщений', 'Собираю структуру Telegram-воронки');
    setPhase('generating');
    try {
      const settings    = getSettings('chatbot-chains');
      const seg         = strat.chosenSegment ?? strat.chosenSubsegment ?? 'аудитория эксперта';
      const formatLabel = format === 'article' ? 'статью' : 'видео-урок';
      const meet        = meetingSchedule.trim() || 'каждую пятницу в 19:00';
      const bot         = botName.trim() || 'Telegram-бот';
      const workflow    = 'chatbot.chain.generate';
      const inputs      = {
        botName: bot,
        segment: seg,
        leadMagnetFormat: formatLabel,
        meetingSchedule: meet,
        customInstruction: customInstruction.trim() || null,
      };

      const resp = await aiApi.startWorkflow('chatbot.chain.generate', {
        projectId: activeProjectId,
        provider: settings.provider === 'claude' ? 'claude' : 'chatgpt',
        claudeModel: settings.claudeModel,
        inputs,
        idempotencyKey: makeAiIdempotencyKey({ projectId: activeProjectId, workflow, inputs }),
      });

      // Parse 13 messages from response
      const rawLines = resp.content.split(/\n+/);
      const msgTexts: string[] = [];
      let current = '';
      for (const line of rawLines) {
        const match = line.match(/^(\d+)[\.\)]\s*(.*)/);
        if (match) {
          if (current.trim()) msgTexts.push(current.trim());
          current = match[2] ?? '';
        } else {
          current += (current ? '\n' : '') + line;
        }
      }
      if (current.trim()) msgTexts.push(current.trim());

      const messages: ChainMessage[] = MSG_DEFS.map((def, i) => ({
        id:            `gen-${def.index}`,
        index:         def.index,
        part:          def.part,
        role:          def.role,
        dayDelay:      def.dayDelay,
        content:       msgTexts[i] ?? '',
        editedContent: '',
      }));

      const newChain: StoredChain = { format, botName, meetingSchedule, messages };
      updateChain(newChain);
      setActiveId(messages[0]?.id ?? '');
      setEditMap({});
      setPhase('step2');
      const fullText = messages.map((m, i) => `Сообщение ${i + 1}\n${m.content}`).join('\n\n---\n\n');
      void saveToApi({
        title: `Цепочка бота: ${bot}`,
        content: fullText,
        platform: 'Telegram',
        metadata: {
          ...chainMetadata(newChain),
          workflowRunId: resp.workflowRunId,
          workflowStepId: resp.workflowStepId,
          artifactId: resp.artifactId,
          generationId: resp.generationId,
        },
      }).then((item) => {
        if (item) setChain((current) => ({ ...current, dbId: item.id }));
      });
    } catch (err) {
      console.warn('[ChatbotChains] AI error:', err);
      toast.error('AI не сгенерировал цепочку. Шаблонный текст не сохранен, попробуйте еще раз.');
    } finally {
      finishGenerationTask(activeProjectId, 'chatbot-chains');
    }
  }

  function handleNewChain() {
    setFormat('article');
    setBotName('');
    setMeetingSchedule('');
    setPhase('step1');
  }

  // ── Editor helpers ────────────────────────────────────────────────────────

  function getContent(msg: ChainMessage): string {
    return editMap[msg.id] ?? (msg.editedContent || msg.content);
  }

  function setContent(id: string, value: string) {
    setEditMap(prev => ({ ...prev, [id]: value }));
  }

  function handleSave(msg: ChainMessage) {
    const text = editMap[msg.id];
    if (text === undefined) return;
    const next: StoredChain = {
      ...chain,
      messages: chain.messages.map(m =>
        m.id === msg.id ? { ...m, editedContent: text } : m,
      ),
    };
    updateChain(next);
    if (next.dbId) {
      void updateInApi(next.dbId, {
        content: buildFullText(next.messages),
        metadata: chainMetadata(next),
      });
    }
    setEditMap(prev => { const n = { ...prev }; delete n[msg.id]; return n; });
  }

  async function handleAiRevision(msg: ChainMessage, instruction: string): Promise<boolean> {
    if (!activeProjectId) return false;
    setRevisingId(msg.id);
    try {
      const workflow = 'chatbot.chain.edit';
      const inputs = {
        messageIndex: msg.index,
        messageRole: msg.role,
        currentContent: getContent(msg),
        instruction,
      };
      const response = await aiApi.startWorkflow(workflow, {
        projectId: activeProjectId,
        provider: 'chatgpt',
        inputs,
        idempotencyKey: makeAiIdempotencyKey({ projectId: activeProjectId, workflow, inputs }),
      });
      setContent(msg.id, response.content);
      toast.success('Сообщение доработано. Проверьте результат и сохраните.');
      return true;
    } catch (error) {
      console.error('[ChatbotChains] AI revision failed', error);
      toast.error('Не удалось доработать сообщение. Попробуйте ещё раз.');
      return false;
    } finally {
      setRevisingId(null);
    }
  }

  function handleCopyOne(msg: ChainMessage) {
    navigator.clipboard.writeText(getContent(msg)).catch(() => undefined);
  }

  function handleCopyAll() {
    navigator.clipboard.writeText(buildFullText(chain.messages)).catch(() => undefined);
  }

  function handleDownload() {
    const text = buildFullText(chain.messages);
    void exportToDocx('Цепочка Telegram-бота', text, 'telegram-chain');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  // ── Loading ───────────────────────────────────────────────────────────────

  if (phase === 'generating' || generationTask) {
    return (
      <div className={s.root}>
        <div className={s.loadingScreen}>
          <div className={s.loadingSpinner} />
          <p className={s.loadingText}>✉️ {generationTask?.title ?? 'Пишу цепочку сообщений...'}</p>
        </div>
      </div>
    );
  }

  // ── Step 2: chain editor ──────────────────────────────────────────────────

  if (phase === 'step2') {
    const activeMsg = chain.messages.find(m => m.id === activeId) ?? chain.messages[0] ?? null;
    const parts = ([1, 2, 3] as const);

    return (
      <div className={s.root}>
        <div className={s.editorRoot}>

          {/* Left panel */}
          <div className={s.leftPanel}>
            <div className={s.leftTop}>
              <div className={s.leftTopTitle}>13 сообщений</div>
              <div className={s.leftTopActions}>
                <button className={s.topActionBtn} onClick={handleCopyAll}>
                  📋 Копировать
                </button>
                <button className={s.topActionBtn} onClick={() => openAddModal({ type: 'chatbot', title: chain.format === 'article' ? 'Цепочка бота (статья)' : 'Цепочка бота (видео)', platform: 'Telegram', projectId: activeProjectId ?? undefined, content: buildFullText(chain.messages) })}>
                  📅 В план
                </button>
                <button className={s.topActionBtn} onClick={handleDownload}>
                  💾 .docx
                </button>
                <button className={s.newChainBtn} onClick={handleNewChain}>
                  + Новая
                </button>
              </div>
            </div>

            <div className={s.leftScroll}>
              {parts.map(part => (
                <div key={part}>
                  <div className={s.groupHeader}>{PART_LABELS[part]}</div>
                  {chain.messages
                    .filter(m => m.part === part)
                    .map(msg => (
                      <button
                        key={msg.id}
                        className={`${s.msgItem}${msg.id === activeId ? ' ' + s.msgItemActive : ''}`}
                        onClick={() => setActiveId(msg.id)}
                      >
                        <span className={s.msgNum}>{msg.index}</span>
                        <span className={s.msgRole}>{msg.role}</span>
                      </button>
                    ))
                  }
                </div>
              ))}
            </div>
          </div>

          {/* Right panel */}
          <div className={s.rightPanel}>
            {!activeMsg ? (
              <div className={s.emptyRight}>
                <span className={s.emptyIcon}>✉️</span>
                <span>Выберите сообщение слева</span>
              </div>
            ) : (
              <MessageEditor
                key={activeMsg.id}
                msg={activeMsg}
                content={getContent(activeMsg)}
                hasUnsaved={editMap[activeMsg.id] !== undefined}
                onChange={v => setContent(activeMsg.id, v)}
                onSave={() => handleSave(activeMsg)}
                onCopy={() => handleCopyOne(activeMsg)}
                projectId={activeProjectId}
                isRevising={revisingId === activeMsg.id}
                onRevise={(instruction) => handleAiRevision(activeMsg, instruction)}
              />
            )}
          </div>

        </div>
      </div>
    );
  }

  // ── Step 1 ────────────────────────────────────────────────────────────────

  return (
    <div className={s.root}>
      <div className={s.page}>

        <div className={s.stepper}>
          <div className={s.stepItem}>
            <div className={`${s.stepDot} ${s.stepDotActive}`}>1</div>
            <span className={`${s.stepLabel} ${s.stepLabelActive}`}>Настройка</span>
          </div>
          <div className={s.stepLine} />
          <div className={s.stepItem}>
            <div className={s.stepDot}>2</div>
            <span className={s.stepLabel}>Готовая цепочка</span>
          </div>
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 24 }}>
          Настройка цепочки сообщений
        </h2>

        {/* Strategy badges */}
        {hasStrategy ? (
          <div className={s.strategyBanner}>
            <span className={s.strategyLabel}>Из стратегии:</span>
            {strat.chosenSegment    && <span className={s.badge}>{strat.chosenSegment.split('\n')[0]?.slice(0, 60)}</span>}
            {strat.chosenSubsegment && <span className={s.badge}>{strat.chosenSubsegment.split('\n')[0]?.slice(0, 60)}</span>}
          </div>
        ) : (
          <div className={s.warnBanner}>
            <span>⚠️</span>
            <span>
              Сначала пройдите <NavLink to="/strategy" className={s.warnLink}>Стратегию</NavLink> — это улучшит тексты сообщений
            </span>
          </div>
        )}

        {/* Format */}
        <div className={s.section}>
          <div className={s.sectionTitle}>Формат лид-магнита</div>
          <div className={s.chipGroup}>
            <button
              className={`${s.chip}${format === 'article' ? ' ' + s.chipActive : ''}`}
              onClick={() => setFormat('article')}
            >
              📄 Текстовая статья
            </button>
            <button
              className={`${s.chip}${format === 'video' ? ' ' + s.chipActive : ''}`}
              onClick={() => setFormat('video')}
            >
              🎬 Видео-урок
            </button>
          </div>
        </div>

        {/* Funnel structure */}
        <div className={s.section}>
          <div className={s.sectionTitle}>Структура воронки</div>
          <div className={s.sectionSub}>13 сообщений, разбитых на три смысловых блока</div>
          <div className={s.funnelBlocks}>
            <div className={s.funnelBlock}>
              <span className={s.funnelIcon}>📨</span>
              <div className={s.funnelBody}>
                <div className={s.funnelBlockTitle}>Сообщения 1–5 — Лид-магнит</div>
                <div className={s.funnelBlockDesc}>
                  Продают прочитать {format === 'article' ? 'статью' : 'видео-урок'}: приветствие, боль, инсайт, история клиента, дожим
                </div>
              </div>
            </div>
            <div className={s.funnelBlock}>
              <span className={s.funnelIcon}>📨</span>
              <div className={s.funnelBody}>
                <div className={s.funnelBlockTitle}>Сообщения 6–10 — Мини-продукт</div>
                <div className={s.funnelBlockDesc}>
                  Продают интенсив или диагностику: переход, проблема глубже, продукт, возражение, призыв
                </div>
              </div>
            </div>
            <div className={s.funnelBlock}>
              <span className={s.funnelIcon}>📨</span>
              <div className={s.funnelBody}>
                <div className={s.funnelBlockTitle}>Сообщения 11–13 — Еженедельная встреча</div>
                <div className={s.funnelBlockDesc}>
                  Продают участие в живых разборах: анонс, ценность, последний шанс
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Optional fields */}
        <div className={s.section}>
          <div className={s.sectionTitle}>Детали (опционально)</div>
          <div className={s.inputGroup}>
            <div>
              <div className={s.inputLabel}>Название вашего бота или канала</div>
              <input
                className={s.textInput}
                placeholder="Например: @psyholog_bot или Психолог Анна"
                value={botName}
                onChange={e => setBotName(e.target.value)}
              />
            </div>
            <div>
              <div className={s.inputLabel}>Дата еженедельной встречи</div>
              <input
                className={s.textInput}
                placeholder="Например: каждую пятницу в 19:00 МСК"
                value={meetingSchedule}
                onChange={e => setMeetingSchedule(e.target.value)}
              />
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <div className={s.inputLabel}>Свободная инструкция и фактура</div>
            <VoiceComposer
              value={customInstruction}
              onChange={setCustomInstruction}
              placeholder="Наговорите особенности воронки, примеры, ограничения или тон сообщений..."
              textareaClassName={s.editorTextarea}
              rows={4}
            />
          </div>
        </div>

        <div className={s.btnRow}>
          {chain.dbId && (
            <button
              className={s.primaryBtn}
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1.5px solid var(--border)' }}
              onClick={() => setPhase('step2')}
            >
              ← К текущей цепочке
            </button>
          )}
          <button className={s.primaryBtn} onClick={() => void handleGenerate()}>
            Сгенерировать все 13 сообщений
            <AiWorkflowCost workflow="chatbot.chain.generate" projectId={activeProjectId} />
            {' →'}
          </button>
        </div>
        <ModelBar section="chatbot-chains" />

      </div>
    </div>
  );
}

// ─── MessageEditor ────────────────────────────────────────────────────────────

interface MessageEditorProps {
  msg:         ChainMessage;
  content:     string;
  hasUnsaved:  boolean;
  onChange:    (v: string) => void;
  onSave:      () => void;
  onCopy:      () => void;
  projectId?: string | null;
  isRevising: boolean;
  onRevise: (instruction: string) => Promise<boolean>;
}

function MessageEditor({ msg, content, hasUnsaved, onChange, onSave, onCopy, projectId, isRevising, onRevise }: MessageEditorProps) {
  const lines = lineCount(content);
  const inTarget = lines >= 3 && lines <= 7;
  const overLimit = lines > 7;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className={s.editorHeader}>
        <div className={s.editorTitle}>
          Сообщение {msg.index} — {msg.role}
        </div>
        <div className={s.editorDelay}>{formatDayDelay(msg.dayDelay)}</div>
      </div>

      <div className={s.editorBody}>
        <textarea
          className={s.editorTextarea}
          value={content}
          onChange={e => onChange(e.target.value)}
          placeholder="Текст сообщения..."
        />
        <div className={s.lineCounter}>
          <span
            className={
              lines === 0 ? '' :
              inTarget    ? s.lineCountGood :
              overLimit   ? s.lineCountWarn : ''
            }
          >
            {lines} строк
          </span>
          <span>· цель: 3–7 строк</span>
        </div>
      </div>

      <div className={s.editorFooter}>
        <button className={s.actionBtn} onClick={onCopy}>
          📋 Копировать
        </button>
        <button
          className={`${s.actionBtn}${hasUnsaved ? ' ' + s.actionBtnPrimary : ''}`}
          onClick={onSave}
          disabled={!hasUnsaved}
        >
          💾 Сохранить
        </button>
      </div>
      <ContentRevisionComposer
        projectId={projectId}
        workflow="chatbot.chain.edit"
        isLoading={isRevising}
        onSubmit={onRevise}
        placeholder="Например: сделайте сообщение теплее, добавьте мой пример и сократите призыв"
      />
    </div>
  );
}
