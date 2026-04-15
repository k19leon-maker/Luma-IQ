import {
  useState, useEffect, useRef,
  KeyboardEvent, ChangeEvent, useCallback,
} from 'react';
import { useNavigate } from 'react-router-dom';
import s from './Strategy.module.css';
import { jtbdApi, JTBDStep } from '../../api/jtbd.api';
import { JTBD_STEPS_FALLBACK } from '../../config/jtbd-steps';
import { PROMPT_BUILDERS } from '../../config/jtbd-prompts';
import { useProgressStore } from '../../store/progress.store';

// ─── Types ────────────────────────────────────────────────────────────────────

type Model = 'chatgpt' | 'claude';
type Phase = 'input' | 'loading' | 'done';
type PromptStatus = 'typing' | 'ready' | 'editing';

interface ChatMessage {
  role: 'ai' | 'user';
  text: string;
  stepId?: number;
}

const USER_INPUT_KEY: Record<number, string> = {
  1: 'niche',
  3: 'chosenSegment',
  5: 'chosenSubsegment',
  7: 'chosenRequest',
};

const STORAGE_ANSWERS = 'strategy_answers';
const STORAGE_STEP    = 'strategy_step';
const TYPEWRITER_MS   = 12;

function loadAnswers(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(STORAGE_ANSWERS) ?? '{}'); }
  catch { return {}; }
}
function saveAnswers(a: Record<string, string>) {
  localStorage.setItem(STORAGE_ANSWERS, JSON.stringify(a));
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Strategy() {
  const navigate          = useNavigate();
  const completeStrategy  = useProgressStore((st) => st.completeStrategy);
  const strategyCompleted = useProgressStore((st) => st.strategyCompleted);

  // Steps
  const [steps, setSteps]               = useState<JTBDStep[]>([]);
  const [stepsLoading, setStepsLoading] = useState(true);
  const [stepsError, setStepsError]     = useState('');
  const [usingFallback, setUsingFallback] = useState(false);

  // Session
  const [started,   setStarted]   = useState(false);
  const [completed, setCompleted] = useState(false);

  // Step state
  const [stepIndex,  setStepIndex]  = useState(0);
  const [phase,      setPhase]      = useState<Phase>('input');
  const [answers,    setAnswers]    = useState<Record<string, string>>(loadAnswers);
  const [model,      setModel]      = useState<Model>('chatgpt');
  const [userInput,  setUserInput]  = useState('');
  const [error,      setError]      = useState('');

  // Chat messages
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Prompt panel
  const [promptFull,    setPromptFull]    = useState('');
  const [promptDisplay, setPromptDisplay] = useState('');
  const [promptStatus,  setPromptStatus]  = useState<PromptStatus>('ready');
  const [promptEditing, setPromptEditing] = useState(false);

  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const typeTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentStep = steps[stepIndex] ?? null;
  const isAutoStep  = currentStep?.userQuestion === null;

  // ── Build prompt from current answers + live userInput ─────────────────────

  const buildCurrentPrompt = useCallback((ans: Record<string, string>, liveInput: string) => {
    if (!currentStep) return '';
    const inputKey = USER_INPUT_KEY[currentStep.id];
    const merged   = inputKey
      ? { ...ans, [inputKey]: liveInput || ans[inputKey] || '' }
      : ans;
    const builder = PROMPT_BUILDERS[currentStep.id];
    return builder ? builder(merged) : '';
  }, [currentStep]);

  // ── Typewriter effect ───────────────────────────────────────────────────────

  const startTypewriter = useCallback((text: string) => {
    if (typeTimerRef.current) clearInterval(typeTimerRef.current);
    setPromptDisplay('');
    setPromptStatus('typing');
    let i = 0;
    typeTimerRef.current = setInterval(() => {
      i++;
      setPromptDisplay(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(typeTimerRef.current!);
        typeTimerRef.current = null;
        setPromptStatus('ready');
      }
    }, TYPEWRITER_MS);
  }, []);

  useEffect(() => () => {
    if (typeTimerRef.current) clearInterval(typeTimerRef.current);
  }, []);

  // ── Rebuild prompt when step or answers change ──────────────────────────────

  useEffect(() => {
    if (!started || !currentStep || promptEditing) return;
    const text = buildCurrentPrompt(answers, userInput);
    if (text === promptFull) return;
    setPromptFull(text);
    startTypewriter(text);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, started, currentStep]);

  // ── Rebuild when userInput changes (debounced 400ms) ───────────────────────

  useEffect(() => {
    if (!started || !currentStep || promptEditing) return;
    const t = setTimeout(() => {
      const text = buildCurrentPrompt(answers, userInput);
      if (text === promptFull) return;
      setPromptFull(text);
      startTypewriter(text);
    }, 400);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userInput]);

  // ── Load steps ──────────────────────────────────────────────────────────────

  function applySteps(data: JTBDStep[]) {
    setSteps(data);
    const savedStep    = parseInt(localStorage.getItem(STORAGE_STEP) ?? '0', 10);
    const savedAnswers = loadAnswers();
    if (Object.keys(savedAnswers).length > 0 && savedStep > 0) {
      setAnswers(savedAnswers);
      const idx = Math.min(savedStep, data.length - 1);
      setStepIndex(idx);
      setStarted(true);
      if (savedStep >= data.length) setCompleted(true);
      // Restore AI message for current step if it exists
      const step = data[idx];
      if (step) {
        const saved = savedAnswers[step.key];
        if (saved) {
          setMessages([{ role: 'ai', text: saved, stepId: step.id }]);
          setPhase('done');
        } else {
          pushInitialQuestion(data, idx, savedAnswers);
        }
      }
    }
  }

  function pushInitialQuestion(data: JTBDStep[], idx: number, _ans: Record<string, string>) {
    const step = data[idx];
    if (!step) return;
    if (step.userQuestion) {
      const text = idx === 0
        ? 'Привет! Я помогу упаковать ваши услуги.\nДля начала — в какой нише вы работаете?\nНапример: тревога, отношения, подростки, выгорание...'
        : step.userQuestion;
      setMessages([{ role: 'ai', text, stepId: step.id }]);
    }
  }

  function loadSteps() {
    setStepsLoading(true);
    setStepsError('');
    jtbdApi.getSteps()
      .then((data) => { setUsingFallback(false); applySteps(data); })
      .catch(() => { setUsingFallback(true); applySteps(JTBD_STEPS_FALLBACK); })
      .finally(() => setStepsLoading(false));
  }

  useEffect(() => { loadSteps(); }, []); // eslint-disable-line

  // ── Auto-run for auto steps ─────────────────────────────────────────────────

  useEffect(() => {
    if (!started || !currentStep || !isAutoStep || phase !== 'input') return;
    void runGenerate(answers);
  }, [stepIndex, started]); // eslint-disable-line

  // ── Auto-scroll chat to bottom ──────────────────────────────────────────────

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, phase]);

  // ── Auto-resize textarea ────────────────────────────────────────────────────

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  }, [userInput]);

  // ── Handle start ────────────────────────────────────────────────────────────

  function handleStart() {
    setStarted(true);
    if (steps[0]?.userQuestion) {
      const text = 'Привет! Я помогу упаковать ваши услуги.\nДля начала — в какой нише вы работаете?\nНапример: тревога, отношения, подростки, выгорание...';
      setMessages([{ role: 'ai', text, stepId: steps[0].id }]);
    }
  }

  // ── Core: generate ──────────────────────────────────────────────────────────

  async function runGenerate(currentAnswers: Record<string, string>) {
    if (!currentStep) return;
    setPhase('loading');
    setError('');
    // Add typing indicator message
    setMessages((prev) => [...prev, { role: 'ai', text: '__typing__', stepId: currentStep.id }]);
    try {
      const res = await jtbdApi.generate({
        stepId: currentStep.id,
        answers: currentAnswers,
        model,
      });
      const updated = { ...currentAnswers, [currentStep.key]: res.content };
      setAnswers(updated);
      saveAnswers(updated);
      // Replace typing indicator with real response
      setMessages((prev) => [
        ...prev.filter((m) => m.text !== '__typing__'),
        { role: 'ai', text: res.content, stepId: currentStep.id },
      ]);
      setPhase('done');
    } catch {
      setMessages((prev) => prev.filter((m) => m.text !== '__typing__'));
      setError('Ошибка при генерации. Попробуйте ещё раз.');
      setPhase('input');
    }
  }

  // ── Submit user input ───────────────────────────────────────────────────────

  function handleSubmit() {
    const trimmed = userInput.trim();
    if (!trimmed || !currentStep) return;

    const inputKey = USER_INPUT_KEY[currentStep.id] ?? currentStep.key + '_input';
    const updated  = { ...answers, [inputKey]: trimmed };
    setAnswers(updated);
    saveAnswers(updated);
    setUserInput('');

    // Add user message to chat
    setMessages((prev) => [...prev, { role: 'user', text: trimmed }]);

    // Immediately rebuild prompt with submitted value
    if (!promptEditing) {
      const builder = PROMPT_BUILDERS[currentStep.id];
      if (builder) {
        const text = builder({ ...updated });
        setPromptFull(text);
        startTypewriter(text);
      }
    }

    void runGenerate(updated);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  // ── Run prompt from prompt panel ────────────────────────────────────────────

  function handleRunPrompt() {
    if (phase === 'loading') return;
    if (promptEditing) {
      // Use the edited prompt directly (bypass buildPrompt)
      // We still call the API with current answers; the backend will re-build the prompt.
      // Just visually run the generate.
      setPromptEditing(false);
      setPromptStatus('ready');
    }
    if (!currentStep) return;
    // If there's user input pending, submit it first
    if (userInput.trim()) {
      handleSubmit();
    } else if (isAutoStep) {
      void runGenerate(answers);
    }
  }

  // ── Advance to next step ────────────────────────────────────────────────────

  function handleNext() {
    const nextIndex = stepIndex + 1;
    if (nextIndex >= steps.length) {
      completeStrategy();
      setCompleted(true);
      localStorage.setItem(STORAGE_STEP, String(steps.length));
      return;
    }
    localStorage.setItem(STORAGE_STEP, String(nextIndex));

    const nextStep = steps[nextIndex];
    const nextMessages: ChatMessage[] = [];
    if (nextStep?.userQuestion) {
      nextMessages.push({ role: 'ai', text: nextStep.userQuestion, stepId: nextStep.id });
    }

    setStepIndex(nextIndex);
    setMessages(nextMessages);
    setUserInput('');
    setPhase('input');
    setError('');
    setPromptEditing(false);
    setPromptFull('');
    setPromptDisplay('');
    setPromptStatus('ready');
  }

  // ── Retry ───────────────────────────────────────────────────────────────────

  function handleRetry() {
    setPhase('input');
    setError('');
    if (isAutoStep) void runGenerate(answers);
  }

  // ── Reset ───────────────────────────────────────────────────────────────────

  function handleReset() {
    localStorage.removeItem(STORAGE_ANSWERS);
    localStorage.removeItem(STORAGE_STEP);
    setAnswers({});
    setStepIndex(0);
    setMessages([]);
    setUserInput('');
    setPhase('input');
    setCompleted(false);
    setStarted(false);
    setPromptFull('');
    setPromptDisplay('');
    setPromptStatus('ready');
    setPromptEditing(false);
  }

  // ── Download ────────────────────────────────────────────────────────────────

  function handleDownload() {
    const lines: string[] = ['# Стратегия упаковки\n'];
    steps.forEach((step) => {
      const response = answers[step.key];
      if (response) {
        lines.push(`## ${step.id}. ${step.title}`);
        lines.push(response);
        lines.push('');
      }
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'strategy.md';
    a.click();
    URL.revokeObjectURL(url);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // Render: loading
  // ══════════════════════════════════════════════════════════════════════════════

  if (stepsLoading) {
    return (
      <div className={s.center}>
        <div className={s.spinner} />
        <span className={s.loadingText}>Загружаем фреймворк...</span>
      </div>
    );
  }

  if (stepsError) {
    return (
      <div className={s.center}>
        <div className={s.errorBox}>
          {stepsError}
          <button className={s.retryLink} onClick={loadSteps}>Попробовать снова</button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // Render: welcome
  // ══════════════════════════════════════════════════════════════════════════════

  if (!started) {
    return (
      <div className={s.welcome}>
        <div className={s.welcomeCard}>
          <div className={s.welcomeIcon}>🎯</div>
          <h2 className={s.welcomeTitle}>Стратегия упаковки</h2>
          <p className={s.welcomeDesc}>
            ИИ-ассистент проведёт вас через 12 шагов JTBD-фреймворка.
            Вы получите глубокое понимание своей аудитории, её болей
            и готовую основу для всех маркетинговых материалов.
          </p>
          <div className={s.welcomeMeta}>
            <span className={s.metaChip}>12 шагов</span>
            <span className={s.metaChip}>≈ 20 минут</span>
            <span className={s.metaChip}>Сохраняется автоматически</span>
          </div>
          {usingFallback && (
            <div className={s.warnBanner}>
              ⚠️ Бэкенд недоступен — работаем в офлайн-режиме (ответы будут mock).
            </div>
          )}
          {strategyCompleted && (
            <div className={s.completedBanner}>
              ✅ Стратегия уже завершена. Вы можете пройти её заново.
            </div>
          )}
          <div className={s.modelRow}>
            {(['chatgpt', 'claude'] as Model[]).map((m) => (
              <button
                key={m}
                className={`${s.modelChip}${model === m ? ' ' + s.modelActive : ''}`}
                onClick={() => setModel(m)}
              >
                {m === 'chatgpt' ? 'ChatGPT' : 'Claude'}
              </button>
            ))}
          </div>
          <button className={s.startBtn} onClick={handleStart}>
            Начать стратегию →
          </button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // Render: completed
  // ══════════════════════════════════════════════════════════════════════════════

  if (completed) {
    return (
      <div className={s.welcome}>
        <div className={s.welcomeCard}>
          <div className={s.welcomeIcon}>🎉</div>
          <h2 className={s.welcomeTitle}>Стратегия готова!</h2>
          <p className={s.welcomeDesc}>
            Вы прошли все 12 шагов JTBD-фреймворка. Теперь вы чётко понимаете
            свою аудиторию и готовы создавать продукты и контент.
          </p>
          <div className={s.completedActions}>
            <button className={s.startBtn} onClick={handleDownload}>
              Скачать стратегию
            </button>
            <button className={s.secondaryBtn} onClick={() => navigate('/product-main')}>
              Перейти к продукту →
            </button>
            <button className={s.resetBtn} onClick={handleReset}>
              Пройти заново
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // Render: active step — three-column layout
  // ══════════════════════════════════════════════════════════════════════════════

  const progress = (stepIndex / steps.length) * 100;

  return (
    <div className={s.threeCol}>

      {/* ── Center: chat ─────────────────────────────────────────────────────── */}
      <div className={s.chatCol}>

        {/* Top bar */}
        <div className={s.topBar}>
          <div className={s.progressInfo}>
            <span className={s.stepLabel}>
              Шаг {stepIndex + 1} из {steps.length} — {currentStep?.title}
            </span>
            <div className={s.progressTrack}>
              <div className={s.progressFill} style={{ width: `${progress}%` }} />
            </div>
          </div>
          <div className={s.modelRow}>
            {(['chatgpt', 'claude'] as Model[]).map((m) => (
              <button
                key={m}
                className={`${s.modelChip}${model === m ? ' ' + s.modelActive : ''}`}
                onClick={() => setModel(m)}
                disabled={phase === 'loading'}
              >
                {m === 'chatgpt' ? 'ChatGPT' : 'Claude'}
              </button>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div className={s.chatBody}>
          {messages.map((msg, i) => {
            if (msg.role === 'ai') {
              if (msg.text === '__typing__') {
                return (
                  <div key={i} className={s.aiMessage}>
                    <div className={s.aiAvatar}>🧠</div>
                    <div className={s.typingBubble}>
                      <span className={s.dot} />
                      <span className={s.dot} />
                      <span className={s.dot} />
                      <span className={s.typingLabel}>Генерирую...</span>
                    </div>
                  </div>
                );
              }
              return (
                <div key={i} className={s.aiMessage}>
                  <div className={s.aiAvatar}>🧠</div>
                  <div className={s.aiBubble}>{msg.text}</div>
                </div>
              );
            }
            // user message
            return (
              <div key={i} className={s.userMessage}>
                <div className={s.userBubble}>{msg.text}</div>
                <div className={s.userAvatar}>ИП</div>
              </div>
            );
          })}

          {error && (
            <div className={s.errorBox}>
              {error}
              <button className={s.retryLink} onClick={handleRetry}>Попробовать снова</button>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* Input area */}
        <div className={s.inputArea}>
          {currentStep?.userQuestion && phase !== 'loading' ? (
            <>
              <textarea
                ref={textareaRef}
                className={s.textarea}
                placeholder={
                  (phase as string) === 'done'
                    ? 'Введите ваш выбор или уточнение...'
                    : stepIndex === 0
                    ? 'Например: тревожные расстройства, выгорание...'
                    : 'Ваш ответ...'
                }
                value={userInput}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setUserInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
              />
              <button
                className={s.sendBtn}
                onClick={(phase as string) === 'done' && !userInput.trim() ? handleNext : handleSubmit}
                disabled={(phase as string) === 'input' && !userInput.trim()}
              >
                {(phase as string) === 'done' && !userInput.trim()
                  ? 'Далее →'
                  : stepIndex === 0
                  ? 'Начать'
                  : 'Отправить'}
              </button>
            </>
          ) : isAutoStep && phase === 'done' ? (
            <button className={s.nextBtnLarge} onClick={handleNext}>
              {stepIndex + 1 >= steps.length ? 'Завершить стратегию 🎉' : 'Далее →'}
            </button>
          ) : isAutoStep && phase === 'loading' ? (
            <div className={s.autoLabel}>⚡ Генерирую автоматически...</div>
          ) : null}
        </div>
      </div>

      {/* ── Right: prompt panel ──────────────────────────────────────────────── */}
      <div className={s.promptCol}>
        <div className={s.promptHeader}>
          <span className={s.promptIcon}>⚙️</span>
          <span className={s.promptTitle}>
            {promptStatus === 'typing'
              ? 'Формулирую промпт...'
              : promptStatus === 'editing'
              ? '✏️ Редактирование промпта'
              : '✅ Промпт готов'}
          </span>
        </div>

        <div className={s.promptBody}>
          {promptEditing ? (
            <textarea
              className={s.promptTextarea}
              value={promptDisplay}
              onChange={(e) => setPromptDisplay(e.target.value)}
              spellCheck={false}
            />
          ) : (
            <pre className={s.promptPre}>{promptDisplay || ' '}</pre>
          )}
        </div>

        <div className={s.promptFooter}>
          <button
            className={s.promptBtn}
            onClick={() => {
              if (promptEditing) {
                setPromptEditing(false);
                setPromptStatus('ready');
              } else {
                // Finish typewriter immediately
                if (typeTimerRef.current) {
                  clearInterval(typeTimerRef.current);
                  typeTimerRef.current = null;
                }
                setPromptDisplay(promptFull);
                setPromptEditing(true);
                setPromptStatus('editing');
              }
            }}
            disabled={promptStatus === 'typing' && !promptEditing}
          >
            {promptEditing ? '✓ Готово' : '✏️ Редактировать'}
          </button>
          <button
            className={`${s.promptBtn} ${s.promptBtnRun}`}
            onClick={handleRunPrompt}
            disabled={phase === 'loading'}
          >
            ▶ Выполнить задачу
          </button>
        </div>
      </div>

    </div>
  );
}
