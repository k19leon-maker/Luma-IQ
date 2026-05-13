import { useEffect, useMemo, useState } from 'react';
import { projectsApi } from '../api/projects.api';
import { useAudienceStore, type AudienceAnswers } from '../store/audience.store';
import { useProjectsStore } from '../store/projects.store';
import { useUnpackingStore } from '../store/unpacking.store';

interface PositioningData {
  role?: string;
  audience?: string;
  problem?: string;
  result?: string;
  statement?: string;
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

function formatAudience(data: Partial<AudienceAnswers>): string {
  return [
    data.chosenSegment ? `Выбранный сегмент: ${data.chosenSegment}` : '',
    data.chosenSubsegment ? `Выбранный подсегмент: ${data.chosenSubsegment}` : '',
    data.chosenRequest ? `Выбранный запрос: ${data.chosenRequest}` : '',
    data.top3segments ? `ТОП 3 сегмента:\n${data.top3segments}` : '',
    data.subsegments ? `Подсегменты:\n${data.subsegments}` : '',
    data.wants ? `Желания клиентов:\n${data.wants}` : '',
    data.top3requests ? `ТОП 3 запроса:\n${data.top3requests}` : '',
    data.painfulQuestions ? `Болезненные вопросы:\n${data.painfulQuestions}` : '',
    data.deepDesires ? `Сокровенные желания:\n${data.deepDesires}` : '',
    data.finalResult ? `Конечный результат:\n${data.finalResult}` : '',
    data.corePains ? `Что бесит/изматывает:\n${data.corePains}` : '',
  ].filter(Boolean).join('\n\n');
}

export function useProjectMarketingContext() {
  const activeProjectId = useProjectsStore((s) => s.activeProjectId);
  const projectName = useProjectsStore((s) => s.projects.find((p) => p.id === s.activeProjectId)?.name ?? 'Проект');
  const unpackingProfile = useUnpackingStore((s) => s.profileData);
  const audienceGet = useAudienceStore((s) => s.get);

  const [positioning, setPositioning] = useState<PositioningData | null>(null);
  const [remoteAudience, setRemoteAudience] = useState<Partial<AudienceAnswers>>({});

  const localAudience = activeProjectId ? audienceGet(activeProjectId).answers : {};

  useEffect(() => {
    let alive = true;
    setPositioning(null);
    setRemoteAudience({});

    if (!activeProjectId || activeProjectId === 'default') return;

    projectsApi.getStrategy(activeProjectId)
      .then((data) => {
        if (!alive || !data) return;
        const raw = data as Record<string, unknown>;
        setPositioning((raw.positioningData as PositioningData | undefined) ?? null);
        setRemoteAudience((raw.answers as Partial<AudienceAnswers> | undefined) ?? {});
      })
      .catch(() => {});

    return () => { alive = false; };
  }, [activeProjectId]);

  const audience = useMemo(
    () => ({ ...remoteAudience, ...localAudience }),
    [localAudience, remoteAudience],
  );

  const context = useMemo(() => {
    const blocks = [
      `Проект: ${projectName}`,
      formatPositioning(positioning),
      formatAudience(audience),
      formatRecord('Дополнительная распаковка эксперта', unpackingProfile as Record<string, unknown>),
    ].filter(Boolean);

    return blocks.join('\n\n').slice(0, 12000);
  }, [audience, positioning, projectName, unpackingProfile]);

  const mergedProfile = useMemo(() => ({
    ...unpackingProfile,
    ...(positioning?.role ? { specialization: positioning.role } : {}),
    ...(positioning?.audience ? { typicalClient: positioning.audience } : {}),
    ...(positioning?.problem ? { mainProblem: positioning.problem } : {}),
    ...(positioning?.result ? { keyResult: positioning.result } : {}),
    ...(positioning?.statement ? { positioning: positioning.statement } : {}),
    ...(audience.chosenSegment ? { chosenSegment: audience.chosenSegment } : {}),
    ...(audience.chosenSubsegment ? { chosenSubsegment: audience.chosenSubsegment } : {}),
    ...(audience.chosenRequest ? { chosenRequest: audience.chosenRequest } : {}),
  }), [audience, positioning, unpackingProfile]);

  return { activeProjectId, projectName, context, mergedProfile, positioning, audience };
}
