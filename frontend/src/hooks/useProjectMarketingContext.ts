import { useEffect, useMemo, useState } from 'react';
import { projectsApi } from '../api/projects.api';
import { useAudienceStore, type AudienceAnswers } from '../store/audience.store';
import { useGeneratedStore } from '../store/generated.store';
import { useMaterialsStore } from '../store/materials.store';
import { useProjectsStore } from '../store/projects.store';
import { useUnpackingStore } from '../store/unpacking.store';
import { buildKnowledgeContext } from '../utils/projectMaterials';

interface PositioningData {
  role?: string;
  audience?: string;
  problem?: string;
  result?: string;
  statement?: string;
}

interface ExpertProfileData {
  name?: string;
  role?: string;
  niche?: string;
  experienceYears?: string;
  workFormats?: string;
  productsAndPrices?: string;
  competencies?: string;
  antiPreferences?: string;
  values?: string;
  credentials?: string;
  achievements?: string;
  uploadedFileText?: string;
  summary?: string;
}

function formatRecord(title: string, data: Record<string, unknown>): string {
  const body = Object.entries(data)
    .filter(([, value]) => typeof value === 'string' && value.trim())
    .map(([key, value]) => `${key}: ${String(value).trim()}`)
    .join('\n');
  return body ? `${title}:\n${body}` : '';
}

function formatPositioning(data: PositioningData | null): string {
  if (!data) return '';
  return [
    data.statement ? `Базовое позиционирование: ${data.statement}` : '',
    data.role ? `Роль/ниша эксперта: ${data.role}` : '',
    data.audience ? `Широкая аудитория: ${data.audience}` : '',
    data.problem ? `Главная проблема/тема: ${data.problem}` : '',
    data.result ? `Желаемый результат клиента: ${data.result}` : '',
  ].filter(Boolean).join('\n');
}

function formatExpertProfile(data: ExpertProfileData | null): string {
  if (!data) return '';
  return [
    data.summary ? `Кратко об эксперте:\n${data.summary}` : '',
    data.name ? `Имя: ${data.name}` : '',
    data.role ? `Роль эксперта: ${data.role}` : '',
    data.niche ? `Ниша: ${data.niche}` : '',
    data.experienceYears ? `Опыт: ${data.experienceYears}` : '',
    data.workFormats ? `Форматы работы: ${data.workFormats}` : '',
    data.productsAndPrices ? `Текущие продукты и цены: ${data.productsAndPrices}` : '',
    data.competencies ? `Компетенции: ${data.competencies}` : '',
    data.achievements ? `Достижения и цифры: ${data.achievements}` : '',
    data.credentials ? `Регалии: ${data.credentials}` : '',
    data.values ? `Что важно в работе: ${data.values}` : '',
    data.antiPreferences ? `Что не хочет делать / с кем не хочет работать: ${data.antiPreferences}` : '',
    data.uploadedFileText ? `Материалы из файлов:\n${data.uploadedFileText.slice(0, 2200)}` : '',
  ].filter(Boolean).join('\n');
}

function formatAudience(data: Partial<AudienceAnswers>): string {
  return [
    data.chosenSegment ? `Выбранный сегмент: ${data.chosenSegment}` : '',
    data.chosenSubsegment ? `Выбранный подсегмент: ${data.chosenSubsegment}` : '',
    data.chosenRequest ? `Выбранный запрос: ${data.chosenRequest}` : '',
    data.top3segments ? `ТОП 3 сегмента:\n${data.top3segments.slice(0, 900)}` : '',
    data.subsegments ? `Подсегменты:\n${data.subsegments.slice(0, 900)}` : '',
    data.wants ? `Желания клиентов:\n${data.wants.slice(0, 900)}` : '',
    data.top3requests ? `ТОП 3 запроса:\n${data.top3requests.slice(0, 900)}` : '',
    data.painfulQuestions ? `Болезненные вопросы:\n${data.painfulQuestions.slice(0, 900)}` : '',
    data.deepDesires ? `Сокровенные желания:\n${data.deepDesires.slice(0, 700)}` : '',
    data.finalResult ? `Конечный результат:\n${data.finalResult}` : '',
    data.corePains ? `Что бесит/изматывает:\n${data.corePains.slice(0, 900)}` : '',
  ].filter(Boolean).join('\n\n');
}

export function useProjectMarketingContext() {
  const activeProjectId = useProjectsStore((s) => s.activeProjectId);
  const projectName = useProjectsStore((s) => s.projects.find((p) => p.id === s.activeProjectId)?.name ?? 'Проект');
  const unpackingProfile = useUnpackingStore((s) => s.profileData);
  const audienceGet = useAudienceStore((s) => s.get);
  const audienceSave = useAudienceStore((s) => s.save);
  const materials = useMaterialsStore((s) => s.projects[activeProjectId] ?? []);
  const loadMaterialsFromDb = useMaterialsStore((s) => s.loadFromDb);
  const loadGeneratedFromDb = useGeneratedStore((s) => s.loadFromDb);

  const [positioning, setPositioning] = useState<PositioningData | null>(null);
  const [expertProfile, setExpertProfile] = useState<ExpertProfileData | null>(null);
  const [remoteAudience, setRemoteAudience] = useState<Partial<AudienceAnswers>>({});

  const localAudience = activeProjectId ? audienceGet(activeProjectId).answers : {};

  useEffect(() => {
    let alive = true;
    setPositioning(null);
    setExpertProfile(null);
    setRemoteAudience({});

    if (!activeProjectId || activeProjectId === 'default') return;

    void loadMaterialsFromDb(activeProjectId);
    void loadGeneratedFromDb(activeProjectId);

    projectsApi.getStrategy(activeProjectId)
      .then((data) => {
        if (!alive || !data) return;
        const raw = data as Record<string, unknown>;
        setExpertProfile((raw.expertProfileData as ExpertProfileData | undefined) ?? null);
        setPositioning((raw.positioningData as PositioningData | undefined) ?? null);
        const answers = (raw.answers as Partial<AudienceAnswers> | undefined) ?? {};
        setRemoteAudience(answers);
        if (Object.keys(answers).length > 0) {
          audienceSave(activeProjectId, answers, Boolean(raw.completed));
        }
      })
      .catch(() => {});

    return () => { alive = false; };
  }, [activeProjectId, audienceSave, loadGeneratedFromDb, loadMaterialsFromDb]);

  const audience = useMemo(
    () => ({ ...remoteAudience, ...localAudience }),
    [localAudience, remoteAudience],
  );

  const context = useMemo(() => {
    const blocks = [
      `Проект: ${projectName}`,
      formatExpertProfile(expertProfile),
      formatPositioning(positioning),
      formatAudience(audience),
      formatRecord('Дополнительная распаковка эксперта', unpackingProfile as Record<string, unknown>),
    ].filter(Boolean);

    const fallback = blocks.join('\n\n');
    return buildKnowledgeContext(
      materials,
      ['expert-profile.md', 'positioning.md', 'audience.md', 'utp.md', 'social.md', 'product-main.md', 'product-mini.md', 'lead-magnet.md'],
      fallback,
    );
  }, [audience, expertProfile, materials, positioning, projectName, unpackingProfile]);

  const mergedProfile = useMemo(() => ({
    ...unpackingProfile,
    ...(expertProfile?.name ? { expertName: expertProfile.name } : {}),
    ...(expertProfile?.role ? { specialization: expertProfile.role } : {}),
    ...(expertProfile?.niche ? { niche: expertProfile.niche } : {}),
    ...(expertProfile?.experienceYears ? { experienceYears: expertProfile.experienceYears } : {}),
    ...(expertProfile?.workFormats ? { workFormats: expertProfile.workFormats } : {}),
    ...(expertProfile?.productsAndPrices ? { productsAndPrices: expertProfile.productsAndPrices } : {}),
    ...(expertProfile?.competencies ? { competencies: expertProfile.competencies } : {}),
    ...(expertProfile?.achievements ? { achievements: expertProfile.achievements } : {}),
    ...(expertProfile?.credentials ? { credentials: expertProfile.credentials } : {}),
    ...(expertProfile?.values ? { values: expertProfile.values } : {}),
    ...(expertProfile?.antiPreferences ? { antiPreferences: expertProfile.antiPreferences } : {}),
    ...(expertProfile?.summary ? { expertProfileSummary: expertProfile.summary } : {}),
    ...(positioning?.role ? { specialization: positioning.role } : {}),
    ...(positioning?.audience ? { typicalClient: positioning.audience } : {}),
    ...(positioning?.problem ? { mainProblem: positioning.problem } : {}),
    ...(positioning?.result ? { keyResult: positioning.result } : {}),
    ...(positioning?.statement ? { positioning: positioning.statement } : {}),
    ...(audience.chosenSegment ? { chosenSegment: audience.chosenSegment } : {}),
    ...(audience.chosenSubsegment ? { chosenSubsegment: audience.chosenSubsegment } : {}),
    ...(audience.chosenRequest ? { chosenRequest: audience.chosenRequest } : {}),
  }), [audience, expertProfile, positioning, unpackingProfile]);

  return { activeProjectId, projectName, context, mergedProfile, positioning, expertProfile, audience };
}
