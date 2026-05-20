import type { AudienceAnswers } from '../store/audience.store';
import type { ProductDraft, SocialDraft } from '../store/generated.store';
import type { ProjectMaterial } from '../store/materials.store';

interface PositioningData {
  role?: string;
  audience?: string;
  problem?: string;
  result?: string;
  statement?: string;
  selectedVariant?: string;
  strategicAnalysis?: string;
  marketGap?: string;
  score?: string;
  assets?: string;
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

function section(title: string, value?: string): string {
  const text = value?.trim();
  return text ? `## ${title}\n${text}` : '';
}

export function summarizeMaterial(content: string): string {
  return content.replace(/\s+/g, ' ').trim().slice(0, 1200);
}

export function buildExpertProfileMaterial(data: ExpertProfileData): Omit<ProjectMaterial, 'updatedAt'> {
  const content = [
    '# О себе',
    section('Краткое резюме для ИИ', data.summary),
    section('Имя', data.name),
    section('Профессия / роль эксперта', data.role),
    section('Ниша / сфера деятельности', data.niche),
    section('Опыт', data.experienceYears),
    section('Форматы работы', data.workFormats),
    section('Текущие продукты и цены', data.productsAndPrices),
    section('Главные компетенции', data.competencies),
    section('Что не подходит', data.antiPreferences),
    section('Что важно в работе', data.values),
    section('Образование и регалии', data.credentials),
    section('Опыт, достижения, цифры', data.achievements),
    section('Текст из загруженных файлов', data.uploadedFileText?.slice(0, 4000)),
  ].filter(Boolean).join('\n\n');

  return {
    id: 'expert-profile.md',
    kind: 'expert-profile',
    title: 'expert-profile.md',
    content,
    summary: summarizeMaterial(content),
    linkedMaterialIds: ['positioning.md', 'audience.md', 'utp.md', 'social.md', 'product-main.md', 'product-mini.md', 'lead-magnet.md'],
  };
}

export function buildPositioningMaterial(data: PositioningData): Omit<ProjectMaterial, 'updatedAt'> {
  const content = [
    '# Позиционирование',
    section('Базовая формулировка', data.statement),
    section('Выбранный стратегический вариант', data.selectedVariant),
    section('Роль / ниша эксперта', data.role),
    section('Широкая аудитория', data.audience),
    section('Главная проблема', data.problem),
    section('Желаемый результат', data.result),
    section('AI Strategic Analysis', data.strategicAnalysis),
    section('Market Gap Analysis', data.marketGap),
    section('Positioning Score', data.score),
    section('Positioning Assets', data.assets),
  ].filter(Boolean).join('\n\n');

  return {
    id: 'positioning.md',
    kind: 'positioning',
    title: 'positioning.md',
    content,
    summary: summarizeMaterial(content),
    linkedMaterialIds: ['expert-profile.md', 'audience.md', 'utp.md'],
  };
}

export function buildAudienceMaterial(answers: Partial<AudienceAnswers>): Omit<ProjectMaterial, 'updatedAt'> {
  const strategicBrief = [
    answers.chosenSegment ? `- Ключевой сегмент: ${answers.chosenSegment}` : '',
    answers.chosenSubsegment ? `- Рабочий подсегмент: ${answers.chosenSubsegment}` : '',
    answers.chosenRequest ? `- Главный запрос: ${answers.chosenRequest}` : '',
    answers.finalResult ? `- Желаемый конечный результат клиента: ${answers.finalResult}` : '',
  ].filter(Boolean).join('\n');

  const content = [
    '# Целевая аудитория',
    section('Стратегическое ядро для следующих разделов', strategicBrief),
    section(
      'Как использовать этот материал',
      [
        '- УТП, оформление соцсетей и офферы должны опираться в первую очередь на выбранный сегмент, подсегмент, главный запрос, боли, желания и конечный результат.',
        '- Продукты и лид-магниты нужно строить вокруг уже найденного спроса, а не вокруг абстрактных идей.',
        '- Контент должен говорить языком клиента из блоков «Болезненные вопросы», «Сокровенные желания» и «Что бесит больше всего».',
      ].join('\n'),
    ),
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
    linkedMaterialIds: ['expert-profile.md', 'positioning.md', 'utp.md', 'product-main.md', 'product-mini.md', 'lead-magnet.md'],
  };
}

export function buildUtpMaterial(value: string): Omit<ProjectMaterial, 'updatedAt'> {
  const content = ['# УТП', value.trim()].filter(Boolean).join('\n\n');
  return {
    id: 'utp.md',
    kind: 'utp',
    title: 'utp.md',
    content,
    summary: summarizeMaterial(content),
    linkedMaterialIds: ['expert-profile.md', 'positioning.md', 'audience.md', 'social.md', 'product-main.md', 'product-mini.md', 'lead-magnet.md'],
  };
}

export function buildSocialMaterial(value: Partial<SocialDraft>): Omit<ProjectMaterial, 'updatedAt'> {
  const content = [
    '# Оформление соцсетей',
    section('Instagram', value.instagram),
    section('Telegram', value.telegram),
    section('ВКонтакте', value.vk),
  ].filter(Boolean).join('\n\n');

  return {
    id: 'social.md',
    kind: 'social',
    title: 'social.md',
    content,
    summary: summarizeMaterial(content),
    linkedMaterialIds: ['expert-profile.md', 'positioning.md', 'audience.md', 'utp.md'],
  };
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

  const linkedMaterialIds = kind === 'product-main'
    ? ['expert-profile.md', 'positioning.md', 'audience.md', 'utp.md', 'product-mini.md', 'lead-magnet.md']
    : kind === 'product-mini'
      ? ['expert-profile.md', 'positioning.md', 'audience.md', 'utp.md', 'product-main.md', 'lead-magnet.md']
      : ['expert-profile.md', 'positioning.md', 'audience.md', 'utp.md', 'product-mini.md', 'product-main.md'];

  return { id: fileName, kind, title: fileName, content, summary: summarizeMaterial(content), linkedMaterialIds };
}

export function buildKnowledgeContext(
  materials: ProjectMaterial[],
  preferredIds: string[],
  fallback = '',
): string {
  const byId = new Map(materials.map((item) => [item.id, item]));
  const linkedIds = preferredIds.flatMap((id) => byId.get(id)?.linkedMaterialIds ?? []);
  const selectedIds = Array.from(new Set([...preferredIds, ...linkedIds]));
  const selected = selectedIds
    .map((id) => byId.get(id))
    .filter((item): item is ProjectMaterial => Boolean(item));

  const extras = materials
    .filter((item) => !selectedIds.includes(item.id))
    .slice(0, 4);

  const materialContext = [...selected, ...extras]
    .map((item) => `Файл: ${item.title}\n${item.summary || summarizeMaterial(item.content)}`)
    .join('\n\n---\n\n');

  return [materialContext, fallback].filter(Boolean).join('\n\n---\n\n').slice(0, 5500);
}
