import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useProgressStore } from '../../store/progress.store';
import { useProjectsStore } from '../../store/projects.store';
import { useUnpackingStore } from '../../store/unpacking.store';
import { aiApi } from '../../api/ai';
import FormattedText from '../../components/FormattedText/FormattedText';
import { MessageActions, MessageInput } from '../../components/MessageInput/MessageInput';
import { useModelStore } from '../../store/model.store';

// ─── Fallback replies ─────────────────────────────────────────────────────────

const FALLBACK_REPLIES = [
  'Интересно! Уточните — с какими конкретными проблемами приходят ваши клиенты?',
  'Понял. А какой результат получают клиенты после работы с вами? Конкретный, измеримый.',
  'Отлично. Теперь про аудиторию — это больше женщины или мужчины? Какой возраст, жизненная ситуация?',
  'Хорошо. Как вы сейчас продвигаетесь? Какие каналы используете?',
  'Почти готово. Назовите 3 главных преимущества работы именно с вами.',
  'Отлично! У меня достаточно информации чтобы сформировать вашу стратегию. Нажмите кнопку ниже чтобы завершить распаковку.',
];

const WELCOME_MSG =
  'Привет! Я ваш AI-маркетолог.\nЧтобы создать стратегию продвижения, мне нужно познакомиться с вашей практикой.\n\nРасскажите о себе: кто вы, чем занимаетесь, кому помогаете и какой результат получают ваши клиенты. Можете писать в свободной форме — я задам уточняющие вопросы.';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMsg {
  role: 'ai' | 'user';
  text: string;
  time: string;
  file?: { name: string; size: string };
}

function nowTime(): string {
  const d = new Date();
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function FileIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Unpacking() {
  const navigate          = useNavigate();
  const completeUnpacking = useProgressStore((s) => s.completeUnpacking);
  const activeProjectId   = useProjectsStore((s) => s.activeProjectId) ?? '';
  const projectName       = useProjectsStore((s) => s.projects.find((p) => p.id === s.activeProjectId)?.name ?? '');
  const getSettings       = useModelStore((s) => s.getSettings);

  const switchProject  = useUnpackingStore((s) => s.switchProject);
  const loadFromDb     = useUnpackingStore((s) => s.loadFromDb);
  const storeMessages  = useUnpackingStore((s) => s.messages);
  const setStoreMessages = useUnpackingStore((s) => s.setMessages);

  const [messages,     setMessagesState] = useState<ChatMsg[]>(() => {
    const stored = storeMessages as ChatMsg[];
    return stored.length > 0 ? stored : [{ role: 'ai', text: WELCOME_MSG, time: '' }];
  });
  const [inputText,    setInputText]    = useState('');
  const [sending,      setSending]      = useState(false);
  const [fallbackIdx,  setFallbackIdx]  = useState(0);
  const [userMsgCount, setUserMsgCount] = useState(0);
  const [aiSuggestedFinish, setAiSuggestedFinish] = useState(false);

  async function runUnpackingWorkflow(message: string, history: ChatMsg[] = []): Promise<string> {
    if (!activeProjectId) {
      throw new Error('Сначала выберите проект');
    }
    const formattedHistory = history
      .filter((m) => m.text)
      .map((m) => `${m.role === 'ai' ? 'assistant' : 'user'}: ${m.text}`)
      .join('\n');
    const settings = getSettings('unpacking');
    const resp = await aiApi.startWorkflow('strategy.positioning.generate', {
      projectId: activeProjectId,
      provider: settings.provider,
      openaiModel: settings.openaiModel,
      claudeModel: settings.claudeModel,
      inputs: {
        prompt: [
          `Проект: ${projectName || 'Проект'}`,
          formattedHistory ? `История диалога:\n${formattedHistory}` : '',
          `Сообщение пользователя:\n${message}`,
          'Ответь как AI-маркетолог в разделе “О себе”: задай точный уточняющий вопрос или помоги структурировать информацию об эксперте. Если информации достаточно, предложи завершить распаковку.',
        ].filter(Boolean).join('\n\n'),
      },
    });
    return resp.content;
  }

  // Switch project and restore messages (local first, then DB fallback)
  useEffect(() => {
    if (!activeProjectId) return;
    switchProject(activeProjectId);
    void loadFromDb(activeProjectId);
  }, [activeProjectId, switchProject, loadFromDb]);

  useEffect(() => {
    const stored = storeMessages as ChatMsg[];
    if (stored.length > 0) {
      setMessagesState(stored);
      setUserMsgCount(stored.filter((m) => m.role === 'user').length);
    }
  }, [activeProjectId]); // eslint-disable-line

  function setMessages(msgs: ChatMsg[] | ((prev: ChatMsg[]) => ChatMsg[])) {
    setMessagesState((prev) => {
      const next = typeof msgs === 'function' ? msgs(prev) : msgs;
      setStoreMessages(next as import('../../store/unpacking.store').UnpackingMessage[]);
      return next;
    });
  }

  const chatEndRef   = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  // ── Send text message ──────────────────────────────────────────────────────

  async function handleSend() {
    const text = inputText.trim();
    if (!text || sending) return;

    setInputText('');
    setSending(true);

    const userMsg: ChatMsg = { role: 'user', text, time: nowTime() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    const newCount = userMsgCount + 1;
    setUserMsgCount(newCount);

    try {
      const content = await runUnpackingWorkflow(text, newMessages.slice(0, -1));

      const aiMsg: ChatMsg = { role: 'ai', text: content, time: nowTime() };
      setMessages((prev) => [...prev, aiMsg]);
      const finishKeywords = ['нажмите кнопку', 'завершить распаковку', 'перейти к стратегии', 'перейти к целевой', 'достаточно информации', 'готов сформировать'];
      if (finishKeywords.some((kw) => content.toLowerCase().includes(kw))) {
        setAiSuggestedFinish(true);
      }
    } catch (err) {
      console.warn('[Unpacking] AI error, using fallback:', err);
      const replyText = FALLBACK_REPLIES[Math.min(fallbackIdx, FALLBACK_REPLIES.length - 1)];
      setFallbackIdx((i) => Math.min(i + 1, FALLBACK_REPLIES.length - 1));
      const aiMsg: ChatMsg = { role: 'ai', text: replyText, time: nowTime() };
      setMessages((prev) => [...prev, aiMsg]);
      toast('AI временно недоступен', { icon: '⚠️', duration: 2500 });
    } finally {
      setSending(false);
    }
  }

  // ── File upload ────────────────────────────────────────────────────────────

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setSending(true);

    const fileMsg: ChatMsg = {
      role: 'user',
      text: '',
      time: nowTime(),
      file: { name: file.name, size: formatBytes(file.size) },
    };
    setMessages((prev) => [...prev, fileMsg]);
    setUserMsgCount((c) => c + 1);

    try {
      const content = await runUnpackingWorkflow(
        `Пользователь загрузил файл «${file.name}» (${formatBytes(file.size)}). Учти его при формировании стратегии.`,
      );
      const aiMsg: ChatMsg = { role: 'ai', text: content, time: nowTime() };
      setMessages((prev) => [...prev, aiMsg]);
      const finishKeywords = ['нажмите кнопку', 'завершить распаковку', 'перейти к стратегии', 'перейти к целевой', 'достаточно информации', 'готов сформировать'];
      if (finishKeywords.some((kw) => content.toLowerCase().includes(kw))) {
        setAiSuggestedFinish(true);
      }
    } catch {
      const aiMsg: ChatMsg = {
        role: 'ai',
        text: `Получил файл «${file.name}». Изучу и учту при формировании стратегии.`,
        time: nowTime(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } finally {
      setSending(false);
    }
  }

  // ── Finish unpacking ───────────────────────────────────────────────────────

  function handleFinish() {
    completeUnpacking();
    toast.success('Распаковка завершена! 🎉');
    navigate('/dashboard');
  }

  const canFinish = aiSuggestedFinish;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100% + 48px)',
      margin: '-24px',
      backgroundColor: '#fff',
      overflow: 'hidden',
    }}>

      {/* Header */}
      <div style={{
        padding: '20px 28px 16px',
        borderBottom: '1px solid #F0EEE8',
        flexShrink: 0,
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#1a1a1a', margin: '0 0 4px' }}>
          Распаковка
        </h1>
        <p style={{ fontSize: 13, color: '#888', margin: 0 }}>
          Расскажите AI-маркетологу о своей практике
        </p>
      </div>

      {/* Chat area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px 28px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        maxWidth: 860,
        width: '100%',
        margin: '0 auto',
        boxSizing: 'border-box',
      }}>
        {messages.map((msg, idx) => (
          <div key={idx} style={{
            display: 'flex',
            flexDirection: msg.role === 'ai' ? 'row' : 'row-reverse',
            alignItems: 'flex-end',
            gap: 10,
          }}>
            {msg.role === 'ai' && (
              <div style={{
                width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                backgroundColor: '#D4A847',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, color: '#fff',
              }}>
                AI
              </div>
            )}

            <div style={{
              maxWidth: '72%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: msg.role === 'ai' ? 'flex-start' : 'flex-end',
              gap: 4,
            }}>
              <div style={{
                padding: '12px 16px',
                borderRadius: msg.role === 'ai' ? '12px 12px 12px 0' : '12px 12px 0 12px',
                backgroundColor: msg.role === 'ai' ? '#F5F4F0' : '#1a1a1a',
                color: msg.role === 'ai' ? '#1a1a1a' : '#fff',
                fontSize: 14,
                lineHeight: 1.6,
              }}>
                {msg.file ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 8,
                      backgroundColor: 'rgba(255,255,255,0.15)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <FileIcon />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{msg.file.name}</div>
                      <div style={{ fontSize: 11, opacity: 0.6 }}>{msg.file.size}</div>
                    </div>
                  </div>
                ) : msg.role === 'ai' ? (
                  <FormattedText compact>{msg.text}</FormattedText>
                ) : (
                  <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>
                )}
              </div>
              {msg.time && (
                <div style={{ fontSize: 11, color: '#aaa' }}>{msg.time}</div>
              )}
              {msg.role === 'ai' && !msg.file && <MessageActions content={msg.text} compact />}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {sending && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
              backgroundColor: '#D4A847',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700, color: '#fff',
            }}>
              AI
            </div>
            <div style={{
              padding: '14px 18px',
              borderRadius: '12px 12px 12px 0',
              backgroundColor: '#F5F4F0',
              display: 'flex', gap: 5, alignItems: 'center',
            }}>
              {[0, 1, 2].map((i) => (
                <span key={i} style={{
                  width: 7, height: 7, borderRadius: '50%', backgroundColor: '#D4A847',
                  animation: `unpack-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                }} />
              ))}
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input panel */}
      <div style={{
        flexShrink: 0,
        borderTop: '1px solid #E5E3DC',
        backgroundColor: '#fff',
        padding: '16px 28px',
      }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>

          {canFinish && (
            <button
              onClick={handleFinish}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: 10,
                border: 'none',
                backgroundColor: '#D4A847',
                color: '#fff',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
                marginBottom: 14,
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.88'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
            >
              Завершить распаковку и создать стратегию →
            </button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: '1px dashed #D3D1C7',
                backgroundColor: 'transparent',
                color: '#888',
                fontSize: 13,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              + Прикрепить файл
            </button>
            <span style={{ fontSize: 12, color: '#aaa' }}>
              PDF, DOCX, TXT — резюме, кейсы, описание практики
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt"
              style={{ display: 'none' }}
              onChange={(e) => void handleFileChange(e)}
            />
          </div>

          <div>
            <MessageInput
              value={inputText}
              onChange={setInputText}
              onSend={() => void handleSend()}
              isLoading={sending}
              section="unpacking"
              placeholder="Напишите о своей практике..."
            />
          </div>

          <div style={{ fontSize: 11, color: '#bbb', marginTop: 8, textAlign: 'right' }}>
            Enter — отправить · Shift+Enter — перенос строки
          </div>
        </div>
      </div>

      <style>{`
        @keyframes unpack-pulse {
          0%, 60%, 100% { opacity: 0.3; transform: scale(0.85); }
          30%            { opacity: 1;   transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}
