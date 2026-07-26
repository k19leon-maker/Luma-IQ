import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { aiApi } from '../../api/ai';
import { projectsApi } from '../../api/projects.api';
import { useProgressStore } from '../../store/progress.store';
import { useProjectsStore } from '../../store/projects.store';
import { useMaterialsStore } from '../../store/materials.store';
import type { AiResultVersion } from '../../store/generated.store';
import { buildPositioningMaterial } from '../../utils/projectMaterials';
import { makeAiIdempotencyKey } from '../../utils/aiIdempotency';
import AiWorkflowCost from '../../components/AiWorkflowCost/AiWorkflowCost';
import {
  EditableVariantPreview,
  EmptyState,
  Field,
  MarkdownBlock,
  POSITIONING_MODELS,
  buildStatement,
  extractVariantTitle,
  getFieldValue,
  parseVariants,
  variantSummary,
  variantType,
} from './positioning.helpers';
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
  versionHistory?: AiResultVersion<PositioningData>[];
}

interface ExpertProfileData {
  whoYouAre?: string;
  targetAudience?: string;
  aiSummary?: string;
  name?: string;
  role?: string;
  niche?: string;
  summary?: string;
  competencies?: string;
  achievements?: string;
}

function getApiErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const response = (error as { response?: { data?: { error?: unknown; message?: unknown } } }).response;
  const message = response?.data?.error ?? response?.data?.message;
  return typeof message === 'string' && message.trim() ? message : null;
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
  const [activeTab, setActiveTab] = useState<'models' | 'variants' | 'final'>('variants');

  const [variants, setVariants] = useState('');
  const [selectedVariant, setSelectedVariant] = useState('');
  const [previewVariant, setPreviewVariant] = useState('');
  const [variantDraft, setVariantDraft] = useState('');
  const [activeModelIndex, setActiveModelIndex] = useState(0);
  const [role, setRole] = useState('');
  const [audience, setAudience] = useState('');
  const [problem, setProblem] = useState('');
  const [result, setResult] = useState('');
  const [mechanism, setMechanism] = useState('');
  const [differentiation, setDifferentiation] = useState('');
  const [proof, setProof] = useState('');
  const [score, setScore] = useState('');
  const [assets, setAssets] = useState('');
  const [versionHistory, setVersionHistory] = useState<AiResultVersion<PositioningData>[]>([]);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const parsedVariants = useMemo(() => parseVariants(variants), [variants]);
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
  const positioningDraft = useMemo<PositioningData>(() => ({
    role: role.trim(),
    audience: audience.trim(),
    problem: problem.trim(),
    result: result.trim(),
    mechanism: mechanism.trim(),
    differentiation: differentiation.trim(),
    proof: proof.trim(),
    selectedVariant: selectedVariant.trim(),
    variants,
    score,
    assets,
    statement: finalStatement.trim(),
    completed: canFinalize,
    updatedAt: new Date().toISOString(),
    versionHistory,
  }), [assets, audience, canFinalize, differentiation, finalStatement, mechanism, problem, proof, result, role, score, selectedVariant, variants, versionHistory]);
  const hasPositioningDraft = Boolean(
    variants.trim() ||
    selectedVariant.trim() ||
    finalStatement.trim(),
  );
  const briefText = useMemo(() => {
    if (!expertProfile) return '';
    return expertProfile.aiSummary
      || expertProfile.summary
      || [expertProfile.name, expertProfile.whoYouAre, expertProfile.targetAudience, expertProfile.role, expertProfile.niche].filter(Boolean).join(' · ');
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
    if (!activeProjectId || loading || !hasPositioningDraft) return;

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      projectsApi.saveStrategy(activeProjectId, { positioningData: positioningDraft }).catch(() => {});
    }, 900);

    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [activeProjectId, hasPositioningDraft, loading, positioningDraft]);

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
          setRole([expert?.whoYouAre, expert?.targetAudience, expert?.role, expert?.niche].filter(Boolean).join(', '));
          return;
        }

        setRole(saved.role ?? [expert?.whoYouAre, expert?.targetAudience, expert?.role, expert?.niche].filter(Boolean).join(', '));
        setAudience(saved.audience ?? '');
        setProblem(saved.problem ?? '');
        setResult(saved.result ?? '');
        setMechanism(saved.mechanism ?? '');
        setDifferentiation(saved.differentiation ?? '');
        setProof(saved.proof ?? '');
        setSelectedVariant(saved.selectedVariant ?? '');
        setPreviewVariant(saved.selectedVariant ?? '');
        setVariants(saved.variants ?? '');
        setScore(saved.score ?? '');
        setAssets(saved.assets ?? '');
        setVersionHistory(saved.versionHistory ?? []);
      })
      .catch(() => toast.error('Не удалось загрузить позиционирование'))
      .finally(() => setLoading(false));
  }, [activeProjectId]);

  function makeVersion(
    value: PositioningData,
    title: string,
    source: AiResultVersion<PositioningData>['source'],
    meta?: Partial<AiResultVersion<PositioningData>>,
  ): AiResultVersion<PositioningData> {
    const { versionHistory: _history, ...cleanValue } = value;
    void _history;
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      createdAt: new Date().toISOString(),
      source,
      workflowRunId: meta?.workflowRunId,
      workflowStepId: meta?.workflowStepId,
      artifactId: meta?.artifactId,
      generationId: meta?.generationId,
      value: cleanValue as PositioningData,
    };
  }

  function withVersion(
    value: PositioningData,
    title: string,
    source: AiResultVersion<PositioningData>['source'],
    meta?: Partial<AiResultVersion<PositioningData>>,
  ): PositioningData {
    const nextHistory = [makeVersion(value, title, source, meta), ...versionHistory].slice(0, 20);
    setVersionHistory(nextHistory);
    return { ...value, versionHistory: nextHistory };
  }

  function restoreVersion(version: AiResultVersion<PositioningData>) {
    const value = version.value;
    setRole(value.role ?? '');
    setAudience(value.audience ?? '');
    setProblem(value.problem ?? '');
    setResult(value.result ?? '');
    setMechanism(value.mechanism ?? '');
    setDifferentiation(value.differentiation ?? '');
    setProof(value.proof ?? '');
    setSelectedVariant(value.selectedVariant ?? '');
    setPreviewVariant(value.selectedVariant ?? '');
    setVariants(value.variants ?? '');
    setScore(value.score ?? '');
    setAssets(value.assets ?? '');

    if (activeProjectId) {
      const restored = withVersion({ ...value, completed: true, updatedAt: new Date().toISOString() }, `Восстановлено: ${version.title}`, 'restore');
      void projectsApi.saveStrategy(activeProjectId, { positioningData: restored }).catch(() => {});
      upsertMaterial(activeProjectId, buildPositioningMaterial(restored));
    }
    toast.success('Версия позиционирования восстановлена');
  }

  async function runVariants() {
    if (!activeProjectId) {
      toast.error('Сначала создайте проект');
      return;
    }

    setRunning(true);
    try {
      toast.loading('ИИ генерирует варианты позиционирования...', { id: 'positioning-variants' });
      const workflow = 'positioning.variants.generate';
      const inputs = { currentHypothesis: finalStatement };
      const variantsResp = await aiApi.startWorkflow('positioning.variants.generate', {
        projectId: activeProjectId,
        inputs,
        idempotencyKey: makeAiIdempotencyKey({ projectId: activeProjectId, workflow, inputs }),
      });
      setVariants(variantsResp.content);
      const nextVariants = parseVariants(variantsResp.content);
      setPreviewVariant(nextVariants[0] ?? '');
      setVariantDraft(nextVariants[0] ?? '');

      const positioningData = withVersion({
        ...positioningDraft,
        variants: variantsResp.content,
        completed: canFinalize,
        updatedAt: new Date().toISOString(),
      }, 'AI-варианты позиционирования', 'ai', variantsResp);
      await projectsApi.saveStrategy(activeProjectId, { positioningData });
      setActiveTab('variants');
      toast.success(`Варианты позиционирования готовы. Списано ${variantsResp.aiPointsCharged ?? 20} AI-баллов.`, { id: 'positioning-variants' });
    } catch (error) {
      toast.error(getApiErrorMessage(error) ?? 'Не удалось сгенерировать варианты позиционирования', { id: 'positioning-variants' });
    } finally {
      setRunning(false);
    }
  }

  async function runFinalAssembly() {
    if (!activeProjectId) {
      toast.error('Сначала создайте проект');
      return;
    }
    if (!selectedVariant.trim()) {
      toast.error('Сначала выберите вариант позиционирования');
      setActiveTab('variants');
      return;
    }

    setRunning(true);
    try {
      toast.loading('ИИ формулирует финальное позиционирование...', { id: 'positioning-final' });
      const workflow = 'positioning.final.generate';
      const inputs = {
        selectedVariant,
        currentDraft: finalStatement,
      };
      const resp = await aiApi.startWorkflow('positioning.final.generate', {
        projectId: activeProjectId,
        inputs,
        idempotencyKey: makeAiIdempotencyKey({ projectId: activeProjectId, workflow, inputs }),
      });

      const content = resp.content;
      const nextRole = getFieldValue(content, 'Кто вы') || role;
      const nextAudience = getFieldValue(content, 'Для кого') || audience;
      const nextProblem = getFieldValue(content, 'Проблема') || getFieldValue(content, 'С какой проблемой') || problem;
      const nextResult = getFieldValue(content, 'Результат') || getFieldValue(content, 'К какому результату') || result;
      const nextMechanism = getFieldValue(content, 'Механизм') || getFieldValue(content, 'Через какой механизм') || mechanism;
      const nextDifferentiation = getFieldValue(content, 'Отличие') || getFieldValue(content, 'Чем отличаетесь') || getFieldValue(content, 'Дифференциация') || differentiation;
      const nextProof = getFieldValue(content, 'Почему доверять') || proof;

      setRole(nextRole);
      setAudience(nextAudience);
      setProblem(nextProblem);
      setResult(nextResult);
      setMechanism(nextMechanism);
      setDifferentiation(nextDifferentiation);
      setProof(nextProof);
      const nextStatement = buildStatement({
        role: nextRole,
        audience: nextAudience,
        problem: nextProblem,
        result: nextResult,
        mechanism: nextMechanism,
        differentiation: nextDifferentiation,
        proof: nextProof,
        selectedVariant,
      });
      const positioningData = withVersion({
        ...positioningDraft,
        role: nextRole.trim(),
        audience: nextAudience.trim(),
        problem: nextProblem.trim(),
        result: nextResult.trim(),
        mechanism: nextMechanism.trim(),
        differentiation: nextDifferentiation.trim(),
        proof: nextProof.trim(),
        statement: nextStatement.trim(),
        completed: true,
        updatedAt: new Date().toISOString(),
      }, 'AI-финальная сборка позиционирования', 'ai', resp);
      await projectsApi.saveStrategy(activeProjectId, { positioningData });
      upsertMaterial(activeProjectId, buildPositioningMaterial(positioningData));
      setActiveTab('final');
      toast.success(`Финальная сборка обновлена. Списано ${resp.aiPointsCharged ?? 20} AI-баллов.`, { id: 'positioning-final' });
    } catch (error) {
      toast.error(getApiErrorMessage(error) ?? 'Не удалось сформулировать финальное позиционирование', { id: 'positioning-final' });
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

    const nextRole = getFieldValue(nextVariant, 'Кто вы') || role || [expertProfile?.role, expertProfile?.niche].filter(Boolean).join(', ');
    const nextAudience = getFieldValue(nextVariant, 'Для кого') || audience;
    const nextProblem = getFieldValue(nextVariant, 'Проблема') || problem;
    const nextResult = getFieldValue(nextVariant, 'Результат') || result;
    const nextMechanism = getFieldValue(nextVariant, 'Механизм') || mechanism;
    const nextDifferentiation = getFieldValue(nextVariant, 'Дифференциация') || differentiation;
    const nextProof = getFieldValue(nextVariant, 'Почему доверять') || getFieldValue(nextVariant, 'Почему может сработать') || proof;

    setSelectedVariant(nextVariant);
    setRole(nextRole);
    setAudience(nextAudience);
    setProblem(nextProblem);
    setResult(nextResult);
    setMechanism(nextMechanism);
    setDifferentiation(nextDifferentiation);
    setProof(nextProof);
    const nextStatement = buildStatement({
      role: nextRole,
      audience: nextAudience,
      problem: nextProblem,
      result: nextResult,
      mechanism: nextMechanism,
      differentiation: nextDifferentiation,
      proof: nextProof,
      selectedVariant: nextVariant,
    });
    if (activeProjectId) {
      const positioningData = withVersion({
        ...positioningDraft,
        role: nextRole.trim(),
        audience: nextAudience.trim(),
        problem: nextProblem.trim(),
        result: nextResult.trim(),
        mechanism: nextMechanism.trim(),
        differentiation: nextDifferentiation.trim(),
        proof: nextProof.trim(),
        selectedVariant: nextVariant.trim(),
        statement: nextStatement.trim(),
        completed: true,
        updatedAt: new Date().toISOString(),
      }, 'Ручной выбор варианта позиционирования', 'manual');
      void projectsApi.saveStrategy(activeProjectId, { positioningData }).catch(() => {});
    }
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

    const positioningData: PositioningData = withVersion(
      { ...positioningDraft, completed: true, updatedAt: new Date().toISOString() },
      'Ручное сохранение позиционирования',
      'manual',
    );

    setSaving(true);
    try {
      await projectsApi.saveStrategy(activeProjectId, { positioningData });
      upsertMaterial(activeProjectId, buildPositioningMaterial(positioningData));
      completePositioning();
      toast.success('Позиционирование сохранено как ядро проекта');
      if (goNext) navigate('/app/strategy/audience');
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
            <div className={s.kicker}>Стратегия</div>
            <h1 className={s.title}>Позиционирование</h1>
            <p className={s.subtitle}>
              Сгенерируйте варианты и зафиксируйте финальную формулировку на основе раздела «О себе». Подходящую AI-модель сервис выберет автоматически.
            </p>
          </div>
          <button className={s.primaryButton} onClick={() => void runVariants()} disabled={running || loading || !activeProjectId}>
            {running ? 'ИИ работает...' : variants ? 'Пересобрать варианты' : 'Сгенерировать варианты'}
            {!running && <AiWorkflowCost workflow="positioning.variants.generate" projectId={activeProjectId} />}
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
              <button className={s.textButton} onClick={() => navigate('/app/strategy/about')}>Открыть раздел «О себе»</button>
            </div>
          </div>
        ) : (
          <div className={s.contextBar}>
            <div>
              <div className={s.contextLabel}>Бриф «О себе» пока пустой</div>
              <div className={s.contextText}>Варианты позиционирования станут точнее, если ИИ будет знать опыт, регалии, продукты, ограничения и сильные кейсы.</div>
            </div>
            <button className={s.textButton} onClick={() => navigate('/app/strategy/about')}>Заполнить «О себе»</button>
          </div>
        )}

        <div className={s.grid}>
          <aside className={s.sidebar}>
            <button className={`${s.tab} ${activeTab === 'models' ? s.activeTab : ''}`} onClick={() => setActiveTab('models')}>Модели позиционирования</button>
            <button className={`${s.tab} ${activeTab === 'variants' ? s.activeTab : ''}`} onClick={() => setActiveTab('variants')}>Варианты позиционирования</button>
            <button className={`${s.tab} ${activeTab === 'final' ? s.activeTab : ''}`} onClick={() => setActiveTab('final')}>Финальная сборка</button>

            <div className={s.sideCard}>
              <div className={s.sideTitle}>Статус</div>
              <div className={s.statusList}>
                <span className={variants ? s.done : ''}>Варианты</span>
                <span className={selectedVariant ? s.done : ''}>Выбор</span>
                <span className={finalStatement ? s.done : ''}>Финал</span>
              </div>
            </div>
          </aside>

          <main className={s.panel}>
            {loading ? (
              <div className={s.empty}>Загрузка...</div>
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
                  </aside>
                </div>
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
                ) : <EmptyState onRun={runVariants} />}
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
                  <button className={s.secondaryButton} onClick={() => void runFinalAssembly()} disabled={running || !selectedVariant.trim()}>
                    {running ? 'ИИ работает...' : 'Сформулировать итог с ИИ'}
                    {!running && <AiWorkflowCost workflow="positioning.final.generate" projectId={activeProjectId} />}
                  </button>
                  <button className={s.secondaryButton} onClick={() => void save(false)} disabled={saving || !canFinalize}>Сохранить</button>
                  <button className={s.primaryButton} onClick={() => void save(true)} disabled={saving || !canFinalize}>
                    {saving ? 'Сохраняю...' : 'Сохранить и перейти к ЦА'}
                  </button>
                </div>

                {versionHistory.length ? (
                  <div className={s.resultBlock}>
                    <div className={s.boxTitle}>История версий</div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {versionHistory.slice(0, 6).map((version) => (
                        <button
                          key={version.id}
                          type="button"
                          onClick={() => restoreVersion(version)}
                          style={{
                            textAlign: 'left',
                            background: '#fff',
                            border: '1px solid #E5E3DC',
                            borderRadius: 8,
                            padding: '10px 12px',
                            cursor: 'pointer',
                            color: '#1a1a1a',
                          }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{version.title}</div>
                          <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                            {new Date(version.createdAt).toLocaleString('ru-RU')}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

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
