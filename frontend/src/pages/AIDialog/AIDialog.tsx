import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { aiApi, AiActionQuote, ConversationMessage } from '../../api/ai';
import FormattedText from '../../components/FormattedText/FormattedText';
import { MessageActions, MessageInput } from '../../components/MessageInput/MessageInput';
import { useContentApi } from '../../hooks/useContentApi';
import { useProjectsStore } from '../../store/projects.store';
import { isMigrated, markMigrated, readLegacyItemsWithProjectFallback } from '../../utils/generatedContentPersistence';
import { makeAiIdempotencyKey } from '../../utils/aiIdempotency';
import s from './AIDialog.module.css';

interface DialogMessage {
  role: 'assistant' | 'user';
  content: string;
  time: string;
}

type DialogMode = 'auto' | 'quick' | 'deep' | 'strategy';

function nowTime(): string {
  const d = new Date();
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function storageKey(projectId: string): string {
  return `ai_dialog_${projectId || 'no-project'}`;
}

const suggestions = [
  'Что мне сейчас сделать следующим шагом?',
  'Посмотри на мой проект и найди слабые места',
  'Какую воронку мне лучше собрать?',
  'Что улучшить в контент-плане?',
];

export default function AIDialog() {
  const activeProjectId = useProjectsStore((st) => st.activeProjectId);
  const projectName = useProjectsStore((st) => st.projects.find((p) => p.id === st.activeProjectId)?.name ?? 'Проект');
  const { dbItems, loaded: dbLoaded, saveItem: saveDialog, updateItem: updateDialog } = useContentApi({ projectId: activeProjectId, type: 'OTHER' });

  const welcome = useMemo<DialogMessage>(() => ({
    role: 'assistant',
    content: `Привет! Я AI-маркетолог LumaIQ и знаю текущий контекст проекта «${projectName}»: стратегию, продукты, контент и план публикаций.\n\nМожете спросить меня, что делать дальше, где слабое место в упаковке, какую воронку собрать или как улучшить конкретный материал.`,
    time: '',
  }), [projectName]);

  const [messages, setMessages] = useState<DialogMessage[]>([welcome]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>('auto');
  const [quote, setQuote] = useState<AiActionQuote | null>(null);
  const [dialogRecordId, setDialogRecordId] = useState<string | null>(null);
  const dialogRecordIdRef = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeProjectId || !dbLoaded) return;

    const dbDialog = dbItems.find((item) => item.metadata?.kind === 'ai_dialog');
    if (dbDialog) {
      try {
        const parsed = JSON.parse(dbDialog.content) as DialogMessage[];
        setMessages(parsed.length ? parsed : [welcome]);
      } catch {
        setMessages([welcome]);
      }
      setDialogRecordId(dbDialog.id);
      dialogRecordIdRef.current = dbDialog.id;
      return;
    }

    const legacy = readLegacyItemsWithProjectFallback<DialogMessage>(storageKey(activeProjectId), activeProjectId);
    if (legacy.length > 0 && !isMigrated(activeProjectId, 'ai-dialog')) {
      setMessages(legacy);
      void saveDialog({
        title: 'AI диалог',
        content: JSON.stringify(legacy),
        platform: 'LumaIQ',
        metadata: { kind: 'ai_dialog' },
      }).then((item) => {
        if (!item) return;
        setDialogRecordId(item.id);
        dialogRecordIdRef.current = item.id;
      });
      markMigrated(activeProjectId, 'ai-dialog');
      return;
    }

    setDialogRecordId(null);
    dialogRecordIdRef.current = null;
    setMessages([welcome]);
  }, [activeProjectId, dbItems, dbLoaded, saveDialog, welcome]);

  async function persistMessages(nextMessages: DialogMessage[]) {
    if (!activeProjectId) return;
    const content = JSON.stringify(nextMessages);
    const recordId = dialogRecordIdRef.current ?? dialogRecordId;
    if (recordId) {
      void updateDialog(recordId, { content, metadata: { kind: 'ai_dialog' } });
      return;
    }
    const item = await saveDialog({
      title: 'AI диалог',
      content,
      platform: 'LumaIQ',
      metadata: { kind: 'ai_dialog' },
    });
    if (item) {
      setDialogRecordId(item.id);
      dialogRecordIdRef.current = item.id;
    }
  }

  useEffect(() => {
    if (!activeProjectId || !dbLoaded) {
      setMessages([welcome]);
      return;
    }
  }, [activeProjectId, dbLoaded, welcome]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  useEffect(() => {
    const text = input.trim();
    if (!activeProjectId || !text) {
      setQuote(null);
      return;
    }
    let current = true;
    const timer = window.setTimeout(() => {
      void aiApi.quoteWorkflow('ai.dialog.message', {
        projectId: activeProjectId,
        inputs: { message: text, dialogMode },
      }).then((nextQuote) => {
        if (current) setQuote(nextQuote);
      }).catch(() => {
        if (current) setQuote(null);
      });
    }, 350);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [activeProjectId, dialogMode, input]);

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || sending) return;
    if (!activeProjectId) {
      toast.error('Сначала создайте или выберите проект');
      return;
    }

    setInput('');
    setSending(true);
    const userMsg: DialogMessage = { role: 'user', content: text, time: nowTime() };
    const next = [...messages, userMsg];
    setMessages(next);
    void persistMessages(next);

    try {
      const history: ConversationMessage[] = next.slice(-16, -1).map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }));
      const workflow = 'ai.dialog.message';
      const inputs = {
        message: text,
        history,
        projectName,
        dialogMode,
      };
      const confirmedQuote = await aiApi.quoteWorkflow(workflow, {
        projectId: activeProjectId,
        inputs,
      });
      const response = await aiApi.startWorkflow('ai.dialog.message', {
        projectId: activeProjectId,
        inputs,
        idempotencyKey: makeAiIdempotencyKey({ projectId: activeProjectId, workflow, inputs }),
      });
      if (response.aiPointsCharged !== undefined) {
        toast.success(`Списано ${response.aiPointsCharged} AI-баллов. Стоимость до запуска: ${confirmedQuote.aiPoints}.`);
      }
      setMessages((prev) => {
        const withAnswer = [...prev, { role: 'assistant' as const, content: response.content, time: nowTime() }];
        void persistMessages(withAnswer);
        return withAnswer;
      });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg ?? 'AI временно недоступен');
      setMessages((prev) => {
        const withError = [...prev, {
          role: 'assistant' as const,
          content: 'Не смог ответить из-за ошибки соединения. Попробуйте еще раз чуть позже.',
          time: nowTime(),
        }];
        void persistMessages(withError);
        return withError;
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={s.root}>
      <header className={s.header}>
        <h1 className={s.title}>Диалог с ИИ</h1>
        <p className={s.subtitle}>Постоянный AI-маркетолог по текущему проекту, запуску и воронке</p>
      </header>

      <div className={s.chat}>
        <div className={s.chatInner}>
          {messages.map((message, index) => (
            <div
              key={`${message.time}-${index}`}
              className={`${s.messageRow}${message.role === 'user' ? ' ' + s.messageRowUser : ''}`}
            >
              {message.role === 'assistant' && <div className={s.avatar}>AI</div>}
              <div className={s.bubbleWrap}>
                <div className={s.bubble}>
                  {message.role === 'assistant'
                    ? <FormattedText compact>{message.content}</FormattedText>
                    : message.content}
                </div>
                {message.role === 'assistant' && <MessageActions content={message.content} compact />}
                {message.time && <div className={s.time}>{message.time}</div>}
              </div>
            </div>
          ))}

          {messages.length <= 1 && (
            <div className={s.suggestions}>
              {suggestions.map((item) => (
                <button key={item} className={s.suggestion} onClick={() => void send(item)}>
                  {item}
                </button>
              ))}
            </div>
          )}

          {sending && (
            <div className={s.messageRow}>
              <div className={s.avatar}>AI</div>
              <div className={s.typing}>
                <span className={s.dot} />
                <span className={s.dot} />
                <span className={s.dot} />
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div className={s.inputPanel}>
        <div className={s.inputInner}>
          <div className={s.modeRow}>
            <div className={s.modeControl} aria-label="Режим AI-диалога">
              {([
                ['auto', 'Авто'],
                ['quick', 'Быстро'],
                ['deep', 'Глубоко'],
                ['strategy', 'Стратегия'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`${s.modeButton}${dialogMode === value ? ` ${s.modeButtonActive}` : ''}`}
                  onClick={() => setDialogMode(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className={s.quote}>
              {quote ? `${quote.actionLabel}: ${quote.aiPoints} AI-баллов` : 'Стоимость появится после ввода запроса'}
            </span>
          </div>
          <MessageInput
            value={input}
            onChange={setInput}
            onSend={() => void send()}
            isLoading={sending}
            section="ai-dialog"
            hideModelControls
            placeholder="Спросите про стратегию, запуск, контент, продукт или следующий шаг..."
          />
        </div>
        <div className={s.hint}>Enter — отправить · Shift+Enter — перенос строки</div>
      </div>
    </div>
  );
}
