import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectsStore } from '../../store/projects.store';
import s from './Onboarding.module.css';

interface Props {
  onDone: () => void;
}

export default function Onboarding({ onDone }: Props) {
  const navigate = useNavigate();
  const addProject        = useProjectsStore((s) => s.addProject);

  const [step, setStep]               = useState(0);
  const [projectName, setProjectName] = useState('');
  const [creating, setCreating]       = useState(false);
  const [error, setError]             = useState('');
  const [direction, setDirection]     = useState<'forward' | 'back'>('forward');

  function goTo(target: number) {
    setDirection(target > step ? 'forward' : 'back');
    setStep(target);
  }

  async function handleCreateProject() {
    const name = projectName.trim();
    if (!name) { setError('Введите название проекта'); return; }
    setError('');
    setCreating(true);
    try {
      await addProject(name);
      goTo(3);
    } catch {
      setError('Не удалось создать проект на сервере. Проверьте соединение и попробуйте ещё раз.');
    } finally {
      setCreating(false);
    }
  }

  function finish() {
    localStorage.setItem('onboarding_done', 'true');
    onDone();
    navigate('/strategy');
  }

  const STEPS = [
    <StepWelcome key={0} onNext={() => goTo(1)} />,
    <StepHowItWorks key={1} onNext={() => goTo(2)} />,
    <StepCreateProject
      key={2}
      value={projectName}
      onChange={(v) => { setProjectName(v); setError(''); }}
      onCreate={() => void handleCreateProject()}
      creating={creating}
      error={error}
    />,
    <StepReady key={3} onFinish={finish} />,
  ];

  return (
    <div className={s.overlay}>
      <div className={s.modal}>
        <div
          className={`${s.stepWrap} ${direction === 'forward' ? s.slideIn : s.slideInBack}`}
          key={step}
        >
          {STEPS[step]}
        </div>

        <div className={s.dots}>
          {STEPS.map((_, i) => (
            <button
              key={i}
              className={`${s.dot} ${i === step ? s.dotActive : ''}`}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className={s.step}>
      <div className={s.icon}>🧠</div>
      <h2 className={s.heading}>Добро пожаловать в LumaIQ</h2>
      <p className={s.text}>
        Сервис помогает психологам упаковать свои услуги и создать маркетинговые
        материалы по JTBD-фреймворку. Всё что нужно — описать свою нишу.
      </p>
      <button className={s.primaryBtn} onClick={onNext}>Начать →</button>
    </div>
  );
}

function StepHowItWorks({ onNext }: { onNext: () => void }) {
  return (
    <div className={s.step}>
      <h2 className={s.heading}>Как это работает</h2>
      <div className={s.features}>
        <div className={s.feature}>
          <span className={s.featureIcon}>🎯</span>
          <div>
            <div className={s.featureTitle}>Стратегия</div>
            <div className={s.featureText}>
              Опишите вашу аудиторию — ИИ проведёт вас через 12 шагов JTBD-анализа
            </div>
          </div>
        </div>
        <div className={s.feature}>
          <span className={s.featureIcon}>📦</span>
          <div>
            <div className={s.featureTitle}>Продукты и контент</div>
            <div className={s.featureText}>
              На основе стратегии создайте продукты, посты, рилсы и статьи одним кликом
            </div>
          </div>
        </div>
        <div className={s.feature}>
          <span className={s.featureIcon}>📅</span>
          <div>
            <div className={s.featureTitle}>Контент-план</div>
            <div className={s.featureText}>
              Запланируйте публикации по дням недели
            </div>
          </div>
        </div>
      </div>
      <button className={s.primaryBtn} onClick={onNext}>Далее →</button>
    </div>
  );
}

function StepCreateProject({
  value, onChange, onCreate, creating, error,
}: {
  value:    string;
  onChange: (v: string) => void;
  onCreate: () => void;
  creating: boolean;
  error:    string;
}) {
  return (
    <div className={s.step}>
      <div className={s.icon}>🗂️</div>
      <h2 className={s.heading}>Создайте первый проект</h2>
      <p className={s.text}>
        Дайте название вашему первому проекту.<br />
        Например: «Тревога у подростков» или «Выгорание у мам»
      </p>
      <input
        className={`${s.input} ${error ? s.inputError : ''}`}
        type="text"
        placeholder="Название проекта"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && !creating && onCreate()}
        autoFocus
      />
      {error && <p className={s.errorText}>{error}</p>}
      <button
        className={s.primaryBtn}
        onClick={onCreate}
        disabled={creating}
      >
        {creating ? 'Создаём...' : 'Создать проект →'}
      </button>
    </div>
  );
}

function StepReady({ onFinish }: { onFinish: () => void }) {
  return (
    <div className={s.step}>
      <div className={s.icon}>🎉</div>
      <h2 className={s.heading}>Всё готово!</h2>
      <p className={s.text}>
        Первый шаг — пройти Стратегию. ИИ поможет определить вашу целевую
        аудиторию и её боли. Это займёт около 20 минут.
      </p>
      <button className={s.primaryBtn} onClick={onFinish}>
        Перейти к Стратегии →
      </button>
    </div>
  );
}
