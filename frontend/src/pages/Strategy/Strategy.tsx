import { useState, useEffect, useRef, KeyboardEvent, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import s from './Strategy.module.css';
import { jtbdApi, JTBDStep } from '../../api/jtbd.api';
import { JTBD_STEPS_FALLBACK } from '../../config/jtbd-steps';
import { useProgressStore } from '../../store/progress.store';

// ─── Types ────────────────────────────────────────────────────────────────────

type Model = 'chatgpt' | 'claude';
type Phase = 'input' | 'loading' | 'done';

// Какой ключ в answers хранит пользовательский ввод для каждого шага
const USER_INPUT_KEY: Record<number, string> = {
  1: 'niche',
  3: 'chosenSegment',
  5: 'chosenSubsegment',
  7: 'chosenRequest',
};

const STORAGE_ANSWERS = 'strategy_answers';
const STORAGE_STEP    = 'strategy_step';

function loadAnswers(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(STORAGE_ANSWERS) ?? '{}'); }
  catch { return {}; }
}

function saveAnswers(answers: Record<string, string>) {
  localStorage.setItem(STORAGE_ANSWERS, JSON.stringify(answers));
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Strategy() {
  const navigate = useNavigate();
  const completeStrategy = useProgressStore((st) => st.completeStrategy);
  const strategyCompleted = useProgressStore((st) => st.strategyCompleted);

  const [steps, setSteps] = useState<JTBDStep[]>([]);
  const [stepsLoading, setStepsLoading] = useState(true);
  const [stepsError, setStepsError] = useState('');
  const [usingFallback, setUsingFallback] = useState(false);

  const [started, setStarted] = useState(false);
  const [completed, setCompleted] = useState(false);

  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('input');
  const [aiResponse, setAiResponse] = useState('');
  const [userInput, setUserInput] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>(loadAnswers);
  const [model, setModel] = useState<Model>('chatgpt');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const responseRef = useRef<HTMLDivElement>(null);

  const currentStep = steps[stepIndex] ?? null;
  const isAutoStep  = currentStep ? currentStep.userQuestion === null : false;

  // ── Load steps on mount ─────────────────────────────────────────────────────
  function applySteps(data: JTBDStep[]) {
    setSteps(data);
    const savedStep = parseInt(localStorage.getItem(STORAGE_STEP) ?? '0', 10);
    const savedAnswers = loadAnswers();
    if (Object.keys(savedAnswers).length > 0 && savedStep > 0) {
      setAnswers(savedAnswers);
      setStepIndex(Math.min(savedStep, data.length - 1));
      setStarted(true);
      if (savedStep >= data.length) setCompleted(true);
    }
  }

  function loadSteps() {
    setStepsLoading(true);
    setStepsError('');
    jtbdApi.getSteps()
      .then((data) => {
        setUsingFallback(false);
        applySteps(data);
      })
      .catch(() => {
        // Бэкенд недоступен — используем fallback
        setUsingFallback(true);
        applySteps(JTBD_STEPS_FALLBACK);
      })
      .finally(() => setStepsLoading(false));
  }

  useEffect(() => {
    loadSteps();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-run generation for automatic steps ─────────────────────────────────
  useEffect(() => {
    if (!started || !currentStep || !isAutoStep || phase !== 'input') return;
    void runGenerate(answers);
  }, [stepIndex, started]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-resize textarea ────────────────────────────────────────────────────
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  }, [userInput]);

  // ── Scroll response into view ───────────────────────────────────────────────
  useEffect(() => {
    if (phase === 'done') {
      responseRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [phase, aiResponse]);

  // ─── Core: call generate API ────────────────────────────────────────────────
  async function runGenerate(currentAnswers: Record<string, string>) {
    if (!currentStep) return;
    setPhase('loading');
    setError('');
    try {
      const res = await jtbdApi.generate({
        stepId: currentStep.id,
        answers: currentAnswers,
        model,
      });
      const updated = { ...currentAnswers, [currentStep.key]: res.content };
      setAnswers(updated);
      saveAnswers(updated);
      setAiResponse(res.content);
      setPhase('done');
    } catch {
      setError('Ошибка при генерации. Попробуйте ещё раз.');
      setPhase('input');
    }
  }

  // ─── Submit user input ──────────────────────────────────────────────────────
  function handleSubmit() {
    const trimmed = userInput.trim();
    if (!trimmed || !currentStep) return;

    const inputKey = USER_INPUT_KEY[currentStep.id] ?? currentStep.key + '_input';
    const updated = { ...answers, [inputKey]: trimmed };
    setAnswers(updated);
    saveAnswers(updated);
    setUserInput('');
    void runGenerate(updated);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  // ─── Advance to next step ───────────────────────────────────────────────────
  function handleNext() {
    const nextIndex = stepIndex + 1;
    if (nextIndex >= steps.length) {
      // Strategy complete
      completeStrategy();
      setCompleted(true);
      localStorage.setItem(STORAGE_STEP, String(steps.length));
      return;
    }
    localStorage.setItem(STORAGE_STEP, String(nextIndex));
    setStepIndex(nextIndex);
    setAiResponse('');
    setUserInput('');
    setPhase('input');
    setError('');
  }

  // ─── Retry generation ───────────────────────────────────────────────────────
  function handleRetry() {
    setPhase('input');
    if (isAutoStep) void runGenerate(answers);
  }

  // ─── Copy response ──────────────────────────────────────────────────────────
  function handleCopy() {
    navigator.clipboard.writeText(aiResponse).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // ─── Reset ──────────────────────────────────────────────────────────────────
  function handleReset() {
    localStorage.removeItem(STORAGE_ANSWERS);
    localStorage.removeItem(STORAGE_STEP);
    setAnswers({});
    setStepIndex(0);
    setAiResponse('');
    setUserInput('');
    setPhase('input');
    setCompleted(false);
    setStarted(false);
  }

  // ─── Download strategy ──────────────────────────────────────────────────────
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
  // Render: loading steps
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
  // Render: welcome screen
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

          {/* Model selector */}
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

          <button className={s.startBtn} onClick={() => setStarted(true)}>
            Начать стратегию →
          </button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // Render: completed screen
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
  // Render: active step
  // ══════════════════════════════════════════════════════════════════════════════

  const progress = ((stepIndex) / steps.length) * 100;

  return (
    <div className={s.page}>

      {/* ── Top bar: progress + model ── */}
      <div className={s.topBar}>
        <div className={s.progressInfo}>
          <span className={s.stepLabel}>Шаг {stepIndex + 1} из {steps.length}</span>
          <div className={s.progressTrack}>
            <div className={s.progressFill} style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className={s.modelRow}>
          {(['chatgpt', 'claude'] as Model[]).map((m) => (
            <button
              key={m}
              className={`${s.modelChip} ${model === m ? s.modelActive : ''}`}
              onClick={() => setModel(m)}
              disabled={phase === 'loading'}
            >
              {m === 'chatgpt' ? 'ChatGPT' : 'Claude'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Step header ── */}
      <div className={s.stepHeader}>
        <div className={s.stepNum}>#{stepIndex + 1}</div>
        <div>
          <div className={s.stepTitle}>{currentStep?.title}</div>
          <div className={s.stepDesc}>{currentStep?.description}</div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className={s.body}>

        {/* Question (for steps with userQuestion) */}
        {currentStep?.userQuestion && phase === 'input' && (
          <div className={s.aiMessage}>
            <div className={s.aiAvatar}>🧠</div>
            <div className={s.aiBubble}>
              {stepIndex === 0
                ? 'Привет! Я помогу упаковать ваши услуги.\nДля начала — в какой нише вы работаете?\nНапример: тревога, отношения, подростки, выгорание...'
                : currentStep.userQuestion}
            </div>
          </div>
        )}

        {/* Auto step: waiting label */}
        {isAutoStep && phase === 'input' && (
          <div className={s.autoLabel}>
            ⚡ Автоматический шаг — генерирую на основе ваших ответов...
          </div>
        )}

        {/* Loading */}
        {phase === 'loading' && (
          <div className={s.aiMessage}>
            <div className={s.aiAvatar}>🧠</div>
            <div className={s.typingBubble}>
              <span className={s.dot} />
              <span className={s.dot} />
              <span className={s.dot} />
              <span className={s.typingLabel}>Генерирую...</span>
            </div>
          </div>
        )}

        {/* AI Response */}
        {phase === 'done' && aiResponse && (
          <div className={s.responseBlock} ref={responseRef}>
            <div className={s.aiMessage}>
              <div className={s.aiAvatar}>🧠</div>
              <div className={s.aiBubble}>{aiResponse}</div>
            </div>
            <div className={s.responseActions}>
              <button className={s.actionBtn} onClick={handleCopy}>
                {copied ? '✓ Скопировано' : 'Копировать'}
              </button>
              <button className={s.actionBtn} onClick={handleRetry}>
                Сгенерировать заново
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className={s.errorBox}>
            {error}
            <button className={s.retryLink} onClick={handleRetry}>Попробовать снова</button>
          </div>
        )}
      </div>

      {/* ── Input area (for steps with userQuestion) ── */}
      {currentStep?.userQuestion && phase !== 'loading' && (
        <div className={s.inputArea}>
          <textarea
            ref={textareaRef}
            className={s.textarea}
            placeholder={
              phase === 'done'
                ? 'Введите ваш выбор или уточнение...'
                : (stepIndex === 0 ? 'Например: тревожные расстройства, выгорание...' : 'Ваш ответ...')
            }
            value={userInput}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setUserInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
          />
          {phase === 'input' ? (
            <button
              className={s.sendBtn}
              onClick={handleSubmit}
              disabled={!userInput.trim()}
            >
              {stepIndex === 0 ? 'Начать упаковку' : 'Отправить'}
            </button>
          ) : (
            <button
              className={`${s.sendBtn} ${s.nextBtn}`}
              onClick={() => {
                // Submit additional input then advance, or just advance
                if (userInput.trim()) {
                  handleSubmit();
                } else {
                  handleNext();
                }
              }}
            >
              Далее →
            </button>
          )}
        </div>
      )}

      {/* ── Next button (for auto steps after response) ── */}
      {isAutoStep && phase === 'done' && (
        <div className={s.nextArea}>
          <button className={s.nextBtnLarge} onClick={handleNext}>
            {stepIndex + 1 >= steps.length ? 'Завершить стратегию 🎉' : 'Далее →'}
          </button>
        </div>
      )}
    </div>
  );
}
