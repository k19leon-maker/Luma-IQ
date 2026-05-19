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

const fields: Array<{
  key: keyof ExpertProfileData;
  label: string;
  hint: string;
  placeholder: string;
  multiline?: boolean;
}> = [
  {
    key: 'name',
    label: 'Имя / как к вам обращаться',
    hint: 'Факт, который сервис будет использовать в текстах и диалоге.',
    placeholder: 'Иван, Анна Петрова, Леонид',
  },
  {
    key: 'role',
    label: 'Профессия / роль эксперта',
    hint: 'Например: психолог, фитнес-тренер, диетолог, ментор, консультант, предприниматель, эксперт по найму РОПов.',
    placeholder: 'эксперт по найму РОПов',
  },
  {
    key: 'niche',
    label: 'Ниша / сфера деятельности',
    hint: 'Область, в которой вы работаете или хотите упаковаться.',
    placeholder: 'найм и построение отделов продаж для малого бизнеса',
  },
  {
    key: 'experienceYears',
    label: 'Сколько лет в профессии',
    hint: 'Можно числом или короткой фразой.',
    placeholder: '7 лет',
  },
  {
    key: 'workFormats',
    label: 'В каком формате работаете сейчас и в каком хотите начать',
    hint: 'Например: сейчас индивидуально, хочу групповую программу или курс в записи.',
    placeholder: 'Сейчас консультации 1:1 и найм под ключ, хочу запустить групповую программу.',
    multiline: true,
  },
  {
    key: 'productsAndPrices',
    label: 'Какие продукты/услуги сейчас продаете и по какой цене',
    hint: 'Перечислите текущие услуги, пакеты, консультации, программы и цены.',
    placeholder: 'Консультация 15 000 руб., подбор РОПа 250 000 руб., аудит отдела продаж 80 000 руб.',
    multiline: true,
  },
  {
    key: 'competencies',
    label: 'Главные компетенции / темы, в которых сильны',
    hint: 'Что вы точно умеете делать хорошо.',
    placeholder: 'Найм руководителей продаж, диагностика отдела продаж, построение системы мотивации.',
    multiline: true,
  },
  {
    key: 'antiPreferences',
    label: 'Что точно не хотите делать / с кем не хотите работать',
    hint: 'Ограничения важны для точного позиционирования и будущих продуктов.',
    placeholder: 'Не хочу работать с компаниями без собственника в процессе, не хочу делать холодный обзвон.',
    multiline: true,
  },
  {
    key: 'values',
    label: 'Что вам важно в работе',
    hint: 'Принципы, стиль, подход к клиентам и результату.',
    placeholder: 'Системность, честные ожидания, работа с собственником, измеримые результаты.',
    multiline: true,
  },
  {
    key: 'credentials',
    label: 'Образование, сертификаты, регалии',
    hint: 'Дипломы, обучение, профессиональные статусы, медиа, выступления.',
    placeholder: 'MBA, сертификация..., выступал на..., автор методики...',
    multiline: true,
  },
  {
    key: 'achievements',
    label: 'Опыт, достижения, цифры',
    hint: 'Кейсы, количество клиентов, годы, обороты, проценты, результаты.',
    placeholder: '40+ закрытых вакансий РОПов, 12 отделов продаж собраны с нуля, рост выручки клиентов на...',
    multiline: true,
  },
];

function buildSummary(profile: ExpertProfileData): string {
  return [
    profile.name ? `${profile.name.trim()} — ${profile.role.trim() || 'эксперт'}` : profile.role.trim(),
    profile.niche ? `Сфера: ${profile.niche.trim()}.` : '',
    profile.experienceYears ? `Опыт: ${profile.experienceYears.trim()}.` : '',
    profile.workFormats ? `Форматы: ${profile.workFormats.trim()}` : '',
    profile.productsAndPrices ? `Текущие продукты и цены: ${profile.productsAndPrices.trim()}` : '',
    profile.competencies ? `Сильные компетенции: ${profile.competencies.trim()}` : '',
    profile.achievements ? `Достижения и цифры: ${profile.achievements.trim()}` : '',
    profile.credentials ? `Регалии: ${profile.credentials.trim()}` : '',
    profile.values ? `Важно в работе: ${profile.values.trim()}` : '',
    profile.antiPreferences ? `Не хочет делать / не хочет работать с: ${profile.antiPreferences.trim()}` : '',
    profile.uploadedFileText ? `Дополнительные материалы: ${profile.uploadedFileText.trim().slice(0, 1400)}` : '',
  ].filter(Boolean).join('\n');
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
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importSourceId, setImportSourceId] = useState('');

  const summary = useMemo(() => buildSummary(profile), [profile]);
  const canSave = Boolean(profile.name.trim() || profile.role.trim() || profile.niche.trim() || profile.uploadedFileText.trim());
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
        setProfile({ ...EMPTY_PROFILE, ...(saved ?? {}) });
      })
      .catch(() => toast.error('Не удалось загрузить бриф'))
      .finally(() => setLoading(false));
  }, [activeProjectId]);

  function updateField(key: keyof ExpertProfileData, value: string) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const chunks: string[] = [];
      for (const file of Array.from(files)) {
        const text = await aiApi.extractFileText(file);
        chunks.push(`Файл "${file.name}":\n${text}`);
      }
      setProfile((current) => ({
        ...current,
        uploadedFileText: [current.uploadedFileText, ...chunks].filter(Boolean).join('\n\n---\n\n').slice(0, 12000),
      }));
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
      if (!imported || !buildSummary({ ...EMPTY_PROFILE, ...imported })) {
        toast.error('В выбранном проекте раздел "О себе" еще не заполнен');
        return;
      }
      setProfile({
        ...EMPTY_PROFILE,
        ...imported,
        completed: false,
        updatedAt: '',
      });
      setShowImport(false);
      toast.success('Данные подтянуты. Проверьте и сохраните бриф');
    } catch (err) {
      console.error('[AboutExpert] import profile error:', err);
      toast.error('Не удалось подтянуть данные');
    } finally {
      setImporting(false);
    }
  }

  async function save(goNext: boolean) {
    if (!activeProjectId) {
      toast.error('Сначала создайте проект');
      return;
    }
    if (!canSave) {
      toast.error('Заполните хотя бы имя, роль, нишу или загрузите файл');
      return;
    }

    const expertProfileData: ExpertProfileData = {
      ...profile,
      summary,
      completed: true,
      updatedAt: new Date().toISOString(),
    };

    setSaving(true);
    try {
      await projectsApi.saveStrategy(activeProjectId, { expertProfileData });
      upsertMaterial(activeProjectId, buildExpertProfileMaterial(expertProfileData));
      completeExpertProfile();
      toast.success('Бриф сохранен для текущего проекта');
      if (goNext) navigate('/strategy/positioning');
    } catch {
      toast.error('Не удалось сохранить бриф');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={s.root}>
      <div className={s.shell}>
        <header className={s.header}>
          <div>
            <h1 className={s.title}>О себе</h1>
            <p className={s.subtitle}>
              Быстрый бриф с фактами об эксперте. Эти данные относятся к текущему проекту и используются в позиционировании, ЦА, УТП, продуктах, контенте и диалоге с ИИ.
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
                    <div className={s.importTitle}>Подтянуть бриф из другого проекта</div>
                    <div className={s.importText}>
                      Данные подставятся в форму текущего проекта. Они сохранятся только после нажатия кнопки “Сохранить”.
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

              <div className={s.fields}>
                {fields.map((field) => (
                  <div className={s.field} key={field.key}>
                    <label className={s.label}>{field.label}</label>
                    <div className={s.hint}>{field.hint}</div>
                    {field.multiline ? (
                      <textarea
                        className={s.textarea}
                        value={String(profile[field.key] ?? '')}
                        onChange={(event) => updateField(field.key, event.target.value)}
                        placeholder={field.placeholder}
                      />
                    ) : (
                      <input
                        className={s.input}
                        value={String(profile[field.key] ?? '')}
                        onChange={(event) => updateField(field.key, event.target.value)}
                        placeholder={field.placeholder}
                      />
                    )}
                  </div>
                ))}

                <div className={s.field}>
                  <label className={s.label}>Текст из загруженных файлов</label>
                  <div className={s.hint}>Можно загрузить резюме, описание услуг, сайт, посты, презентацию или старый бриф. Текст попадет в контекст ИИ.</div>
                  <textarea
                    className={`${s.textarea} ${s.fileText}`}
                    value={profile.uploadedFileText}
                    onChange={(event) => updateField('uploadedFileText', event.target.value)}
                    placeholder="Загрузите файл или вставьте сюда уже готовое описание."
                  />
                </div>
              </div>

              <div className={s.actions}>
                <button className={`${s.button} ${s.secondary}`} onClick={() => void save(false)} disabled={saving || !canSave}>
                  Сохранить
                </button>
                <button className={s.button} onClick={() => void save(true)} disabled={saving || !canSave}>
                  {saving ? 'Сохраняю...' : 'Сохранить и перейти к позиционированию'}
                </button>
              </div>
            </main>

            <aside className={s.card}>
              <div className={s.previewTitle}>Краткое резюме для ИИ</div>
              <div className={s.summary}>
                {summary || 'Заполните несколько полей или загрузите файл, и здесь появится компактный контекст для следующих разделов.'}
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
