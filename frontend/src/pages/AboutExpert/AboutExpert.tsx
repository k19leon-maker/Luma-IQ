import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { aiApi } from '../../api/ai';
import { projectsApi } from '../../api/projects.api';
import { useMaterialsStore } from '../../store/materials.store';
import { useProgressStore } from '../../store/progress.store';
import { useProjectsStore } from '../../store/projects.store';
import { buildExpertProfileMaterial } from '../../utils/projectMaterials';
import s from './AboutExpert.module.css';

export interface ExpertProfileData {
  whoYouAre: string;
  targetAudience: string;
  productsAndServices: string;
  expertiseAndStrengths: string;
  trustProofs: string;
  aiSummary: string;
  name: string;
  role: string;
  niche: string;
  experienceYears: string;
  workFormats: string;
  productsAndPrices: string;
  competencies: string;
  antiPreferences: string;
  values: string;
  credentials: string;
  achievements: string;
  uploadedFileText: string;
  summary: string;
  completed: boolean;
  updatedAt: string;
}

const EMPTY_PROFILE: ExpertProfileData = {
  whoYouAre: '',
  targetAudience: '',
  productsAndServices: '',
  expertiseAndStrengths: '',
  trustProofs: '',
  aiSummary: '',
  name: '',
  role: '',
  niche: '',
  experienceYears: '',
  workFormats: '',
  productsAndPrices: '',
  competencies: '',
  antiPreferences: '',
  values: '',
  credentials: '',
  achievements: '',
  uploadedFileText: '',
  summary: '',
  completed: false,
  updatedAt: '',
};

const MAIN_FIELDS: Array<{
  key: keyof Pick<ExpertProfileData, 'whoYouAre' | 'targetAudience' | 'productsAndServices' | 'expertiseAndStrengths' | 'trustProofs'>;
  label: string;
  placeholder: string;
}> = [
  {
    key: 'whoYouAre',
    label: 'Кто вы и чем занимаетесь?',
    placeholder: 'Например: Я эксперт по найму РОПов. Помогаю собственникам малого и среднего бизнеса нанимать руководителей продаж и выстраивать отделы продаж без хаоса и постоянного ручного контроля.',
  },
  {
    key: 'targetAudience',
    label: 'Кому вы помогаете?',
    placeholder: 'Опишите вашу основную аудиторию: кто эти люди, в какой они ситуации, с какой проблемой приходят.',
  },
  {
    key: 'productsAndServices',
    label: 'Какие продукты или услуги вы продаёте?',
    placeholder: 'Перечислите основные услуги, консультации, программы, пакеты или продукты.',
  },
  {
    key: 'expertiseAndStrengths',
    label: 'В чём ваша экспертность и сильные стороны?',
    placeholder: 'Опишите опыт, подход, навыки, темы, в которых вы особенно сильны.',
  },
  {
    key: 'trustProofs',
    label: 'Какие факты подтверждают вашу экспертность?',
    placeholder: 'Кейсы, цифры, опыт, сертификаты, достижения, клиенты, проекты, выступления.',
  },
];

const ADDITIONAL_FIELDS: Array<{
  key: keyof Pick<ExpertProfileData, 'name' | 'experienceYears' | 'workFormats' | 'antiPreferences' | 'credentials' | 'uploadedFileText'>;
  label: string;
  placeholder: string;
  compact?: boolean;
}> = [
  { key: 'name', label: 'Имя эксперта / как обращаться', placeholder: 'Иван, Анна Петрова, Леонид', compact: true },
  { key: 'experienceYears', label: 'Опыт в годах', placeholder: '7 лет', compact: true },
  { key: 'workFormats', label: 'Формат работы', placeholder: 'Консультации 1:1, группы, сопровождение, аудит, курс в записи.' },
  { key: 'antiPreferences', label: 'Ограничения / с кем не работаете', placeholder: 'С кем не хотите работать, какие форматы или запросы не берёте.' },
  { key: 'credentials', label: 'Образование и сертификаты', placeholder: 'Дипломы, сертификаты, регалии, выступления, профессиональные статусы.' },
  { key: 'uploadedFileText', label: 'Текст из загруженных файлов', placeholder: 'Загрузите файл или вставьте сюда описание услуг, резюме, сайт, посты, презентацию.' },
];

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function joinParts(parts: Array<string | undefined>, separator = '\n'): string {
  return parts.map((part) => text(part)).filter(Boolean).join(separator);
}

function normalizeProfile(saved?: Partial<ExpertProfileData>): ExpertProfileData {
  const raw = (saved ?? {}) as Partial<ExpertProfileData> & Record<string, unknown>;
  const profile = { ...EMPTY_PROFILE, ...(saved ?? {}) };
  const legacyName = text(raw.expertName ?? raw.displayName);
  const legacyRole = text(raw.profession ?? raw.specialization);
  const legacyNiche = text(raw.sphere);
  const legacyExperience = text(raw.experience ?? raw.yearsInProfession);
  const legacyFormat = text(raw.format ?? raw.workFormat ?? raw.currentFormat);
  const legacyProducts = text(raw.products ?? raw.services);
  const legacyExpertise = text(raw.expertise ?? raw.strongTopics);
  const legacyRestrictions = text(raw.dontWant ?? raw.antiAudience ?? raw.notFor);
  const legacyEducation = text(raw.education ?? raw.certificates);
  const legacyTrust = text(raw.cases ?? raw.results ?? raw.numbers);
  const legacyFiles = text(raw.uploadedFilesSummary ?? raw.additionalMaterials ?? raw.notes);

  profile.name = profile.name || legacyName;
  profile.role = profile.role || legacyRole;
  profile.niche = profile.niche || legacyNiche;
  profile.experienceYears = profile.experienceYears || legacyExperience;
  profile.workFormats = profile.workFormats || legacyFormat;
  profile.productsAndPrices = profile.productsAndPrices || legacyProducts;
  profile.competencies = profile.competencies || legacyExpertise;
  profile.antiPreferences = profile.antiPreferences || legacyRestrictions;
  profile.credentials = profile.credentials || legacyEducation;
  profile.achievements = profile.achievements || legacyTrust;
  profile.uploadedFileText = profile.uploadedFileText || legacyFiles;

  const whoYouAre = profile.whoYouAre || joinParts([
    profile.name && profile.role ? `${profile.name} — ${profile.role}` : profile.role || profile.name,
    profile.niche ? `Сфера: ${profile.niche}` : '',
  ], '. ');

  return {
    ...profile,
    whoYouAre,
    productsAndServices: profile.productsAndServices || profile.productsAndPrices,
    expertiseAndStrengths: profile.expertiseAndStrengths || joinParts([profile.competencies, profile.values], '\n\n'),
    trustProofs: profile.trustProofs || profile.achievements,
    aiSummary: profile.aiSummary || '',
  };
}

function buildSummary(profile: ExpertProfileData): string {
  const blocks = [
    ['Кто эксперт', profile.whoYouAre],
    ['Кому помогает', profile.targetAudience],
    ['Продукты и услуги', profile.productsAndServices],
    ['Экспертность и сильные стороны', profile.expertiseAndStrengths],
    ['Факты доверия', profile.trustProofs],
    ['Имя / обращение', profile.name],
    ['Опыт', profile.experienceYears],
    ['Формат работы', profile.workFormats],
    ['Ограничения', profile.antiPreferences],
    ['Образование и сертификаты', profile.credentials],
    ['Материалы из файлов', profile.uploadedFileText.slice(0, 1400)],
  ] as const;

  return blocks
    .map(([label, value]) => {
      const cleaned = value.trim();
      return cleaned ? `${label}: ${cleaned}` : '';
    })
    .filter(Boolean)
    .join('\n');
}

function limitMessage(err: unknown, fallback: string) {
  const response = (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
  return response?.message || response?.error || fallback;
}

export default function AboutExpert() {
  const navigate = useNavigate();
  const activeProjectId = useProjectsStore((st) => st.activeProjectId);
  const projects = useProjectsStore((st) => st.projects);
  const completeExpertProfile = useProgressStore((st) => st.completeExpertProfile);
  const upsertMaterial = useMaterialsStore((st) => st.upsertMaterial);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<ExpertProfileData>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showAdditional, setShowAdditional] = useState(false);
  const [importSourceId, setImportSourceId] = useState('');

  const summary = useMemo(() => buildSummary(profile), [profile]);
  const previewSummary = profile.aiSummary.trim() || summary;
  const filledMainCount = MAIN_FIELDS.filter((field) => text(profile[field.key])).length;
  const hasEnoughForPreview = filledMainCount >= 2 || Boolean(profile.aiSummary.trim());
  const canSave = Boolean(summary.trim());
  const importableProjects = projects.filter((project) => project.id !== activeProjectId);

  useEffect(() => {
    if (!activeProjectId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    projectsApi.getStrategy(activeProjectId)
      .then((data) => {
        const saved = (data as Record<string, unknown> | null)?.['expertProfileData'] as Partial<ExpertProfileData> | undefined;
        setProfile(normalizeProfile(saved));
      })
      .catch(() => toast.error('Не удалось загрузить бриф'))
      .finally(() => setLoading(false));
  }, [activeProjectId]);

  function updateField(key: keyof ExpertProfileData, value: string) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function buildPayload(nextProfile = profile): ExpertProfileData {
    const syncedProfile: ExpertProfileData = {
      ...nextProfile,
      role: nextProfile.role || nextProfile.whoYouAre,
      niche: nextProfile.niche || nextProfile.targetAudience,
      productsAndPrices: nextProfile.productsAndPrices || nextProfile.productsAndServices,
      competencies: nextProfile.competencies || nextProfile.expertiseAndStrengths,
      achievements: nextProfile.achievements || nextProfile.trustProofs,
    };
    return {
      ...syncedProfile,
      summary: syncedProfile.aiSummary.trim() || buildSummary(syncedProfile),
      completed: true,
      updatedAt: new Date().toISOString(),
    };
  }

  async function persistProfile(nextProfile: ExpertProfileData, successMessage?: string) {
    if (!activeProjectId) {
      toast.error('Сначала создайте проект');
      return false;
    }
    if (!buildSummary(nextProfile).trim() && !nextProfile.aiSummary.trim()) {
      toast.error('Заполните хотя бы одно поле');
      return false;
    }

    const expertProfileData = buildPayload(nextProfile);
    await projectsApi.saveStrategy(activeProjectId, { expertProfileData });
    upsertMaterial(activeProjectId, buildExpertProfileMaterial(expertProfileData));
    completeExpertProfile();
    setProfile(expertProfileData);
    if (successMessage) toast.success(successMessage);
    return true;
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const chunks: string[] = [];
      for (const file of Array.from(files)) {
        const extractedText = await aiApi.extractFileText(file);
        chunks.push(`Файл "${file.name}":\n${extractedText}`);
      }
      setProfile((current) => ({
        ...current,
        uploadedFileText: [current.uploadedFileText, ...chunks].filter(Boolean).join('\n\n---\n\n').slice(0, 12000),
      }));
      setShowAdditional(true);
      toast.success('Файл добавлен в бриф');
    } catch (err) {
      console.error('[AboutExpert] file upload error:', err);
      toast.error('Не удалось извлечь текст из файла');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function importProfileFromProject() {
    if (!importSourceId) {
      toast.error('Выберите проект-источник');
      return;
    }

    setImporting(true);
    try {
      const data = await projectsApi.getStrategy(importSourceId);
      const imported = (data as Record<string, unknown> | null)?.['expertProfileData'] as Partial<ExpertProfileData> | undefined;
      const normalized = normalizeProfile(imported);
      if (!buildSummary(normalized) && !normalized.aiSummary) {
        toast.error('В выбранном проекте раздел "О себе" еще не заполнен');
        return;
      }
      setProfile({
        ...normalized,
        completed: false,
        updatedAt: '',
      });
      setShowImport(false);
      toast.success('Данные подтянуты. Проверьте и сохраните резюме');
    } catch (err) {
      console.error('[AboutExpert] import profile error:', err);
      toast.error('Не удалось подтянуть данные');
    } finally {
      setImporting(false);
    }
  }

  async function save(goNext = false) {
    setSaving(true);
    try {
      const ok = await persistProfile(profile, 'Резюме сохранено');
      if (ok && goNext) navigate('/strategy/positioning');
    } catch {
      toast.error('Не удалось сохранить резюме');
    } finally {
      setSaving(false);
    }
  }

  async function improveWithAi() {
    if (!activeProjectId) {
      toast.error('Сначала создайте проект');
      return;
    }
    if (!summary.trim()) {
      toast.error('Заполните несколько полей перед AI-улучшением');
      return;
    }

    setEnhancing(true);
    try {
      const response = await aiApi.improveAboutSummary({
        projectId: activeProjectId,
        profile: {
          whoYouAre: profile.whoYouAre,
          targetAudience: profile.targetAudience,
          productsAndServices: profile.productsAndServices,
          expertiseAndStrengths: profile.expertiseAndStrengths,
          trustProofs: profile.trustProofs,
          name: profile.name,
          experienceYears: profile.experienceYears,
          workFormats: profile.workFormats,
          antiPreferences: profile.antiPreferences,
          credentials: profile.credentials,
          uploadedFileText: profile.uploadedFileText,
        },
        idempotencyKey: `about-summary:${activeProjectId}:${Date.now()}`,
      });
      const nextProfile = { ...profile, aiSummary: response.summary };
      await persistProfile(nextProfile, `AI-резюме готово. Списано credits: ${response.creditsCharged}`);
    } catch (err) {
      toast.error(limitMessage(err, 'Не удалось улучшить резюме с помощью ИИ'));
    } finally {
      setEnhancing(false);
    }
  }

  return (
    <div className={s.root}>
      <div className={s.shell}>
        <header className={s.header}>
          <div>
            <h1 className={s.title}>О себе</h1>
            <p className={s.subtitle}>
              Заполните короткое резюме проекта. Эти данные Luma IQ будет использовать в стратегии, УТП, продуктах, контенте и AI-диалоге.
            </p>
          </div>
          <div className={s.headerActions}>
            <button
              className={`${s.uploadButton} ${s.importButton}`}
              onClick={() => setShowImport((current) => !current)}
              disabled={!importableProjects.length}
            >
              Подтянуть из другого проекта
            </button>
            <button className={s.uploadButton} onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? 'Загружаю...' : 'Загрузить файлы'}
            </button>
          </div>
          <input
            ref={fileInputRef}
            className={s.fileInput}
            type="file"
            multiple
            accept=".txt,.doc,.docx,.pdf"
            onChange={(event) => void handleFiles(event.target.files)}
          />
        </header>

        {loading ? (
          <div className={s.card}>Загрузка...</div>
        ) : (
          <div className={s.layout}>
            <main className={s.card}>
              {showImport && (
                <div className={s.importPanel}>
                  <div>
                    <div className={s.importTitle}>Подтянуть резюме из другого проекта</div>
                    <div className={s.importText}>
                      Данные подставятся в текущую форму и сохранятся только после нажатия “Сохранить”.
                    </div>
                  </div>
                  <div className={s.importControls}>
                    <select
                      className={s.select}
                      value={importSourceId}
                      onChange={(event) => setImportSourceId(event.target.value)}
                    >
                      <option value="">Выберите проект</option>
                      {importableProjects.map((project) => (
                        <option key={project.id} value={project.id}>{project.name}</option>
                      ))}
                    </select>
                    <button className={s.button} onClick={() => void importProfileFromProject()} disabled={importing || !importSourceId}>
                      {importing ? 'Подтягиваю...' : 'Подтянуть'}
                    </button>
                  </div>
                </div>
              )}

              <section className={s.formSection}>
                <div className={s.cardHeader}>
                  <h2>Быстрое резюме для ИИ</h2>
                </div>

                <div className={s.fields}>
                  {MAIN_FIELDS.map((field) => (
                    <div className={s.field} key={field.key}>
                      <label className={s.label}>{field.label}</label>
                      <textarea
                        className={s.textarea}
                        value={profile[field.key]}
                        onChange={(event) => updateField(field.key, event.target.value)}
                        placeholder={field.placeholder}
                      />
                    </div>
                  ))}
                </div>
              </section>

              <section className={s.additional}>
                <button
                  type="button"
                  className={s.additionalToggle}
                  onClick={() => setShowAdditional((current) => !current)}
                  aria-expanded={showAdditional}
                >
                  <span>Дополнительная информация</span>
                  <span>{showAdditional ? 'Свернуть' : 'Раскрыть'}</span>
                </button>

                {showAdditional && (
                  <div className={s.additionalFields}>
                    {ADDITIONAL_FIELDS.map((field) => (
                      <div className={s.field} key={field.key}>
                        <label className={s.label}>{field.label}</label>
                        <textarea
                          className={`${s.textarea} ${field.compact ? s.compactTextarea : ''} ${field.key === 'uploadedFileText' ? s.fileText : ''}`}
                          value={profile[field.key]}
                          onChange={(event) => updateField(field.key, event.target.value)}
                          placeholder={field.placeholder}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <div className={s.actions}>
                <button className={`${s.button} ${s.secondary}`} onClick={() => void save(false)} disabled={saving || enhancing || !canSave}>
                  {saving ? 'Сохраняю...' : 'Сохранить'}
                </button>
                <button className={s.button} onClick={() => void improveWithAi()} disabled={saving || enhancing || !canSave}>
                  {enhancing ? 'Улучшаю...' : 'Улучшить с помощью ИИ'}
                </button>
              </div>
            </main>

            <aside className={`${s.card} ${s.summaryCard}`}>
              <div className={s.previewTitle}>Краткое резюме для ИИ</div>
              <div className={s.summary}>
                {hasEnoughForPreview
                  ? previewSummary
                  : 'Заполните несколько полей, и здесь появится компактный контекст для следующих разделов.'}
              </div>
              <div className={s.summaryNote}>
                После заполнения Luma IQ сможет точнее:
                <br />— формулировать позиционирование;
                <br />— подбирать целевую аудиторию;
                <br />— создавать УТП;
                <br />— писать контент;
                <br />— вести AI-диалог по проекту.
              </div>
              <button className={`${s.button} ${s.nextButton}`} onClick={() => void save(true)} disabled={saving || enhancing || !canSave}>
                Сохранить и перейти дальше
              </button>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
