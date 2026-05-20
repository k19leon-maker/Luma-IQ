import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { aiApi } from '../../api/ai';
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
  mechanism?: string;
  differentiation?: string;
  proof?: string;
  selectedVariant?: string;
  strategicAnalysis?: string;
  positioningModels?: string;
  variants?: string;
  marketGap?: string;
  score?: string;
  assets?: string;
  statement: string;
  completed: boolean;
  updatedAt: string;
}

interface ExpertProfileData {
  name?: string;
  role?: string;
  niche?: string;
  summary?: string;
  competencies?: string;
  achievements?: string;
}

const POSITIONING_MODELS = [
  {
    title: 'По нише',
    type: 'Нишевое позиционирование',
    note: 'Хорошо работает, когда ниша уже понятна и у эксперта есть сильные кейсы в одном рынке.',
  },
  {
    title: 'По задаче / результату',
    type: 'По задаче клиента',
    note: 'Часто лучше продает, потому что говорит языком результата клиента, а не профессии эксперта.',
  },
  {
    title: 'По проблеме',
    type: 'Проблемное позиционирование',
    note: 'Полезно, когда аудитория остро осознает боль и ищет решение прямо сейчас.',
  },
  {
    title: 'По механизму',
    type: 'По авторскому механизму',
    note: 'Усиливает доверие и премиальность, если у эксперта есть понятная методология.',
  },
  {
    title: 'По аудитории',
    type: 'По целевой аудитории',
    note: 'Помогает быстро сузиться и стать “своим” для конкретного сегмента.',
  },
  {
    title: 'По роли / авторитету',
    type: 'По экспертной роли',
    note: 'Работает для премиального образа и сильной экспертной позиции.',
  },
  {
    title: 'По трансформации',
    type: 'По трансформации',
    note: 'Показывает путь из текущего состояния в желаемое и хорошо связывается с продуктами.',
  },
];

function extractVariantTitle(text: string): string {
  return text.split('\n')[0]?.replace(/^#+\s*/, '').trim() || 'Вариант позиционирования';
}

function parseVariants(content: string): string[] {
  const chunks = content
    .split(/\n(?=###\s+)/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (chunks.length > 1) return chunks;
  return content
    .split(/\n(?=\d+[\).]\s+)/)
    .map((item) => item.trim())
    .filter((item) => item.length > 80);
}

function buildStatement(data: {
  role: string;
  audience: string;
  problem: string;
  result: string;
  mechanism: string;
  differentiation: string;
  proof: string;
  selectedVariant: string;
}): string {
  const framework = [
    data.role ? `Кто вы: ${data.role}` : '',
    data.audience ? `Для кого: ${data.audience}` : '',
    data.problem ? `Проблема: ${data.problem}` : '',
    data.result ? `Результат: ${data.result}` : '',
    data.mechanism ? `Механизм: ${data.mechanism}` : '',
    data.differentiation ? `Отличие: ${data.differentiation}` : '',
    data.proof ? `Почему доверять: ${data.proof}` : '',
  ].filter(Boolean).join('\n');
  const selected = data.selectedVariant ? `Выбранный стратегический вариант:\n${data.selectedVariant}` : '';

  return [selected, framework].filter(Boolean).join('\n\n');
}

function MarkdownBlock({ content }: { content: string }) {
  if (!content.trim()) return null;
  return <pre className={s.markdown}>{content}</pre>;
}

export default function Positioning() {
  const navigate = useNavigate();
  const activeProjectId = useProjectsStore((st) => st.activeProjectId);
  const completePositioning = useProgressStore((st) => st.completePositioning);
  const upsertMaterial = useMaterialsStore((st) => st.upsertMaterial);

  const [expertProfile, setExpertProfile] = useState<ExpertProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [briefExpanded, setBriefExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'analysis' | 'models' | 'variants' | 'gap' | 'final'>('analysis');

  const [analysis, setAnalysis] = useState('');
  const [models, setModels] = useState('');
  const [variants, setVariants] = useState('');
  const [marketGap, setMarketGap] = useState('');
  const [selectedVariant, setSelectedVariant] = useState('');
  const [role, setRole] = useState('');
  const [audience, setAudience] = useState('');
  const [problem, setProblem] = useState('');
  const [result, setResult] = useState('');
  const [mechanism, setMechanism] = useState('');
  const [differentiation, setDifferentiation] = useState('');
  const [proof, setProof] = useState('');
  const [score, setScore] = useState('');
  const [assets, setAssets] = useState('');

  const parsedVariants = useMemo(() => parseVariants(variants), [variants]);
  const finalStatement = useMemo(() => buildStatement({
    role,
    audience,
    problem,
    result,
    mechanism,
    differentiation,
    proof,
    selectedVariant,
  }), [audience, differentiation, mechanism, problem, proof, result, role, selectedVariant]);
  const canFinalize = Boolean(selectedVariant.trim() || (role.trim() && audience.trim() && problem.trim() && result.trim()));
  const briefText = useMemo(() => {
    if (!expertProfile) return '';
    return expertProfile.summary || [expertProfile.name, expertProfile.role, expertProfile.niche].filter(Boolean).join(' · ');
  }, [expertProfile]);
  const briefPreview = useMemo(() => {
    const lines = briefText.split('\n').map((line) => line.trim()).filter(Boolean);
    return lines.slice(0, 4).join('\n');
  }, [briefText]);
  const briefCanToggle = briefText.trim() && briefText.trim() !== briefPreview.trim();

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

        if (!saved) {
          setRole([expert?.role, expert?.niche].filter(Boolean).join(', '));
          return;
        }

        setRole(saved.role ?? [expert?.role, expert?.niche].filter(Boolean).join(', '));
        setAudience(saved.audience ?? '');
        setProblem(saved.problem ?? '');
        setResult(saved.result ?? '');
        setMechanism(saved.mechanism ?? '');
        setDifferentiation(saved.differentiation ?? '');
        setProof(saved.proof ?? '');
        setSelectedVariant(saved.selectedVariant ?? '');
        setAnalysis(saved.strategicAnalysis ?? '');
        setModels(saved.positioningModels ?? '');
        setVariants(saved.variants ?? '');
        setMarketGap(saved.marketGap ?? '');
        setScore(saved.score ?? '');
        setAssets(saved.assets ?? '');
      })
      .catch(() => toast.error('Не удалось загрузить позиционирование'))
      .finally(() => setLoading(false));
  }, [activeProjectId]);

  async function runLab() {
    if (!activeProjectId) {
      toast.error('Сначала создайте проект');
      return;
    }

    setRunning(true);
    try {
      toast.loading('ИИ изучает бриф и собирает стратегический анализ...', { id: 'positioning-lab' });
      const analysisResp = await aiApi.startWorkflow('positioning.analysis.generate', {
        projectId: activeProjectId,
        inputs: { currentHypothesis: finalStatement },
      });
      setAnalysis(analysisResp.content);

      toast.loading('ИИ сравнивает модели позиционирования...', { id: 'positioning-lab' });
      const modelsResp = await aiApi.startWorkflow('positioning.models.generate', {
        projectId: activeProjectId,
        inputs: { analysis: analysisResp.content },
      });
      setModels(modelsResp.content);

      toast.loading('ИИ генерирует стратегические варианты...', { id: 'positioning-lab' });
      const variantsResp = await aiApi.startWorkflow('positioning.variants.generate', {
        projectId: activeProjectId,
        inputs: { analysis: analysisResp.content },
      });
      setVariants(variantsResp.content);

      toast.loading('ИИ ищет рыночные возможности и премиальные углы...', { id: 'positioning-lab' });
      const gapResp = await aiApi.startWorkflow('positioning.gap-analysis.generate', {
        projectId: activeProjectId,
        inputs: { variants: variantsResp.content },
      });
      setMarketGap(gapResp.content);
      setActiveTab('variants');
      toast.success('Лаборатория позиционирования собрана', { id: 'positioning-lab' });
    } catch {
      toast.error('Не удалось собрать лабораторию позиционирования', { id: 'positioning-lab' });
    } finally {
      setRunning(false);
    }
  }

  async function runScore() {
    if (!activeProjectId || !canFinalize) {
      toast.error('Сначала выберите или соберите финальное позиционирование');
      return;
    }

    setRunning(true);
    try {
      const resp = await aiApi.startWorkflow('positioning.score.generate', {
        projectId: activeProjectId,
        inputs: { finalPositioning: finalStatement },
      });
      setScore(resp.content);
      setActiveTab('final');
      toast.success('Скоринг обновлен');
    } catch {
      toast.error('Не удалось оценить позиционирование');
    } finally {
      setRunning(false);
    }
  }

  async function runAssets() {
    if (!activeProjectId || !canFinalize) {
      toast.error('Сначала выберите или соберите финальное позиционирование');
      return;
    }

    setRunning(true);
    try {
      const resp = await aiApi.startWorkflow('positioning.assets.generate', {
        projectId: activeProjectId,
        inputs: { finalPositioning: finalStatement },
      });
      setAssets(resp.content);
      setActiveTab('final');
      toast.success('Материалы позиционирования сгенерированы');
    } catch {
      toast.error('Не удалось сгенерировать assets');
    } finally {
      setRunning(false);
    }
  }

  async function save(goNext: boolean) {
    if (!activeProjectId) {
      toast.error('Сначала создайте проект');
      return;
    }
    if (!canFinalize) {
      toast.error('Сначала выберите или соберите финальное позиционирование');
      return;
    }

    const positioningData: PositioningData = {
      role: role.trim(),
      audience: audience.trim(),
      problem: problem.trim(),
      result: result.trim(),
      mechanism: mechanism.trim(),
      differentiation: differentiation.trim(),
      proof: proof.trim(),
      selectedVariant: selectedVariant.trim(),
      strategicAnalysis: analysis,
      positioningModels: models,
      variants,
      marketGap,
      score,
      assets,
      statement: finalStatement.trim(),
      completed: true,
      updatedAt: new Date().toISOString(),
    };

    setSaving(true);
    try {
      await projectsApi.saveStrategy(activeProjectId, { positioningData });
      upsertMaterial(activeProjectId, buildPositioningMaterial(positioningData));
      completePositioning();
      toast.success('Позиционирование сохранено как ядро проекта');
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
        <div className={s.hero}>
          <div>
            <div className={s.kicker}>Лаборатория позиционирования</div>
            <h1 className={s.title}>Позиционирование</h1>
            <p className={s.subtitle}>
              ИИ анализирует бриф «О себе», предлагает стратегические углы, показывает рыночные возможности и помогает зафиксировать позиционирование как ядро проекта.
            </p>
          </div>
          <button className={s.primaryButton} onClick={() => void runLab()} disabled={running || loading || !activeProjectId}>
            {running ? 'ИИ работает...' : analysis ? 'Пересобрать лабораторию' : 'Запустить ИИ-анализ'}
          </button>
        </div>

        {expertProfile ? (
          <div className={s.contextBar}>
            <div>
              <div className={s.contextLabel}>Бриф «О себе» подключен</div>
              <div className={`${s.contextText} ${briefExpanded ? s.contextTextExpanded : s.contextTextCollapsed}`}>
                {briefExpanded ? briefText : briefPreview}
                {!briefExpanded && briefCanToggle ? '\n...' : ''}
              </div>
            </div>
            <div className={s.briefActions}>
              {briefCanToggle && !briefExpanded && (
                <button className={s.textButton} onClick={() => setBriefExpanded(true)}>Развернуть бриф</button>
              )}
              {briefCanToggle && briefExpanded && (
                <button className={s.textButton} onClick={() => setBriefExpanded(false)}>Свернуть бриф</button>
              )}
              <button className={s.textButton} onClick={() => navigate('/strategy/about')}>Открыть раздел «О себе»</button>
            </div>
          </div>
        ) : (
          <div className={s.contextBar}>
            <div>
              <div className={s.contextLabel}>Бриф «О себе» пока пустой</div>
              <div className={s.contextText}>Лаборатория станет точнее, если ИИ будет знать опыт, регалии, продукты, ограничения и сильные кейсы.</div>
            </div>
            <button className={s.textButton} onClick={() => navigate('/strategy/about')}>Заполнить «О себе»</button>
          </div>
        )}

        <div className={s.grid}>
          <aside className={s.sidebar}>
            <button className={`${s.tab} ${activeTab === 'analysis' ? s.activeTab : ''}`} onClick={() => setActiveTab('analysis')}>Стратегический анализ</button>
            <button className={`${s.tab} ${activeTab === 'models' ? s.activeTab : ''}`} onClick={() => setActiveTab('models')}>Модели позиционирования</button>
            <button className={`${s.tab} ${activeTab === 'variants' ? s.activeTab : ''}`} onClick={() => setActiveTab('variants')}>Варианты позиционирования</button>
            <button className={`${s.tab} ${activeTab === 'gap' ? s.activeTab : ''}`} onClick={() => setActiveTab('gap')}>Анализ рынка</button>
            <button className={`${s.tab} ${activeTab === 'final' ? s.activeTab : ''}`} onClick={() => setActiveTab('final')}>Финальная сборка</button>

            <div className={s.sideCard}>
              <div className={s.sideTitle}>Статус</div>
              <div className={s.statusList}>
                <span className={analysis ? s.done : ''}>Анализ</span>
                <span className={variants ? s.done : ''}>Варианты</span>
                <span className={selectedVariant ? s.done : ''}>Выбор</span>
                <span className={finalStatement ? s.done : ''}>Финал</span>
              </div>
            </div>
          </aside>

          <main className={s.panel}>
            {loading ? (
              <div className={s.empty}>Загрузка...</div>
            ) : activeTab === 'analysis' ? (
              <section>
                <div className={s.sectionHead}>
                  <div>
                    <h2>Стратегический анализ</h2>
                    <p>ИИ показывает, где у эксперта сильная ценность, авторитет, дифференциация и премиальный потенциал.</p>
                  </div>
                </div>
                {analysis ? <MarkdownBlock content={analysis} /> : <EmptyState onRun={runLab} />}
              </section>
            ) : activeTab === 'models' ? (
              <section>
                <div className={s.sectionHead}>
                  <div>
                    <h2>Модели позиционирования</h2>
                    <p>Модели помогают выбрать не просто текст, а стратегию роли на рынке.</p>
                  </div>
                </div>
                <div className={s.modelGrid}>
                  {POSITIONING_MODELS.map((model) => (
                    <div className={s.modelCard} key={model.type}>
                      <div className={s.modelType}>{model.type}</div>
                      <h3>{model.title}</h3>
                      <p>{model.note}</p>
                    </div>
                  ))}
                </div>
                {models ? <MarkdownBlock content={models} /> : <EmptyState onRun={runLab} />}
              </section>
            ) : activeTab === 'variants' ? (
              <section>
                <div className={s.sectionHead}>
                  <div>
                    <h2>Варианты позиционирования</h2>
                    <p>Выберите один вариант, комбинируйте с другими или используйте как черновик для финального конструктора.</p>
                  </div>
                </div>
                {parsedVariants.length ? (
                  <div className={s.variantGrid}>
                    {parsedVariants.map((variant) => {
                      const active = selectedVariant === variant;
                      return (
                        <button className={`${s.variantCard} ${active ? s.selectedVariant : ''}`} key={variant} onClick={() => setSelectedVariant(variant)}>
                          <span>{extractVariantTitle(variant)}</span>
                          <small>{variant.replace(/^###\s*/, '').slice(0, 260)}...</small>
                        </button>
                      );
                    })}
                  </div>
                ) : <EmptyState onRun={runLab} />}
                {variants ? <MarkdownBlock content={variants} /> : null}
              </section>
            ) : activeTab === 'gap' ? (
              <section>
                <div className={s.sectionHead}>
                  <div>
                    <h2>Анализ рынка</h2>
                    <p>Где рынок перегрет, какие фразы ослабляют упаковку и где есть шанс занять более сильную позицию.</p>
                  </div>
                </div>
                {marketGap ? <MarkdownBlock content={marketGap} /> : <EmptyState onRun={runLab} />}
              </section>
            ) : (
              <section>
                <div className={s.sectionHead}>
                  <div>
                    <h2>Финальное позиционирование</h2>
                    <p>Соберите финальное позиционирование. Оно будет использоваться в ЦА, УТП, продуктах, контенте и ИИ-диалоге.</p>
                  </div>
                </div>

                {selectedVariant ? (
                  <div className={s.selectedBox}>
                    <div className={s.boxTitle}>Выбранный стратегический вариант</div>
                    <MarkdownBlock content={selectedVariant} />
                  </div>
                ) : null}

                <div className={s.constructorGrid}>
                  <Field label="Кто вы" value={role} onChange={setRole} placeholder="Эксперт по построению отделов продаж" />
                  <Field label="Для кого" value={audience} onChange={setAudience} placeholder="Для онлайн-школ и экспертного бизнеса" />
                  <Field label="С какой проблемой" value={problem} onChange={setProblem} placeholder="Собственник завязан на продажах" />
                  <Field label="К какому результату" value={result} onChange={setResult} placeholder="Отдел продаж работает без ручного контроля" />
                  <Field label="Через какой механизм" value={mechanism} onChange={setMechanism} placeholder="Найм РОПа + система управления" />
                  <Field label="Чем отличаетесь" value={differentiation} onChange={setDifferentiation} placeholder="Не консультирую, а внедряю под ключ" />
                  <Field label="Почему доверять" value={proof} onChange={setProof} placeholder="Кейсы, цифры, опыт, регалии" />
                </div>

                <div className={s.finalPreview}>
                  <div className={s.boxTitle}>Финальная сборка</div>
                  <pre>{finalStatement || 'Выберите вариант или заполните конструктор.'}</pre>
                </div>

                <div className={s.actionRow}>
                  <button className={s.secondaryButton} onClick={() => void runScore()} disabled={running || !canFinalize}>Оценить позиционирование</button>
                  <button className={s.secondaryButton} onClick={() => void runAssets()} disabled={running || !canFinalize}>Сгенерировать материалы</button>
                  <button className={s.secondaryButton} onClick={() => void save(false)} disabled={saving || !canFinalize}>Сохранить</button>
                  <button className={s.primaryButton} onClick={() => void save(true)} disabled={saving || !canFinalize}>
                    {saving ? 'Сохраняю...' : 'Сохранить и перейти к ЦА'}
                  </button>
                </div>

                {score ? (
                  <div className={s.resultBlock}>
                    <div className={s.boxTitle}>Оценка позиционирования</div>
                    <MarkdownBlock content={score} />
                  </div>
                ) : null}

                {assets ? (
                  <div className={s.resultBlock}>
                    <div className={s.boxTitle}>Материалы позиционирования</div>
                    <MarkdownBlock content={assets} />
                  </div>
                ) : null}
              </section>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className={s.field}>
      <span>{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={3} />
    </label>
  );
}

function EmptyState({ onRun }: { onRun: () => void }) {
  return (
    <div className={s.empty}>
      <div className={s.emptyTitle}>Лаборатория еще не собрана</div>
      <p>Запустите ИИ-анализ, чтобы получить стратегический обзор, модели, варианты и анализ рынка.</p>
      <button className={s.primaryButton} onClick={() => void onRun()}>Запустить ИИ-анализ</button>
    </div>
  );
}
