import { useState, useRef, useEffect, KeyboardEvent, ChangeEvent } from 'react';
import s from './Chat.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type Model = 'chatgpt' | 'claude';

interface Message {
  id: string;
  role: 'user' | 'ai';
  text: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const JTBD_STEPS = [
  '1. Сегмент ЦА',
  '2. Боли',
  '3. JTBD-работы',
  '4. УТП',
  '5. Оффер',
  '6. Контент',
];

const INITIAL_AI_MSG =
  'Привет! Я помогу упаковать ваши услуги по JTBD-фреймворку.\n' +
  'Для начала — опишите вашего идеального клиента: кто он, какая у него ситуация, что его беспокоит прямо сейчас?';

function getMockReply(userMsgCount: number): string {
  if (userMsgCount === 1) {
    return 'Отлично! Теперь углубимся в боли вашего клиента. Что он уже пробовал решить эту проблему? Почему не помогло?';
  }
  if (userMsgCount === 2) {
    return 'Хорошо. Формирую JTBD-формулу на основе ваших данных:\n«Когда я [ситуация] → я хочу найти специалиста → который поможет [результат] без [страх]»';
  }
  return 'Понял, продолжаем. Расскажите подробнее — это поможет точнее упаковать ваши услуги.';
}

function uid() {
  return Math.random().toString(36).slice(2);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Chat() {
  const [active, setActive] = useState(false);
  const [model, setModel] = useState<Model>('chatgpt');
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [input, setInput] = useState('');
  const [userMsgCount, setUserMsgCount] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom on new content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  }, [input]);

  function startChat() {
    setActive(true);
    setMessages([{ id: uid(), role: 'ai', text: INITIAL_AI_MSG }]);
    setCurrentStep(0);
    setUserMsgCount(0);
  }

  function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isTyping) return;

    const newCount = userMsgCount + 1;
    setMessages((prev) => [...prev, { id: uid(), role: 'user', text: trimmed }]);
    setUserMsgCount(newCount);
    setInput('');
    setIsTyping(true);

    setTimeout(() => {
      setMessages((prev) => [...prev, { id: uid(), role: 'ai', text: getMockReply(newCount) }]);
      setIsTyping(false);
      setCurrentStep((prev) => Math.min(prev + 1, JTBD_STEPS.length - 1));
    }, 1500);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  function handleCopy(text: string, id: string) {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }

  function handleNextStep() {
    sendMessage('Переходим к следующему шагу');
  }

  function handleRewrite(msgId: string, count: number) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, id: uid(), text: getMockReply(count) } : m
      )
    );
  }

  // ── Placeholder ─────────────────────────────────────────────────────────────

  if (!active) {
    return (
      <div className={s.root}>
        <div className={s.placeholder}>
          <div className={s.icon}>💬</div>
          <h2 className={s.title}>Чат-упаковка по JTBD</h2>
          <p className={s.desc}>
            Диалоговый интерфейс для выявления Jobs To Be Done ваших клиентов.
            Задайте вопросы и получите структурированный портрет потребителя.
          </p>
          <button className={s.btn} onClick={startChat}>
            Начать новый диалог
          </button>
        </div>
      </div>
    );
  }

  // ── Active chat ──────────────────────────────────────────────────────────────

  return (
    <div className={s.chat}>

      {/* ── Header: model chips + settings ── */}
      <div className={s.header}>
        <div className={s.modelRow}>
          {(['chatgpt', 'claude'] as Model[]).map((m) => (
            <button
              key={m}
              className={`${s.modelChip} ${model === m ? s.modelActive : ''}`}
              onClick={() => setModel(m)}
            >
              {m === 'chatgpt' ? 'ChatGPT' : 'Claude'}
            </button>
          ))}
        </div>
        <div className={s.settingsRow}>
          <span className={s.settingChip}>Тон: Нейтральный</span>
          <span className={s.settingChip}>Длина: Средняя</span>
        </div>
      </div>

      {/* ── JTBD step chips ── */}
      <div className={s.steps}>
        {JTBD_STEPS.map((step, i) => (
          <div
            key={step}
            className={[
              s.stepChip,
              i === currentStep ? s.stepActive : '',
              i < currentStep ? s.stepDone : '',
            ].join(' ')}
          >
            {step}
          </div>
        ))}
      </div>

      {/* ── Messages ── */}
      <div className={s.messages}>
        {messages.map((msg, msgIdx) => {
          // How many user messages were sent up to this AI message
          const aiIndex = messages
            .slice(0, msgIdx + 1)
            .filter((m) => m.role === 'user').length;

          return (
            <div
              key={msg.id}
              className={`${s.msgRow} ${msg.role === 'user' ? s.msgUser : s.msgAi}`}
            >
              {msg.role === 'ai' && <div className={s.aiAvatar}>🧠</div>}

              <div className={s.msgContent}>
                <div className={s.msgBubble}>{msg.text}</div>

                {msg.role === 'ai' && (
                  <div className={s.msgActions}>
                    <button
                      className={s.actionBtn}
                      onClick={handleNextStep}
                      disabled={isTyping}
                    >
                      Следующий шаг →
                    </button>
                    <button
                      className={s.actionBtn}
                      onClick={() => handleCopy(msg.text, msg.id)}
                    >
                      {copied === msg.id ? 'Скопировано ✓' : 'Копировать'}
                    </button>
                    <button
                      className={s.actionBtn}
                      onClick={() => handleRewrite(msg.id, aiIndex)}
                      disabled={isTyping}
                    >
                      Переписать
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {isTyping && (
          <div className={`${s.msgRow} ${s.msgAi}`}>
            <div className={s.aiAvatar}>🧠</div>
            <div className={s.msgContent}>
              <div className={s.typingBubble}>
                <span className={s.dot} />
                <span className={s.dot} />
                <span className={s.dot} />
                <span className={s.typingLabel}>Печатает...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input ── */}
      <div className={s.inputArea}>
        <textarea
          ref={textareaRef}
          className={s.textarea}
          placeholder="Введите сообщение… (Enter — отправить, Shift+Enter — новая строка)"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={isTyping}
        />
        <button
          className={s.sendBtn}
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || isTyping}
          aria-label="Отправить"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M16 9L2 2l3 7-3 7 14-7z" fill="currentColor" />
          </svg>
        </button>
      </div>
    </div>
  );
}
