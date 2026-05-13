import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { aiApi, ConversationMessage } from '../../api/ai';
import { useModelStore } from '../../store/model.store';
import { useProjectsStore } from '../../store/projects.store';
import FormattedText from '../../components/FormattedText/FormattedText';
import s from './AIDialog.module.css';

interface DialogMessage {
  role: 'assistant' | 'user';
  content: string;
  time: string;
}

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
  const getSettings = useModelStore((st) => st.getSettings);

  const welcome = useMemo<DialogMessage>(() => ({
    role: 'assistant',
    content: `Привет! Я AI-маркетолог LumaIQ и знаю текущий контекст проекта «${projectName}»: стратегию, продукты, контент и план публикаций.\n\nМожете спросить меня, что делать дальше, где слабое место в упаковке, какую воронку собрать или как улучшить конкретный материал.`,
    time: '',
  }), [projectName]);

  const [messages, setMessages] = useState<DialogMessage[]>([welcome]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const raw = localStorage.getItem(storageKey(activeProjectId));
    if (!raw) {
      setMessages([welcome]);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as DialogMessage[];
      setMessages(parsed.length ? parsed : [welcome]);
    } catch {
      setMessages([welcome]);
    }
  }, [activeProjectId, welcome]);

  useEffect(() => {
    if (!activeProjectId) return;
    localStorage.setItem(storageKey(activeProjectId), JSON.stringify(messages));
  }, [activeProjectId, messages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

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

    try {
      const history: ConversationMessage[] = next.slice(-16, -1).map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }));
      const settings = getSettings('unpacking');
      const response = await aiApi.chat({
        model: settings.provider === 'claude' ? 'claude' : 'chatgpt',
        claudeModel: settings.claudeModel,
        section: 'ai-dialog',
        projectId: activeProjectId,
        projectName,
        message: text,
        conversationHistory: history,
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: response.content, time: nowTime() }]);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg ?? 'AI временно недоступен');
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: 'Не смог ответить из-за ошибки соединения. Попробуйте еще раз чуть позже.',
        time: nowTime(),
      }]);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className={s.root}>
      <header className={s.header}>
        <div>
          <h1 className={s.title}>Диалог с ИИ</h1>
          <p className={s.subtitle}>Постоянный AI-маркетолог по текущему проекту, запуску и воронке</p>
        </div>
        <div className={s.contextPill}>{projectName}</div>
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
          <textarea
            ref={textareaRef}
            className={s.textarea}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={sending}
            rows={3}
            placeholder="Спросите про стратегию, запуск, контент, продукт или следующий шаг..."
          />
          <button className={s.sendBtn} onClick={() => void send()} disabled={!input.trim() || sending}>
            Отправить
          </button>
        </div>
        <div className={s.hint}>Enter — отправить · Shift+Enter — перенос строки</div>
      </div>
    </div>
  );
}
