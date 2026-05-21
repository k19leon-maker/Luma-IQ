import { useEffect, useMemo, useRef, useState } from 'react';
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
    detail: 'Сужает рынок до понятного сегмента. Подходит, если у эксперта уже есть повторяемые кейсы в одной нише и понятный язык аудитории.',
    pros: 'Проще объяснять ценность, быстрее собирать доверие, легче делать контент под одну аудиторию.',
    cons: 'Можно слишком рано сузиться и потерять соседние платежеспособные сегменты.',
    money: 'Чек растет, если ниша платежеспособная и проблема дорогая.',
  },
  {
    title: 'По задаче / результату',
    type: 'По задаче клиента',
    note: 'Часто лучше продает, потому что говорит языком результата клиента, а не профессии эксперта.',
    detail: 'Ставит в центр не профессию эксперта, а конкретную задачу, ради которой клиент готов платить.',
    pros: 'Хорошо цепляет спрос, помогает быстро объяснить зачем покупать.',
    cons: 'Если результат слишком широкий, позиционирование снова становится generic.',
    money: 'Обычно дает сильный коммерческий фокус и понятную связь с продуктами.',
  },
  {
    title: 'По проблеме',
    type: 'Проблемное позиционирование',
    note: 'Полезно, когда аудитория остро осознает боль и ищет решение прямо сейчас.',
    detail: 'Работает от боли: человек узнает свою ситуацию и понимает, что эксперт специализируется именно на ней.',
    pros: 'Высокое узнавание, сильные хуки, хороший прогрев через контент.',
    cons: 'Может звучать слишком тревожно, если перегнуть с болью.',
    money: 'Сильнее всего работает там, где проблема уже стоит дорого для клиента.',
  },
  {
    title: 'По механизму',
    type: 'По авторскому механизму',
    note: 'Усиливает доверие и премиальность, если у эксперта есть понятная методология.',
    detail: 'Фокус на способе решения: метод, система, процесс, технология, авторский подход.',
    pros: 'Добавляет экспертность, отличает от “я просто консультирую”.',
    cons: 'Механизм должен быть понятным, иначе он усложнит продажу.',
    money: 'Поднимает чек, если механизм выглядит внедряемым и снижает риск для клиента.',
  },
  {
    title: 'По аудитории',
    type: 'По целевой аудитории',
    note: 'Помогает быстро сузиться и стать “своим” для конкретного сегмента.',
    detail: 'Показывает, для кого именно работает эксперт. Полезно, если аудитория хочет видеть “своего” специалиста.',
    pros: 'Проще писать контент, собирать кейсы и делать офферы под одну группу.',
    cons: 'Если аудитория описана слишком широко, модель не дает отличия.',
    money: 'Чек зависит от платежеспособности выбранного сегмента.',
  },
  {
    title: 'По роли / авторитету',
    type: 'По экспертной роли',
    note: 'Работает для премиального образа и сильной экспертной позиции.',
    detail: 'Формирует роль эксперта на рынке: архитектор, стратег, наставник, внедренец, редактор, продюсер.',
    pros: 'Создает статус, помогает выйти из товарного сравнения по цене.',
    cons: 'Нужны доказательства: кейсы, цифры, опыт, публичность или методология.',
    money: 'Хорошо работает для премиальных услуг и консультационных форматов.',
  },
  {
    title: 'По трансформации',
    type: 'По трансформации',
    note: 'Показывает путь из текущего состояния в желаемое и хорошо связывается с продуктами.',
    detail: 'Описывает переход клиента из точки А в точку Б. Хорошо подходит для упаковки воронки и продуктовой линейки.',
    pros: 'Дает понятную драматургию, сильные кейсы и ясное обещание.',
    cons: 'Трансформация должна быть конкретной, иначе будет звучать как мотивационный лозунг.',
    money: 'Повышает ценность, если точка Б измерима и важна для бизнеса или жизни клиента.',
  },
];

function extractVariantTitle(text: string): string {
  return text.split('\n')[0]?.replace(/^#+\s*/, '').trim() || 'Вариант позиционирования';
}

function cleanMarkdownLabel(value: string): string {
  return value.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();
}

function stripLeadingLabel(text: string): string {
  return text.replace(/^#+\s*/, '').replace(/^\d+[\).]\s*/, '').trim();
}

function getFieldValue(text: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`${escaped}:\\s*([^\\n]+)`, 'i'));
  return match?.[1]?.trim() ?? '';
}

function variantSummary(text: string): string {
  return getFieldValue(text, 'Формулировка') || stripLeadingLabel(text).split('\n').slice(0, 2).join(' ');
}

function variantType(text: string): string {
  return getFieldValue(text, 'Тип') || 'Стратегический вариант';
}

function extractFirstSentence(text: string): string {
  const clean = text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.split(/(?<=[.!?])\s+/)[0] || clean;
}

function renderLineWithAccent(line: string) {
  const labelMatch = line.match(/^([^:]{2,42}):\s*(.+)$/);
  if (!labelMatch) return line;
  return <><strong>{labelMatch[1]}:</strong> {labelMatch[2]}</>;
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
  return framework;
}

function parseSections(content: string) {
  if (!content.trim()) return [];
  const chunks = content
    .split(/\n(?=##+\s+|[А-ЯA-ZЁ][^:\n]{2,80}:\s*$)/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  return chunks.map((chunk) => {
    const lines = chunk.split('\n').map((line) => line.trim()).filter(Boolean);
    const rawTitle = lines[0] ?? 'Раздел';
    const hasHeading = /^##+\s+/.test(rawTitle) || /:\s*$/.test(rawTitle);
    return {
      title: hasHeading ? cleanMarkdownLabel(rawTitle).replace(/:\s*$/, '') : 'Ключевой вывод',
      body: hasHeading ? lines.slice(1).join('\n') : lines.join('\n'),
    };
  });
}

function MarkdownBlock({ content, compact = false }: { content: string; compact?: boolean }) {
  if (!content.trim()) return null;
  const lines = content.split('\n').map((line) => line.trim()).filter(Boolean);
  return (
    <div className={`${s.richText} ${compact ? s.richTextCompact : ''}`}>
      {lines.map((line, index) => {
        if (/^##+\s+/.test(line)) {
          return <h3 key={`${line}-${index}`}>{cleanMarkdownLabel(line)}</h3>;
        }
        if (/^[-—]\s+/.test(line)) {
          return <p className={s.bulletLine} key={`${line}-${index}`}>{renderLineWithAccent(line.replace(/^[-—]\s+/, ''))}</p>;
        }
        if (/^\d+[\).]\s+/.test(line)) {
          return <p className={s.bulletLine} key={`${line}-${index}`}>{renderLineWithAccent(line.replace(/^\d+[\).]\s+/, ''))}</p>;
        }
        return <p key={`${line}-${index}`}>{renderLineWithAccent(line)}</p>;
      })}
    </div>
  );
}

function updateTextLine(source: string, index: number, nextLine: string) {
  const lines = source.split('\n');
  lines[index] = nextLine;
  return lines.join('\n');
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
  const [previewVariant, setPreviewVariant] = useState('');
  const [variantDraft, setVariantDraft] = useState('');
  const [activeModelIndex, setActiveModelIndex] = useState(0);
  const [activeAnalysisIndex, setActiveAnalysisIndex] = useState(0);
  const [activeGapIndex, setActiveGapIndex] = useState(0);
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
  const analysisSections = useMemo(() => parseSections(analysis), [analysis]);
  const marketSections = useMemo(() => parseSections(marketGap), [marketGap]);
  const activeAnalysisSection = analysisSections[Math.min(activeAnalysisIndex, Math.max(analysisSections.length - 1, 0))];
  const activeGapSection = marketSections[Math.min(activeGapIndex, Math.max(marketSections.length - 1, 0))];
  const activeModel = POSITIONING_MODELS[activeModelIndex] ?? POSITIONING_MODELS[0];
  const effectivePreviewVariant = previewVariant || parsedVariants[0] || selectedVariant;
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
    if (!parsedVariants.length) return;
    if (!previewVariant || !parsedVariants.includes(previewVariant)) {
      setPreviewVariant(selectedVariant && parsedVariants.includes(selectedVariant) ? selectedVariant : parsedVariants[0]);
    }
  }, [parsedVariants, previewVariant, selectedVariant]);

  useEffect(() => {
    setVariantDraft(effectivePreviewVariant);
  }, [effectivePreviewVariant]);

  useEffect(() => {
    if (activeAnalysisIndex >= analysisSections.length) setActiveAnalysisIndex(0);
  }, [activeAnalysisIndex, analysisSections.length]);

  useEffect(() => {
    if (activeGapIndex >= marketSections.length) setActiveGapIndex(0);
  }, [activeGapIndex, marketSections.length]);

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
        setPreviewVariant(saved.selectedVariant ?? '');
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
      const nextVariants = parseVariants(variantsResp.content);
      setPreviewVariant(nextVariants[0] ?? '');
      setVariantDraft(nextVariants[0] ?? '');

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

  function confirmVariant() {
    const nextVariant = variantDraft.trim() || effectivePreviewVariant.trim();
    if (!nextVariant) {
      toast.error('Сначала выберите вариант позиционирования');
      return;
    }

    setSelectedVariant(nextVariant);
    setRole(getFieldValue(nextVariant, 'Кто вы') || role || [expertProfile?.role, expertProfile?.niche].filter(Boolean).join(', '));
    setAudience(getFieldValue(nextVariant, 'Для кого') || audience);
    setProblem(getFieldValue(nextVariant, 'Проблема') || problem);
    setResult(getFieldValue(nextVariant, 'Результат') || result);
    setMechanism(getFieldValue(nextVariant, 'Механизм') || mechanism);
    setDifferentiation(getFieldValue(nextVariant, 'Дифференциация') || differentiation);
    setProof(getFieldValue(nextVariant, 'Почему доверять') || getFieldValue(nextVariant, 'Почему может сработать') || proof);
    setActiveTab('final');
    toast.success('Вариант зафиксирован. Финальная сборка обновлена.');
  }

  function resetConfirmedVariant() {
    setSelectedVariant('');
    setActiveTab('variants');
    toast.success('Можно выбрать другой вариант');
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
            <button className={`${s.tab} ${activeTab === 'gap' ? s.activeTab : ''}`} onClick={() => setActiveTab('gap')}>Анализ рынка</button>
            <button className={`${s.tab} ${activeTab === 'models' ? s.activeTab : ''}`} onClick={() => setActiveTab('models')}>Модели позиционирования</button>
            <button className={`${s.tab} ${activeTab === 'variants' ? s.activeTab : ''}`} onClick={() => setActiveTab('variants')}>Варианты позиционирования</button>
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
                {analysisSections.length ? (
                  <div className={s.workbench}>
                    <div className={s.centerColumn}>
                      {analysisSections.map((section, index) => (
                        <button
                          className={`${s.itemCard} ${index === activeAnalysisIndex ? s.activeItemCard : ''}`}
                          key={`${section.title}-${index}`}
                          onClick={() => setActiveAnalysisIndex(index)}
                        >
                          <span>{section.title}</span>
                          <small>{extractFirstSentence(section.body).slice(0, 150)}</small>
                        </button>
                      ))}
                    </div>
                    <aside className={s.detailColumn}>
                      <div className={s.detailLabel}>Разбор</div>
                      <h3>{activeAnalysisSection?.title}</h3>
                      <MarkdownBlock content={activeAnalysisSection?.body ?? ''} compact />
                    </aside>
                  </div>
                ) : <EmptyState onRun={runLab} />}
              </section>
            ) : activeTab === 'models' ? (
              <section>
                <div className={s.sectionHead}>
                  <div>
                    <h2>Модели позиционирования</h2>
                    <p>Модели помогают выбрать не просто текст, а стратегию роли на рынке.</p>
                  </div>
                </div>
                <div className={s.workbench}>
                  <div className={s.centerColumn}>
                    {POSITIONING_MODELS.map((model, index) => (
                      <button
                        className={`${s.modelCard} ${index === activeModelIndex ? s.activeItemCard : ''}`}
                        key={model.type}
                        onClick={() => setActiveModelIndex(index)}
                      >
                        <div className={s.modelType}>{model.type}</div>
                        <h3>{model.title}</h3>
                        <p>{model.note}</p>
                      </button>
                    ))}
                  </div>
                  <aside className={s.detailColumn}>
                    <div className={s.detailLabel}>Как использовать</div>
                    <h3>{activeModel.title}</h3>
                    <p>{activeModel.detail}</p>
                    <div className={s.detailStack}>
                      <div><strong>Плюсы</strong><span>{activeModel.pros}</span></div>
                      <div><strong>Минусы</strong><span>{activeModel.cons}</span></div>
                      <div><strong>Чек</strong><span>{activeModel.money}</span></div>
                    </div>
                    {models ? (
                      <div className={s.miniNote}>
                        <strong>AI-комментарий по проекту</strong>
                        <MarkdownBlock content={models.slice(0, 950)} compact />
                      </div>
                    ) : null}
                  </aside>
                </div>
                {!models ? <EmptyState onRun={runLab} /> : null}
              </section>
            ) : activeTab === 'variants' ? (
              <section>
                <div className={s.sectionHead}>
                  <div>
                    <h2>Варианты позиционирования</h2>
                    <p>Клик по карточке только показывает описание. Финальная сборка изменится только после подтверждения выбора.</p>
                  </div>
                </div>
                {parsedVariants.length ? (
                  <div className={s.workbench}>
                    <div className={s.centerColumn}>
                      {parsedVariants.map((variant) => {
                        const previewActive = effectivePreviewVariant === variant;
                        const confirmed = selectedVariant === variant;
                        return (
                          <button
                            className={`${s.variantCard} ${previewActive ? s.activeItemCard : ''} ${confirmed ? s.confirmedVariant : ''} ${selectedVariant && !confirmed ? s.dimmedVariant : ''}`}
                            key={variant}
                            onClick={() => setPreviewVariant(variant)}
                          >
                            <div className={s.variantTopline}>
                              <span>{extractVariantTitle(variant)}</span>
                              {confirmed ? <b>✓</b> : null}
                            </div>
                            <em>{variantType(variant)}</em>
                            <small>{variantSummary(variant).slice(0, 190)}</small>
                          </button>
                        );
                      })}
                    </div>
                    <aside className={s.detailColumn}>
                      <div className={s.detailLabel}>{selectedVariant === effectivePreviewVariant ? 'Зафиксированный вариант' : 'Просмотр варианта'}</div>
                      <h3>{extractVariantTitle(effectivePreviewVariant)}</h3>
                      <EditableVariantPreview value={variantDraft} onChange={setVariantDraft} />

                      <div className={s.detailActions}>
                        <button className={s.primaryButton} onClick={confirmVariant}>✓ Выбрать этот вариант</button>
                        {selectedVariant ? <button className={s.secondaryButton} onClick={resetConfirmedVariant}>Выбрать заново</button> : null}
                      </div>
                      <p className={s.helperText}>Переключение карточек не тратит токены. Токены понадобятся только для новых AI-запросов.</p>
                    </aside>
                  </div>
                ) : <EmptyState onRun={runLab} />}
              </section>
            ) : activeTab === 'gap' ? (
              <section>
                <div className={s.sectionHead}>
                  <div>
                    <h2>Анализ рынка</h2>
                    <p>Где рынок перегрет, какие фразы ослабляют упаковку и где есть шанс занять более сильную позицию.</p>
                  </div>
                </div>
                {marketSections.length ? (
                  <div className={s.workbench}>
                    <div className={s.marketCards}>
                      {marketSections.map((section, index) => (
                        <button
                          className={`${s.marketCard} ${index === activeGapIndex ? s.activeItemCard : ''}`}
                          key={`${section.title}-${index}`}
                          onClick={() => setActiveGapIndex(index)}
                        >
                          <span>{section.title}</span>
                          <small>{extractFirstSentence(section.body).slice(0, 160)}</small>
                        </button>
                      ))}
                    </div>
                    <aside className={s.detailColumn}>
                      <div className={s.detailLabel}>Фокус анализа</div>
                      <h3>{activeGapSection?.title}</h3>
                      <MarkdownBlock content={activeGapSection?.body ?? ''} compact />
                    </aside>
                  </div>
                ) : <EmptyState onRun={runLab} />}
              </section>
            ) : (
              <section>
                <div className={s.sectionHead}>
                  <div>
                    <h2>Финальное позиционирование</h2>
                    <p>Соберите финальное позиционирование. Оно будет использоваться в ЦА, УТП, продуктах, контенте и ИИ-диалоге.</p>
                  </div>
                </div>

                <div className={s.finalWorkbench}>
                  <div className={s.constructorGrid}>
                    <Field label="Кто вы" value={role} onChange={setRole} placeholder="Эксперт по построению отделов продаж" />
                    <Field label="Для кого" value={audience} onChange={setAudience} placeholder="Для онлайн-школ и экспертного бизнеса" />
                    <Field label="С какой проблемой" value={problem} onChange={setProblem} placeholder="Собственник завязан на продажах" />
                    <Field label="К какому результату" value={result} onChange={setResult} placeholder="Отдел продаж работает без ручного контроля" />
                    <Field label="Через какой механизм" value={mechanism} onChange={setMechanism} placeholder="Найм РОПа + система управления" />
                    <Field label="Чем отличаетесь" value={differentiation} onChange={setDifferentiation} placeholder="Не консультирую, а внедряю под ключ" />
                    <Field label="Почему доверять" value={proof} onChange={setProof} placeholder="Кейсы, цифры, опыт, регалии" />
                  </div>

                  <aside className={s.finalPreview}>
                    <div className={s.boxTitle}>Итоговая формулировка</div>
                    {finalStatement ? (
                      <MarkdownBlock content={finalStatement} compact />
                    ) : (
                      <p className={s.placeholderText}>Зафиксируйте вариант позиционирования или заполните конструктор вручную.</p>
                    )}
                    {selectedVariant ? (
                      <button className={s.textButton} onClick={() => setActiveTab('variants')}>Посмотреть выбранный вариант</button>
                    ) : (
                      <button className={s.textButton} onClick={() => setActiveTab('variants')}>Выбрать вариант</button>
                    )}
                  </aside>
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
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = 'auto';
    ref.current.style.height = `${ref.current.scrollHeight}px`;
  }, [value]);

  return (
    <label className={s.field}>
      <span>{label}</span>
      <textarea ref={ref} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={2} />
    </label>
  );
}

function EditableVariantPreview({ value, onChange }: {
  value: string;
  onChange: (value: string) => void;
}) {
  const lines = value.split('\n');

  if (!value.trim()) {
    return <p className={s.placeholderText}>Выберите вариант слева, чтобы посмотреть и отредактировать его.</p>;
  }

  return (
    <div className={s.editablePreview}>
      {lines.map((line, index) => {
        const heading = line.match(/^###\s*(.+)$/);
        const labelMatch = line.match(/^([^:]{2,34}):\s*(.*)$/);

        if (heading) {
          return (
            <AutoGrowInput
              className={s.editableHeading}
              key={`${index}-heading`}
              value={heading[1]}
              onChange={(next) => onChange(updateTextLine(value, index, `### ${next}`))}
            />
          );
        }

        if (labelMatch) {
          return (
            <label className={s.editableFact} key={`${index}-${labelMatch[1]}`}>
              <strong>{labelMatch[1]}:</strong>
              <AutoGrowInput
                value={labelMatch[2]}
                onChange={(next) => onChange(updateTextLine(value, index, `${labelMatch[1]}: ${next}`))}
              />
            </label>
          );
        }

        if (!line.trim()) {
          return <div className={s.editableSpacer} key={`${index}-empty`} />;
        }

        return (
          <AutoGrowInput
            key={`${index}-plain`}
            value={line}
            onChange={(next) => onChange(updateTextLine(value, index, next))}
          />
        );
      })}
    </div>
  );
}

function AutoGrowInput({ value, onChange, className }: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = 'auto';
    ref.current.style.height = `${ref.current.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      className={className}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      rows={1}
    />
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
