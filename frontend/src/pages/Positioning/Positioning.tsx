import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { projectsApi } from '../../api/projects.api';
import { useProgressStore } from '../../store/progress.store';
import { useProjectsStore } from '../../store/projects.store';
import { useMaterialsStore } from '../../store/materials.store';
import { buildPositioningMaterial } from '../../utils/projectMaterials';
import s from './Positioning.module.css';

export interface PositioningData {
  role: string;
  audience: string;
  problem: string;
  result: string;
  statement: string;
  completed: boolean;
  updatedAt: string;
}

interface ExpertProfileData {
  name?: string;
  role?: string;
  niche?: string;
  summary?: string;
}

const examples = [
  'Я психолог для женщин после расставания, помогаю вернуть опору на себя и спокойно строить новые отношения.',
  'Я нутрициолог для женщин 35+, помогаю снижать вес без жестких диет и срывов.',
  'Я фитнес-тренер для взрослых новичков, помогаю прийти в форму без травм и перегруза.',
  'Я детский психолог для родителей детей 6-10 лет, помогаю справляться с тревожностью и сложным поведением.',
];

function buildStatement(role: string, audience: string, problem: string, result: string): string {
  const r = role.trim() || '[кто вы как эксперт]';
  const a = audience.trim() || '[с кем хотите работать]';
  const p = problem.trim() || '[с какой темой или проблемой помогаете]';
  const res = result.trim() || '[к какому результату ведете]';
  return `Я ${r} для ${a}. Помогаю с ${p}, чтобы ${res}.`;
}

export default function Positioning() {
  const navigate = useNavigate();
  const activeProjectId = useProjectsStore((st) => st.activeProjectId);
  const completePositioning = useProgressStore((st) => st.completePositioning);
  const upsertMaterial = useMaterialsStore((st) => st.upsertMaterial);

  const [role, setRole] = useState('');
  const [audience, setAudience] = useState('');
  const [problem, setProblem] = useState('');
  const [result, setResult] = useState('');
  const [expertProfile, setExpertProfile] = useState<ExpertProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const statement = useMemo(() => buildStatement(role, audience, problem, result), [role, audience, problem, result]);
  const canSave = role.trim() && audience.trim() && problem.trim() && result.trim();

  useEffect(() => {
    if (!activeProjectId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    projectsApi.getStrategy(activeProjectId)
      .then((data) => {
        const saved = (data as Record<string, unknown> | null)?.['positioningData'] as Partial<PositioningData> | undefined;
        const expert = (data as Record<string, unknown> | null)?.['expertProfileData'] as ExpertProfileData | undefined;
        setExpertProfile(expert ?? null);
        if (!saved && expert) {
          setRole([expert.role, expert.niche].filter(Boolean).join(', '));
          return;
        }
        if (!saved) return;
        setRole(saved.role ?? '');
        setAudience(saved.audience ?? '');
        setProblem(saved.problem ?? '');
        setResult(saved.result ?? '');
      })
      .catch(() => toast.error('Не удалось загрузить позиционирование'))
      .finally(() => setLoading(false));
  }, [activeProjectId]);

  async function save(goNext: boolean) {
    if (!activeProjectId) {
      toast.error('Сначала создайте проект');
      return;
    }
    if (!canSave) {
      toast.error('Заполните 4 коротких поля');
      return;
    }

    const positioningData: PositioningData = {
      role: role.trim(),
      audience: audience.trim(),
      problem: problem.trim(),
      result: result.trim(),
      statement,
      completed: true,
      updatedAt: new Date().toISOString(),
    };

    setSaving(true);
    try {
      await projectsApi.saveStrategy(activeProjectId, { positioningData });
      upsertMaterial(activeProjectId, buildPositioningMaterial(positioningData));
      completePositioning();
      toast.success('Позиционирование сохранено');
      if (goNext) navigate('/strategy/audience');
    } catch {
      toast.error('Не удалось сохранить позиционирование');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={s.root}>
      <div className={s.shell}>
        <div className={s.header}>
          <h1 className={s.title}>Позиционирование</h1>
          <p className={s.subtitle}>
            Выберите стартовый стратегический вектор на базе брифа «О себе»: для кого вы будете упаковываться, с какой темой и к какому результату.
          </p>
        </div>

        {expertProfile ? (
          <div className={s.notice}>
            <div className={s.noticeTitle}>Бриф «О себе» подключен</div>
            <div className={s.noticeText}>{expertProfile.summary || [expertProfile.name, expertProfile.role, expertProfile.niche].filter(Boolean).join(' · ')}</div>
          </div>
        ) : (
          <div className={s.notice}>
            <div className={s.noticeTitle}>Сначала лучше заполнить «О себе»</div>
            <div className={s.noticeText}>Позиционирование станет точнее, если ИИ будет знать имя, роль, опыт, регалии, продукты и ограничения эксперта.</div>
            <button className={s.linkButton} onClick={() => navigate('/strategy/about')}>Перейти к брифу</button>
          </div>
        )}

        <div className={s.layout}>
          <div className={s.card}>
            {loading ? (
              <div className={s.hint}>Загрузка...</div>
            ) : (
              <>
                <div className={s.field}>
                  <label className={s.label}>Кто вы как эксперт?</label>
                  <div className={s.hint}>Например: психолог, нутрициолог, фитнес-тренер, коуч, репетитор.</div>
                  <input className={s.input} value={role} onChange={(e) => setRole(e.target.value)} placeholder="психолог по отношениям" />
                </div>

                <div className={s.field}>
                  <label className={s.label}>С кем вы хотите работать в первую очередь?</label>
                  <div className={s.hint}>Широкая аудитория без глубокой сегментации.</div>
                  <input className={s.input} value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="женщин 30-45 в кризисе отношений" />
                </div>

                <div className={s.field}>
                  <label className={s.label}>С какой главной темой или проблемой вы помогаете?</label>
                  <div className={s.hint}>Одна крупная тема, вокруг которой будет строиться ЦА.</div>
                  <input className={s.input} value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="пережить расставание и не возвращаться в токсичные отношения" />
                </div>

                <div className={s.field}>
                  <label className={s.label}>К какому результату вы хотите привести клиента?</label>
                  <div className={s.hint}>Простой результат на языке клиента.</div>
                  <input className={s.input} value={result} onChange={(e) => setResult(e.target.value)} placeholder="вернуть опору на себя и спокойно строить новые отношения" />
                </div>

                <div>
                  <div className={s.previewTitle}>Базовая формулировка</div>
                  <div className={s.statement}>{statement}</div>
                </div>

                <div className={s.actions}>
                  <button className={`${s.button} ${s.secondary}`} onClick={() => void save(false)} disabled={saving || !canSave}>
                    Сохранить
                  </button>
                  <button className={s.button} onClick={() => void save(true)} disabled={saving || !canSave}>
                    {saving ? 'Сохраняю...' : 'Сохранить и перейти к ЦА'}
                  </button>
                </div>
              </>
            )}
          </div>

          <aside className={s.card}>
            <div className={s.previewTitle}>Примеры</div>
            <div className={s.sideList}>
              {examples.map((item) => (
                <div className={s.example} key={item}>{item}</div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
