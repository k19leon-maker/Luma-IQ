import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import {
  INSTAGRAM_PACKAGING_VERSION,
  projectsApi,
  type InstagramPackaging,
  type InstagramPackagingLimits,
  type InstagramProfileHeader,
} from '../../api/projects.api';
import { useProjectsStore } from '../../store/projects.store';
import {
  validateInstagramProfile,
  type InstagramProfileField,
} from '../../utils/instagramPackagingValidation';
import styles from './Social.module.css';

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

function readApiError(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return 'Не удалось сохранить шапку профиля';
  }
  const response = (error as {
    response?: { data?: { error?: string; issues?: Array<{ message?: string }> } };
  }).response;
  return response?.data?.issues?.[0]?.message
    ?? response?.data?.error
    ?? 'Не удалось сохранить шапку профиля';
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
  const [limits, setLimits] = useState<InstagramPackagingLimits | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('desktop');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');

  const profile = packaging?.profileHeader ?? EMPTY_PROFILE;
  const validation = useMemo(
    () => limits ? validateInstagramProfile(profile, limits) : null,
    [limits, profile],
  );
  const dirty = packaging !== null && profileKey(profile) !== profileKey(baselineProfile);
  const canSave = Boolean(activeProjectId && dirty && validation?.valid && !saving);

  useEffect(() => {
    if (!activeProjectId) {
      setPackaging(null);
      setLimits(null);
      setLoadError('');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError('');
    setPackaging(null);
    void projectsApi.getInstagramPackaging(activeProjectId)
      .then((response) => {
        if (cancelled) return;
        setPackaging(response.packaging);
        setBaselineProfile(response.packaging.profileHeader);
        setLimits(response.limits);
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

  function selectTab(nextTab: Tab) {
    const next = new URLSearchParams(searchParams);
    if (nextTab === 'profile') next.delete('tab');
    else next.set('tab', nextTab);
    setSearchParams(next, { replace: true });
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

  async function saveProfile() {
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
      setLimits(response.limits);
      toast.success('Шапка профиля сохранена');
    } catch (error) {
      toast.error(readApiError(error));
    } finally {
      setSaving(false);
    }
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
                  : validation?.valid
                    ? 'Можно сохранить текущую версию'
                    : 'Исправьте ошибки перед сохранением'}
              </span>
              <button type="button" disabled={!canSave} onClick={() => void saveProfile()}>
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

      {!loading && !loadError && packaging && tab === 'highlights' && (
        <div className={styles.highlightsPlaceholder}>
          <div className={styles.placeholderIcon} aria-hidden="true">H</div>
          <h2>Highlights</h2>
          <p>
            Здесь появятся структура актуальных историй, их порядок и сценарии.
            Шапку профиля уже можно собирать и сохранять в соседней вкладке.
          </p>
          <button type="button" onClick={() => selectTab('profile')}>Открыть шапку профиля</button>
        </div>
      )}
    </section>
  );
}
