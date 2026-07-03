import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { onboardingApi, type OnboardingData } from '../../api/onboarding.api';
import { useAuthStore } from '../../store/auth.store';
import { useProjectsStore } from '../../store/projects.store';
import { useTasksStore } from '../../store/tasks.store';
import s from './B2BOnboarding.module.css';

const TOTAL_STEPS = 5;

const PREVIEW_TASKS = [
  {
    title: 'Заполнить раздел «О себе»',
    description: 'Дать Luma IQ базовый контекст о проекте, эксперте, продуктах и аудитории.',
  },
  {
    title: 'Собрать базовое позиционирование',
    description: 'Сформулировать, для кого вы работаете, какую проблему решаете и какой результат обещаете.',
  },
  {
    title: 'Уточнить целевую аудиторию',
    description: 'Выбрать сегмент и подсегмент, на который будет собираться упаковка.',
  },
  {
    title: 'Сформулировать УТП',
    description: 'Собрать понятное обещание: кому помогаете, с какой проблемой и за счёт чего.',
  },
];

const EMPTY_DATA: OnboardingData = {
  projectName: '',
  projectShortDescription: '',
  targetAudience: '',
  products: '',
  strengths: '',
};

function mergeData(data: OnboardingData | null | undefined): OnboardingData {
  return { ...EMPTY_DATA, ...(data ?? {}) };
}

export default function B2BOnboarding() {
  const navigate = useNavigate();
  const refreshUser = useAuthStore((state) => state.refreshUser);
  const activeProjectId = useProjectsStore((state) => state.activeProjectId);
  const loadProjects = useProjectsStore((state) => state.loadProjects);
  const setActiveProjectId = useProjectsStore((state) => state.setActiveProjectId);
  const setTasks = useTasksStore((state) => state.setTasks);

  const [step, setStep] = useState(1);
  const [data, setData] = useState<OnboardingData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completedProjectId, setCompletedProjectId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const progress = useMemo(() => Math.round((step / TOTAL_STEPS) * 100), [step]);

  useEffect(() => {
    let cancelled = false;
    async function loadState() {
      try {
        const onboarding = await onboardingApi.state();
        if (cancelled) return;
        if (onboarding.onboardingStatus === 'completed') {
          navigate(onboarding.recommendedRoute || '/app/tasks', { replace: true });
          return;
        }
        setStep(Math.min(Math.max(onboarding.onboardingStep || 1, 1), TOTAL_STEPS));
        setData(mergeData(onboarding.onboardingData));
      } catch {
        setError('Не удалось сохранить прогресс. Проверьте подключение и попробуйте ещё раз.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadProjects();
    void loadState();
    return () => {
      cancelled = true;
    };
  }, [loadProjects, navigate]);

  function updateField(key: keyof OnboardingData, value: string) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  async function persist(nextStep: number) {
    setSaving(true);
    setError('');
    try {
      await onboardingApi.progress(nextStep, data);
    } catch {
      setError('Не удалось сохранить прогресс. Проверьте подключение и попробуйте ещё раз.');
      throw new Error('progress_failed');
    } finally {
      setSaving(false);
    }
  }

  async function goToStep(nextStep: number) {
    await persist(nextStep);
    setStep(nextStep);
  }

  async function handleComplete() {
    setSaving(true);
    setError('');
    try {
      const result = await onboardingApi.complete({
        onboardingData: data,
        projectId: activeProjectId || undefined,
      });
      setCompletedProjectId(result.project.id);
      setActiveProjectId(result.project.id);
      setTasks(result.tasks);
      setStep(5);
      if (result.starterTasksError) {
        setError('Проект создан, но не удалось создать стартовый план задач. Вы сможете открыть разделы вручную или попробовать обновить страницу.');
      } else if (!result.starterTasksCreated) {
        toast('Стартовый план уже был создан ранее');
      }
    } catch {
      setError('Не удалось создать проект. Попробуйте ещё раз.');
    } finally {
      setSaving(false);
    }
  }

  async function finish(route: '/app/tasks' | '/app/strategy/about') {
    if (completedProjectId) setActiveProjectId(completedProjectId);
    void onboardingApi.event(route === '/app/tasks' ? 'onboarding_tasks_route_clicked' : 'onboarding_about_route_clicked', {
      projectId: completedProjectId,
    }).catch(() => {});
    await refreshUser();
    navigate(route, { replace: true });
  }

  async function handleSkip() {
    const confirmed = window.confirm('Без первичной настройки Luma IQ будет хуже понимать ваш проект. Вы сможете заполнить эти данные позже в разделе «О себе».');
    if (!confirmed) return;
    setSaving(true);
    setError('');
    try {
      await onboardingApi.skip(data);
      await refreshUser();
      navigate('/app/strategy/about', { replace: true });
    } catch {
      setError('Не удалось сохранить прогресс. Проверьте подключение и попробуйте ещё раз.');
    } finally {
      setSaving(false);
    }
  }

  const actions = (primaryLabel: string, onPrimary: () => void | Promise<void>, showBack = true) => (
    <div className={s.actions}>
      <div>
        {showBack && (
          <button className={s.secondary} type="button" onClick={() => void goToStep(step - 1)} disabled={saving}>
            Назад
          </button>
        )}
      </div>
      <div className={s.actionGroup}>
        {step === 1 && (
          <button className={s.ghost} type="button" onClick={() => void handleSkip()} disabled={saving}>
            Пропустить настройку
          </button>
        )}
        <button className={s.primary} type="button" onClick={() => void onPrimary()} disabled={saving}>
          {saving ? 'Сохраняю...' : primaryLabel}
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <main className={s.page}>
        <div className={s.shell}>
          <div className={s.card}>Загружаю onboarding...</div>
        </div>
      </main>
    );
  }

  return (
    <main className={s.page}>
      <div className={s.shell}>
        <div className={s.progress}>
          <span>Шаг {step} из {TOTAL_STEPS}</span>
          <div className={s.progressBar}>
            <div className={s.progressFill} style={{ width: `${progress}%` }} />
          </div>
        </div>

        <section className={s.card}>
          {step === 1 && (
            <>
              <h1 className={s.title}>Добро пожаловать в Luma IQ</h1>
              <p className={s.text}>
                Сейчас мы быстро настроим ваш первый проект.
                <br /><br />
                Вы ответите на несколько вопросов, а Luma IQ сохранит базовый контекст: кто вы, кому помогаете, что продаёте и в чём ваша экспертность.
                <br /><br />
                После этого сервис подготовит стартовый план задач и будет вести вас по шагам: от раздела «О себе» к позиционированию, целевой аудитории, УТП, продуктам и контенту.
              </p>
              {actions('Начать настройку', () => goToStep(2), false)}
            </>
          )}

          {step === 2 && (
            <>
              <h1 className={s.title}>Создайте первый проект</h1>
              <div className={s.form}>
                <label className={s.field}>
                  <span className={s.label}>Название проекта</span>
                  <input
                    className={s.input}
                    value={data.projectName ?? ''}
                    onChange={(event) => updateField('projectName', event.target.value)}
                    placeholder="Например: Анна — семейный психолог"
                  />
                </label>
                <label className={s.field}>
                  <span className={s.label}>Коротко: что это за проект?</span>
                  <textarea
                    className={s.textarea}
                    value={data.projectShortDescription ?? ''}
                    onChange={(event) => updateField('projectShortDescription', event.target.value)}
                    placeholder="Например: Помогаю парам, которые любят друг друга, но постоянно ссорятся по кругу, научиться разговаривать без обид, крика и отдаления."
                  />
                </label>
              </div>
              {actions('Далее', () => goToStep(3))}
            </>
          )}

          {step === 3 && (
            <>
              <h1 className={s.title}>Короткое резюме для ИИ</h1>
              <p className={s.text}>
                Эти данные Luma IQ будет использовать как базовый контекст для разделов «О себе», «Позиционирование», «Целевая аудитория», «УТП», «Продукты», «Контент» и «AI-диалог».
              </p>
              <div className={s.form}>
                <label className={s.field}>
                  <span className={s.label}>Кому вы помогаете?</span>
                  <textarea className={s.textarea} value={data.targetAudience ?? ''} onChange={(event) => updateField('targetAudience', event.target.value)} placeholder="Например: Собственникам бизнеса с отделом продаж 3–20 менеджеров, которые устали сами контролировать продажи и боятся снова нанять слабого РОПа." />
                </label>
                <label className={s.field}>
                  <span className={s.label}>Что вы продаёте?</span>
                  <textarea className={s.textarea} value={data.products ?? ''} onChange={(event) => updateField('products', event.target.value)} placeholder="Например: Консультации по найму РОПа, аудит отдела продаж, подбор РОПа под ключ, сопровождение внедрения РОПа." />
                </label>
                <label className={s.field}>
                  <span className={s.label}>В чём ваша сильная сторона?</span>
                  <textarea className={s.textarea} value={data.strengths ?? ''} onChange={(event) => updateField('strengths', event.target.value)} placeholder="Например: Умею отличать сильного РОПа от теоретика, диагностировать слабые места отдела продаж и выстраивать систему контроля, мотивации и отчётности." />
                </label>
              </div>
              {actions('Далее', () => goToStep(4))}
            </>
          )}

          {step === 4 && (
            <>
              <h1 className={s.title}>Ваш план задач готов</h1>
              <p className={s.text}>
                Luma IQ подготовит стартовый маршрут по упаковке проекта.
                <br /><br />
                В разделе «План задач» вы будете видеть, что делать дальше: какие разделы заполнить, какие материалы собрать и куда переходить после каждого шага.
              </p>
              <ul className={s.taskPreview}>
                {PREVIEW_TASKS.map((task) => (
                  <li className={s.taskItem} key={task.title}>
                    <div className={s.taskTitle}>{task.title}</div>
                    <div className={s.taskText}>{task.description}</div>
                  </li>
                ))}
              </ul>
              {actions('Понятно, продолжить', handleComplete)}
            </>
          )}

          {step === 5 && (
            <>
              <h1 className={s.title}>Проект создан</h1>
              <p className={s.text}>
                Мы сохранили базовый контекст проекта и подготовили стартовый план задач.
                <br /><br />
                Начните с первой задачи — заполните раздел «О себе». Это поможет Luma IQ точнее работать со стратегией, продуктами, контентом и AI-диалогом.
              </p>
              <div className={s.actions}>
                <div />
                <div className={s.actionGroup}>
                  <button className={s.secondary} type="button" onClick={() => void finish('/app/strategy/about')}>
                    Перейти сразу в «О себе»
                  </button>
                  <button className={s.primary} type="button" onClick={() => void finish('/app/tasks')}>
                    Открыть план задач
                  </button>
                </div>
              </div>
            </>
          )}

          {error && <div className={s.error}>{error}</div>}
        </section>
      </div>
    </main>
  );
}
