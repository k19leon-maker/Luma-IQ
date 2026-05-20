import { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import s from './Chat.module.css';
import { aiApi, ConversationMessage } from '../../api/ai';
import FormattedText from '../../components/FormattedText/FormattedText';
import { MessageActions, MessageInput } from '../../components/MessageInput/MessageInput';
import { useModelStore } from '../../store/model.store';

// ─── Types ────────────────────────────────────────────────────────────────────

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


function uid() {
  return Math.random().toString(36).slice(2);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Chat() {
  const [active, setActive] = useState(false);
  const getSettings = useModelStore((st) => st.getSettings);
  const [messages, setMessages] = useState<Message[]>([]);
  const [history, setHistory] = useState<ConversationMessage[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [input, setInput] = useState('');
  const [userMsgCount, setUserMsgCount] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  function startChat() {
    setActive(true);
    setMessages([{ id: uid(), role: 'ai', text: INITIAL_AI_MSG }]);
    setHistory([{ role: 'assistant', content: INITIAL_AI_MSG }]);
    setCurrentStep(0);
    setUserMsgCount(0);
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isTyping) return;

    const newCount = userMsgCount + 1;
    setMessages((prev) => [...prev, { id: uid(), role: 'user', text: trimmed }]);
    setUserMsgCount(newCount);
    setInput('');
    setIsTyping(true);

    const updatedHistory: ConversationMessage[] = [
      ...history,
      { role: 'user', content: trimmed },
    ];

    try {
      const settings = getSettings('strategy');
      const res = await aiApi.chat({
        message: trimmed,
        model: settings.provider,
        openaiModel: settings.openaiModel,
        claudeModel: settings.claudeModel,
        conversationHistory: history,
      });

      setMessages((prev) => [...prev, { id: uid(), role: 'ai', text: res.content }]);
      setHistory([...updatedHistory, { role: 'assistant', content: res.content }]);
    } catch {
      toast.error('Неполадки со связью. Попробуйте обновить страницу и интернет соединение.');
    } finally {
      setIsTyping(false);
      setCurrentStep((prev) => Math.min(prev + 1, JTBD_STEPS.length - 1));
    }
  }

  function handleNextStep() {
    void sendMessage('Переходим к следующему шагу');
  }

  function handleRewrite(_msgId: string, _count: number) {
    // rewrite via AI not implemented
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
                <div className={s.msgBubble}>
                  {msg.role === 'ai' ? <FormattedText compact>{msg.text}</FormattedText> : msg.text}
                </div>

                {msg.role === 'ai' && (
                  <>
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
                        onClick={() => handleRewrite(msg.id, aiIndex)}
                        disabled={isTyping}
                      >
                        Переписать
                      </button>
                    </div>
                    <MessageActions content={msg.text} compact />
                  </>
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
        <MessageInput
          value={input}
          onChange={setInput}
          onSend={() => void sendMessage(input)}
          isLoading={isTyping}
          section="strategy"
          placeholder="Введите сообщение..."
        />
      </div>
    </div>
  );
}
