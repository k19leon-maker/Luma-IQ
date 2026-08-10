import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useSearchParams } from 'react-router-dom';
import {
  INSTAGRAM_PACKAGING_VERSION,
  projectsApi,
  type InstagramPackaging,
  type InstagramHighlightDraft,
  type InstagramPackagingLimits,
  type InstagramProfileHeader,
  type InstagramProfileReadiness,
} from '../../api/projects.api';
import { aiApi, type WorkflowResponse } from '../../api/ai';
import AiWorkflowCost from '../../components/AiWorkflowCost/AiWorkflowCost';
import { VoiceComposer } from '../../components/VoiceComposer/VoiceComposer';
import { useProjectsStore } from '../../store/projects.store';
import {
  validateInstagramProfile,
  type InstagramProfileField,
} from '../../utils/instagramPackagingValidation';
import styles from './Social.module.css';
import InstagramHighlightsEditor from './InstagramHighlightsEditor';

type PreviewMode = 'desktop' | 'mobile';
type Tab = 'profile' | 'highlights';

const EMPTY_PROFILE: InstagramProfileHeader = {
  username: '',
  displayName: '',
  category: '',
  bio: '',
  callToAction: '',
  link: '',
  logicExplanation: '',
};

const HIGHLIGHTS_DRAFT_PREFIX = 'lumaiq:instagram-highlights-draft:';

interface FieldDefinition {
  key: InstagramProfileField;
  label: string;
  placeholder: string;
  hint?: string;
  multiline?: boolean;
  rows?: number;
}

const FIELDS: FieldDefinition[] = [
  {
    key: 'username',
    label: 'Username',
    placeholder: 'expert.name',
    hint: 'Без символа @',
  },
  {
    key: 'displayName',
    label: 'Имя',
    placeholder: 'Имя и специализация',
  },
  {
    key: 'category',
    label: 'Категория',
    placeholder: 'Предприниматель',
  },
  {
    key: 'bio',
    label: 'Bio',
    placeholder: 'Кому и с каким результатом вы помогаете',
    multiline: true,
    rows: 4,
  },
  {
    key: 'callToAction',
    label: 'Призыв к действию',
    placeholder: 'Запишитесь на разбор по ссылке ниже',
    multiline: true,
    rows: 2,
  },
  {
    key: 'link',
    label: 'Ссылка',
    placeholder: 'https://example.com',
  },
];

function profileKey(profile: InstagramProfileHeader): string {
  return JSON.stringify(profile);
}

function highlightsKey(highlights: InstagramHighlightDraft[]): string {
  return JSON.stringify(highlights);
}

function isHighlightDraft(value: unknown): value is InstagramHighlightDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string'
    && typeof item.title === 'string'
    && typeof item.goal === 'string'
    && typeof item.description === 'string'
    && typeof item.icon === 'string'
    && typeof item.position === 'number'
    && Array.isArray(item.stories)
    && item.stories.every((story) => {
      if (!story || typeof story !== 'object' || Array.isArray(story)) return false;
      const candidate = story as Record<string, unknown>;
      return typeof candidate.id === 'string'
        && typeof candidate.title === 'string'
        && typeof candidate.role === 'string'
        && typeof candidate.goal === 'string'
        && typeof candidate.format === 'string'
        && typeof candidate.customFormat === 'string'
        && typeof candidate.frame === 'string'
        && typeof candidate.screenText === 'string'
        && typeof candidate.speech === 'string'
        && typeof candidate.interactive === 'string'
        && typeof candidate.callToAction === 'string'
        && typeof candidate.transition === 'string'
        && typeof candidate.position === 'number';
    });
}

function readHighlightsDraft(projectId: string, baseUpdatedAt: string): InstagramHighlightDraft[] | null {
  try {
    const raw = sessionStorage.getItem(`${HIGHLIGHTS_DRAFT_PREFIX}${projectId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { baseUpdatedAt?: unknown; highlights?: unknown };
    if (parsed.baseUpdatedAt !== baseUpdatedAt
      || !Array.isArray(parsed.highlights)
      || !parsed.highlights.every(isHighlightDraft)) {
      sessionStorage.removeItem(`${HIGHLIGHTS_DRAFT_PREFIX}${projectId}`);
      return null;
    }
    return parsed.highlights;
  } catch {
    sessionStorage.removeItem(`${HIGHLIGHTS_DRAFT_PREFIX}${projectId}`);
    return null;
  }
}

function copyText(value: string, successMessage: string): void {
  if (!value.trim()) {
    toast.error('Поле пока не заполнено');
    return;
  }
  void navigator.clipboard.writeText(value).then(
    () => toast.success(successMessage),
    () => toast.error('Не удалось скопировать'),
  );
}

function buildProfileText(profile: InstagramProfileHeader): string {
  return [
    profile.username ? `@${profile.username}` : '',
    profile.displayName,
    profile.category,
    profile.bio,
    profile.callToAction,
    profile.link,
  ].filter(Boolean).join('\n');
}

function readApiError(error: unknown, fallback = 'Не удалось сохранить шапку профиля'): string {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return fallback;
  }
  const response = (error as {
    response?: { data?: { error?: string; userMessage?: string; issues?: Array<{ message?: string }> } };
  }).response;
  return response?.data?.issues?.[0]?.message
    ?? response?.data?.userMessage
    ?? response?.data?.error
    ?? fallback;
}

function aiProfileFromResponse(
  response: WorkflowResponse,
  currentProfile: InstagramProfileHeader,
): InstagramProfileHeader {
  let candidate: Record<string, unknown> | null = response.structured ?? null;
  if (!candidate) {
    const normalized = response.content
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    candidate = JSON.parse(normalized) as Record<string, unknown>;
  }
  const text = (key: keyof InstagramProfileHeader) => (
    typeof candidate?.[key] === 'string' ? String(candidate[key]).trim() : ''
  );
  return {
    username: currentProfile.username,
    displayName: text('displayName'),
    category: text('category'),
    bio: text('bio'),
    callToAction: text('callToAction'),
    link: currentProfile.link,
    logicExplanation: text('logicExplanation'),
  };
}

function ProfilePreview({
  profile,
  mode,
}: {
  profile: InstagramProfileHeader;
  mode: PreviewMode;
}) {
  const displayName = profile.displayName || 'Имя профиля';
  const initial = displayName.trim().charAt(0).toUpperCase() || 'И';

  return (
    <div className={`${styles.previewShell} ${mode === 'mobile' ? styles.previewShellMobile : ''}`}>
      <div className={styles.previewToolbar}>
        <span className={styles.previewDot} />
        Предпросмотр профиля
      </div>
      <div className={styles.instagramPreview}>
        <div className={styles.previewIdentity}>
          <div className={styles.avatar} aria-hidden="true">{initial}</div>
          <div className={styles.previewStats}>
            <span><strong>0</strong> публикаций</span>
            <span><strong>0</strong> подписчиков</span>
            <span><strong>0</strong> подписок</span>
          </div>
        </div>
        <div className={styles.previewContent}>
          <strong className={styles.previewName}>{displayName}</strong>
          {profile.category && <span className={styles.previewCategory}>{profile.category}</span>}
          <div className={styles.previewBio}>
            {profile.bio || 'Здесь появится описание профиля'}
            {profile.callToAction && <><br />{profile.callToAction}</>}
          </div>
          {profile.link && <span className={styles.previewLink}>{profile.link}</span>}
        </div>
        <div className={styles.previewActions} aria-hidden="true">
          <span>Подписаться</span>
          <span>Сообщение</span>
        </div>
        <div className={styles.previewUsername}>
          @{profile.username || 'username'}
        </div>
      </div>
    </div>
  );
}

export default function Social() {
  const activeProjectId = useProjectsStore((state) => state.activeProjectId);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = searchParams.get('tab') === 'highlights' ? 'highlights' : 'profile';

  const [packaging, setPackaging] = useState<InstagramPackaging | null>(null);
  const [baselineProfile, setBaselineProfile] = useState<InstagramProfileHeader>(EMPTY_PROFILE);
  const [baselineHighlights, setBaselineHighlights] = useState<InstagramHighlightDraft[]>([]);
  const [limits, setLimits] = useState<InstagramPackagingLimits | null>(null);
  const [readiness, setReadiness] = useState<InstagramProfileReadiness | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('desktop');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [aiInstruction, setAiInstruction] = useState('');
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [aiAction, setAiAction] = useState<'generate' | 'improve' | null>(null);
  const [aiProposal, setAiProposal] = useState<InstagramProfileHeader | null>(null);
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);

  const profile = packaging?.profileHeader ?? EMPTY_PROFILE;
  const validation = useMemo(
    () => limits ? validateInstagramProfile(profile, limits) : null,
    [limits, profile],
  );
  const highlights = packaging?.highlights ?? [];
  const profileDirty = packaging !== null && profileKey(profile) !== profileKey(baselineProfile);
  const highlightsDirty = packaging !== null
    && highlightsKey(highlights) !== highlightsKey(baselineHighlights);
  const dirty = profileDirty || highlightsDirty;
  const highlightsValid = highlights.every((highlight) => (
    highlight.title.trim().length > 0
      && highlight.stories.every((story) => (
        story.title.trim().length > 0
          && (story.format !== 'custom' || story.customFormat.trim().length > 0)
      ))
  ));
  const canSave = Boolean(activeProjectId && dirty && validation?.valid && highlightsValid && !saving);

  useEffect(() => {
    if (!activeProjectId) {
      setPackaging(null);
      setLimits(null);
      setReadiness(null);
      setBaselineHighlights([]);
      setActiveHighlightId(null);
      setLoadError('');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError('');
    setPackaging(null);
    setAiProposal(null);
    setAiInstruction('');
    void projectsApi.getInstagramPackaging(activeProjectId)
      .then((response) => {
        if (cancelled) return;
        const draftHighlights = readHighlightsDraft(activeProjectId, response.packaging.updatedAt);
        const loadedPackaging = draftHighlights
          ? { ...response.packaging, highlights: draftHighlights }
          : response.packaging;
        setPackaging(loadedPackaging);
        setBaselineProfile(response.packaging.profileHeader);
        setBaselineHighlights(response.packaging.highlights);
        setLimits(response.limits);
        setReadiness(response.readiness);
        const requestedHighlight = new URLSearchParams(window.location.search).get('highlight');
        setActiveHighlightId(
          loadedPackaging.highlights.some((item) => item.id === requestedHighlight)
            ? requestedHighlight
            : loadedPackaging.highlights[0]?.id ?? null,
        );
      })
      .catch(() => {
        if (!cancelled) setLoadError('Не удалось загрузить упаковку Instagram');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeProjectId]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    if (!activeProjectId || !packaging) return;
    const key = `${HIGHLIGHTS_DRAFT_PREFIX}${activeProjectId}`;
    if (!highlightsDirty) {
      sessionStorage.removeItem(key);
      return;
    }
    sessionStorage.setItem(key, JSON.stringify({
      baseUpdatedAt: packaging.updatedAt,
      highlights: packaging.highlights,
    }));
  }, [activeProjectId, highlightsDirty, packaging]);

  function selectTab(nextTab: Tab) {
    const next = new URLSearchParams(searchParams);
    if (nextTab === 'profile') {
      next.delete('tab');
      next.delete('highlight');
    } else {
      next.set('tab', nextTab);
      if (activeHighlightId) next.set('highlight', activeHighlightId);
    }
    setSearchParams(next, { replace: true });
  }

  function selectHighlight(id: string | null) {
    setActiveHighlightId(id);
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'highlights');
    if (id) next.set('highlight', id);
    else next.delete('highlight');
    setSearchParams(next, { replace: true });
  }

  function updateHighlights(next: InstagramHighlightDraft[]) {
    setPackaging((current) => current ? { ...current, highlights: next } : current);
  }

  function updateField(field: InstagramProfileField, value: string) {
    setPackaging((current) => current ? {
      ...current,
      profileHeader: {
        ...current.profileHeader,
        [field]: value,
      },
    } : current);
  }

  async function savePackaging(successMessage = 'Шапка профиля сохранена') {
    if (!activeProjectId || !packaging || !canSave) return;
    setSaving(true);
    try {
      const response = await projectsApi.saveInstagramPackaging(activeProjectId, {
        version: INSTAGRAM_PACKAGING_VERSION,
        profileHeader: packaging.profileHeader,
        highlights: packaging.highlights,
      });
      setPackaging(response.packaging);
      setBaselineProfile(response.packaging.profileHeader);
      setBaselineHighlights(response.packaging.highlights);
      setLimits(response.limits);
      setReadiness(response.readiness);
      toast.success(successMessage);
    } catch (error) {
      toast.error(readApiError(
        error,
        successMessage === 'Highlights сохранены'
          ? 'Не удалось сохранить Highlights'
          : 'Не удалось сохранить шапку профиля',
      ));
    } finally {
      setSaving(false);
    }
  }

  async function runAiProfile(action: 'generate' | 'improve') {
    if (!activeProjectId || !packaging || aiAction || voiceBusy) return;
    setAiAction(action);
    try {
      const workflow = `instagram.profile.${action}`;
      const response = await aiApi.startWorkflow(workflow, {
        projectId: activeProjectId,
        inputs: {
          currentProfile: profile,
          instruction: aiInstruction.trim(),
        },
        idempotencyKey: typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${workflow}:${Date.now()}`,
      });
      const proposal = aiProfileFromResponse(response, profile);
      if (limits && !validateInstagramProfile(proposal, limits).valid) {
        throw new Error('AI вернул шапку, которая не проходит ограничения Instagram');
      }
      setAiProposal(proposal);
      toast.success(response.aiPointsCharged !== undefined
        ? `Вариант готов. Списано ${response.aiPointsCharged} AI-баллов`
        : 'Вариант готов. Проверьте его перед применением');
    } catch (error) {
      toast.error(readApiError(error, error instanceof Error ? error.message : 'Не удалось подготовить вариант'));
    } finally {
      setAiAction(null);
    }
  }

  function applyAiProposal() {
    if (!aiProposal) return;
    setPackaging((current) => current ? { ...current, profileHeader: aiProposal } : current);
    setAiProposal(null);
    toast.success('AI-вариант применён. Проверьте и сохраните изменения');
  }

  if (!activeProjectId) {
    return (
      <section className={styles.statePage}>
        <h1>Упаковка Instagram</h1>
        <p>Выберите или создайте проект, чтобы собрать шапку профиля.</p>
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Упаковка</p>
          <h1>Упаковка Instagram</h1>
          <p className={styles.subtitle}>
            Соберите профиль, который понятно объясняет вашу специализацию и следующий шаг для клиента.
          </p>
        </div>
        {dirty && <span className={styles.dirtyBadge}>Есть несохранённые изменения</span>}
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Разделы упаковки Instagram">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'profile'}
          className={tab === 'profile' ? styles.tabActive : styles.tab}
          onClick={() => selectTab('profile')}
        >
          Шапка профиля
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'highlights'}
          className={tab === 'highlights' ? styles.tabActive : styles.tab}
          onClick={() => selectTab('highlights')}
        >
          Highlights
        </button>
      </div>

      {loading && (
        <div className={styles.loadingState} role="status">
          <span className={styles.spinner} />
          Загружаем упаковку проекта…
        </div>
      )}

      {!loading && loadError && (
        <div className={styles.errorState}>
          <strong>Не удалось открыть раздел</strong>
          <p>{loadError}. Проверьте соединение и попробуйте ещё раз.</p>
          <button type="button" onClick={() => window.location.reload()}>Обновить страницу</button>
        </div>
      )}

      {!loading && !loadError && packaging && tab === 'profile' && limits && (
        <div className={styles.workspace}>
          <div className={styles.editor}>
            <div className={styles.aiPanel}>
              <div className={styles.aiPanelHeader}>
                <div>
                  <span className={styles.aiLabel}>AI-помощник</span>
                  <h2>Собрать или улучшить шапку</h2>
                  <p>AI использует только данные текущего проекта. Результат появится как вариант для сравнения.</p>
                </div>
                {readiness && (
                  <span className={readiness.sufficient ? styles.readinessReady : styles.readinessBase}>
                    Контекст {readiness.score}%
                  </span>
                )}
              </div>

              {readiness && !readiness.sufficient && (
                <div className={styles.readinessNotice}>
                  <strong>Можно собрать базовый вариант</strong>
                  <p>Точнее получится после заполнения недостающих разделов:</p>
                  <div className={styles.readinessLinks}>
                    {readiness.items.filter((item) => !item.ready).map((item) => (
                      <Link key={item.key} to={item.path}>{item.label}</Link>
                    ))}
                  </div>
                </div>
              )}

              <label className={styles.aiInstruction}>
                <span>Пожелание к результату</span>
                <VoiceComposer
                  value={aiInstruction}
                  onChange={setAiInstruction}
                  onBusyChange={setVoiceBusy}
                  placeholder="Например: сделай спокойнее, конкретнее или усили следующий шаг"
                  rows={2}
                  maxLength={2000}
                  disabled={Boolean(aiAction)}
                  textareaClassName={styles.aiInstructionTextarea}
                />
              </label>

              <div className={styles.aiActions}>
                <button
                  type="button"
                  onClick={() => void runAiProfile('generate')}
                  disabled={Boolean(aiAction) || voiceBusy}
                >
                  {aiAction === 'generate' ? 'Собираем…' : 'Сгенерировать шапку'}
                  <AiWorkflowCost
                    workflow="instagram.profile.generate"
                    projectId={activeProjectId}
                    inputs={{ currentProfile: profile, instruction: aiInstruction.trim() }}
                  />
                </button>
                <button
                  type="button"
                  className={styles.aiSecondaryButton}
                  onClick={() => void runAiProfile('improve')}
                  disabled={Boolean(aiAction) || voiceBusy}
                >
                  {aiAction === 'improve' ? 'Улучшаем…' : 'Улучшить текущую'}
                  <AiWorkflowCost
                    workflow="instagram.profile.improve"
                    projectId={activeProjectId}
                    inputs={{ currentProfile: profile, instruction: aiInstruction.trim() }}
                  />
                </button>
              </div>
            </div>

            {aiProposal && (
              <div className={styles.aiProposal}>
                <div className={styles.aiProposalHeader}>
                  <div>
                    <span className={styles.aiLabel}>Предложенная версия</span>
                    <h2>Сравните перед применением</h2>
                  </div>
                  <button type="button" onClick={() => setAiProposal(null)}>Закрыть</button>
                </div>
                <div className={styles.comparisonGrid}>
                  <div className={styles.comparisonHeading}>Сейчас</div>
                  <div className={styles.comparisonHeading}>Предложено</div>
                  {([
                    ['Имя', profile.displayName, aiProposal.displayName],
                    ['Категория', profile.category, aiProposal.category],
                    ['Bio', profile.bio, aiProposal.bio],
                    ['Призыв', profile.callToAction, aiProposal.callToAction],
                  ] as Array<[string, string, string]>).map(([label, before, after]) => (
                    <div className={styles.comparisonRow} key={label}>
                      <div><strong>{label}</strong><span>{before || 'Не заполнено'}</span></div>
                      <div><strong>{label}</strong><span>{after || 'Не заполнено'}</span></div>
                    </div>
                  ))}
                </div>
                {aiProposal.logicExplanation && (
                  <p className={styles.aiLogic}>{aiProposal.logicExplanation}</p>
                )}
                <div className={styles.proposalActions}>
                  <button type="button" className={styles.aiSecondaryButton} onClick={() => setAiProposal(null)}>
                    Оставить текущую
                  </button>
                  <button type="button" onClick={applyAiProposal}>Применить вариант</button>
                </div>
              </div>
            )}

            <div className={styles.sectionHeading}>
              <div>
                <h2>Шапка профиля</h2>
                <p>Заполните вручную. Редактирование и сохранение не расходуют AI-баланс.</p>
              </div>
              <button
                type="button"
                className={styles.copyAllButton}
                onClick={() => copyText(buildProfileText(profile), 'Шапка профиля скопирована')}
              >
                Копировать всё
              </button>
            </div>

            <div className={styles.form}>
              {FIELDS.map((field) => {
                const rules = limits.fields[field.key];
                const error = validation?.fieldErrors[field.key];
                const count = validation?.counts[field.key] ?? 0;
                const commonProps = {
                  id: `instagram-${field.key}`,
                  value: profile[field.key],
                  placeholder: field.placeholder,
                  'aria-invalid': Boolean(error),
                  'aria-describedby': `${field.key}-meta`,
                  onChange: (
                    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
                  ) => updateField(field.key, event.target.value),
                };

                return (
                  <div className={styles.field} key={field.key}>
                    <div className={styles.fieldLabelRow}>
                      <label htmlFor={`instagram-${field.key}`}>
                        {field.label}
                        {rules.required && <span aria-label="обязательное поле"> *</span>}
                      </label>
                      <button
                        type="button"
                        className={styles.copyFieldButton}
                        onClick={() => copyText(profile[field.key], `${field.label} скопировано`)}
                        aria-label={`Копировать поле «${field.label}»`}
                      >
                        Копировать
                      </button>
                    </div>
                    {field.multiline ? (
                      <textarea {...commonProps} rows={field.rows} />
                    ) : (
                      <input {...commonProps} type={field.key === 'link' ? 'url' : 'text'} />
                    )}
                    <div
                      id={`${field.key}-meta`}
                      className={`${styles.fieldMeta} ${error ? styles.fieldMetaError : ''}`}
                    >
                      <span>{error ?? field.hint ?? ' '}</span>
                      <span>{count}/{rules.max}</span>
                    </div>
                  </div>
                );
              })}

              <div className={`${styles.combinedLimit} ${
                validation?.fieldErrors.callToAction ? styles.combinedLimitError : ''
              }`}>
                <span>Общий объём Bio и призыва</span>
                <strong>
                  {validation?.combinedBioCount ?? 0}/{limits.combined.bioAndCallToAction.max}
                </strong>
              </div>
            </div>

            <div className={styles.saveBar}>
              <span>
                {!dirty
                  ? 'Все изменения сохранены'
                  : validation?.valid && highlightsValid
                    ? 'Можно сохранить текущую версию'
                    : 'Исправьте ошибки перед сохранением'}
              </span>
              <button type="button" disabled={!canSave} onClick={() => void savePackaging()}>
                {saving ? 'Сохраняем…' : 'Сохранить'}
              </button>
            </div>
          </div>

          <aside className={styles.previewPanel}>
            <div className={styles.previewPanelHeader}>
              <div>
                <h2>Предпросмотр</h2>
                <p>Так шапка будет выглядеть в профиле.</p>
              </div>
              <div className={styles.modeSwitch} aria-label="Размер предпросмотра">
                <button
                  type="button"
                  className={previewMode === 'desktop' ? styles.modeActive : ''}
                  aria-pressed={previewMode === 'desktop'}
                  onClick={() => setPreviewMode('desktop')}
                >
                  Desktop
                </button>
                <button
                  type="button"
                  className={previewMode === 'mobile' ? styles.modeActive : ''}
                  aria-pressed={previewMode === 'mobile'}
                  onClick={() => setPreviewMode('mobile')}
                >
                  Mobile
                </button>
              </div>
            </div>
            <ProfilePreview profile={profile} mode={previewMode} />
          </aside>
        </div>
      )}

      {!loading && !loadError && packaging && tab === 'highlights' && limits && (
        <InstagramHighlightsEditor
          projectId={activeProjectId}
          highlights={packaging.highlights}
          activeId={activeHighlightId}
          dirty={dirty}
          saving={saving}
          canSave={canSave}
          saveHint={highlightsValid && validation?.valid
            ? 'Можно сохранить текущую структуру'
            : !validation?.valid
              ? 'Сначала заполните обязательные поля шапки профиля'
              : 'Добавьте название каждому Highlight'}
          previewMode={previewMode}
          onChange={updateHighlights}
          onActiveChange={selectHighlight}
          onPreviewModeChange={setPreviewMode}
          onSave={() => void savePackaging('Highlights сохранены')}
        />
      )}
    </section>
  );
}
