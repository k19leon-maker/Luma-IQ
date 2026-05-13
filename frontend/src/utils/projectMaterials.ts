import type { AudienceAnswers } from '../store/audience.store';
import type { ProductDraft, SocialDraft } from '../store/generated.store';
import type { ProjectMaterial } from '../store/materials.store';

interface PositioningData {
  role?: string;
  audience?: string;
  problem?: string;
  result?: string;
  statement?: string;
}

function section(title: string, value?: string): string {
  const text = value?.trim();
  return text ? `## ${title}\n${text}` : '';
}

export function summarizeMaterial(content: string): string {
  return content.replace(/\s+/g, ' ').trim().slice(0, 1200);
}

export function buildPositioningMaterial(data: PositioningData): Omit<ProjectMaterial, 'updatedAt'> {
  const content = [
    '# Позиционирование',
    section('Базовая формулировка', data.statement),
    section('Роль / ниша эксперта', data.role),
    section('Широкая аудитория', data.audience),
    section('Главная проблема', data.problem),
    section('Желаемый результат', data.result),
  ].filter(Boolean).join('\n\n');

  return {
    id: 'positioning.md',
    kind: 'positioning',
    title: 'positioning.md',
    content,
    summary: summarizeMaterial(content),
  };
}

export function buildAudienceMaterial(answers: Partial<AudienceAnswers>): Omit<ProjectMaterial, 'updatedAt'> {
  const content = [
    '# Целевая аудитория',
    section('10 сегментов', answers.segments),
    section('ТОП 3 сегмента', answers.top3segments),
    section('Выбранный сегмент', answers.chosenSegment),
    section('Подсегменты', answers.subsegments),
    section('Выбранный подсегмент', answers.chosenSubsegment),
    section('Все хочу', answers.wants),
    section('10 запросов', answers.requests),
    section('ТОП 3 запроса', answers.top3requests),
    section('Выбранный запрос', answers.chosenRequest),
    section('Болезненные вопросы', answers.painfulQuestions),
    section('Сокровенные желания', answers.deepDesires),
    section('Конечный результат', answers.finalResult),
    section('Что бесит больше всего', answers.corePains),
  ].filter(Boolean).join('\n\n');

  return {
    id: 'audience.md',
    kind: 'audience',
    title: 'audience.md',
    content,
    summary: summarizeMaterial(content),
  };
}

export function buildUtpMaterial(value: string): Omit<ProjectMaterial, 'updatedAt'> {
  const content = ['# УТП', value.trim()].filter(Boolean).join('\n\n');
  return { id: 'utp.md', kind: 'utp', title: 'utp.md', content, summary: summarizeMaterial(content) };
}

export function buildSocialMaterial(value: Partial<SocialDraft>): Omit<ProjectMaterial, 'updatedAt'> {
  const content = [
    '# Оформление соцсетей',
    section('Instagram', value.instagram),
    section('Telegram', value.telegram),
    section('ВКонтакте', value.vk),
  ].filter(Boolean).join('\n\n');

  return { id: 'social.md', kind: 'social', title: 'social.md', content, summary: summarizeMaterial(content) };
}

export function buildProductMaterial(
  kind: 'product-main' | 'product-mini' | 'lead-magnet',
  title: string,
  value: ProductDraft,
): Omit<ProjectMaterial, 'updatedAt'> {
  const fileName = `${kind}.md`;
  const content = [
    `# ${title}`,
    section('Название', value.name),
    section('Цена', value.price),
    section('Формат', value.format),
    section('Длительность', value.duration),
    section('Описание', value.description),
  ].filter(Boolean).join('\n\n');

  return { id: fileName, kind, title: fileName, content, summary: summarizeMaterial(content) };
}

export function buildKnowledgeContext(
  materials: ProjectMaterial[],
  preferredIds: string[],
  fallback = '',
): string {
  const byId = new Map(materials.map((item) => [item.id, item]));
  const selected = preferredIds
    .map((id) => byId.get(id))
    .filter((item): item is ProjectMaterial => Boolean(item));

  const extras = materials
    .filter((item) => !preferredIds.includes(item.id))
    .slice(0, 4);

  const materialContext = [...selected, ...extras]
    .map((item) => `Файл: ${item.title}\n${item.summary || summarizeMaterial(item.content)}`)
    .join('\n\n---\n\n');

  return [materialContext, fallback].filter(Boolean).join('\n\n---\n\n').slice(0, 5500);
}
