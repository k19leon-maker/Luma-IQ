import type { WorkflowResponse } from '../api/ai';
import type { InstagramHighlightDraft, InstagramStoryDraft } from '../api/projects.api';

export type InstagramStoryAiDraft = Omit<InstagramStoryDraft, 'id' | 'position'>;
export type InstagramHighlightAiDraft = Omit<InstagramHighlightDraft, 'id' | 'position' | 'stories'> & {
  stories: InstagramStoryAiDraft[];
};

const FORMATS = new Set<InstagramStoryDraft['format']>([
  'talking_head',
  'text',
  'screen_recording',
  'b_roll',
  'poll',
  'quiz',
  'question',
  'custom',
]);

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AI вернул неверный формат');
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`AI не заполнил поле «${field}»`);
  return value.trim();
}

function parseRoot(response: WorkflowResponse): Record<string, unknown> {
  if (response.structured) return object(response.structured);
  const normalized = response.content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return object(JSON.parse(normalized));
}

function missingFacts(root: Record<string, unknown>): string[] {
  if (!Array.isArray(root.missingFacts)) throw new Error('AI не вернул список недостающих фактов');
  return root.missingFacts.map((item) => text(item, 'missingFacts'));
}

function story(value: unknown): InstagramStoryAiDraft {
  const item = object(value);
  const format = text(item.format, 'формат') as InstagramStoryDraft['format'];
  if (!FORMATS.has(format)) throw new Error('AI вернул неизвестный формат сторис');
  const result: InstagramStoryAiDraft = {
    title: text(item.title, 'название'),
    role: text(item.role, 'роль'),
    goal: text(item.goal, 'цель'),
    format,
    customFormat: text(item.customFormat, 'собственный формат'),
    frame: text(item.frame, 'кадр'),
    screenText: text(item.screenText, 'экранный текст'),
    speech: text(item.speech, 'речь'),
    interactive: text(item.interactive, 'интерактив'),
    callToAction: text(item.callToAction, 'призыв'),
    transition: text(item.transition, 'переход'),
  };
  if (!result.title || (format === 'custom' && !result.customFormat)) {
    throw new Error('AI вернул неполную сторис');
  }
  return result;
}

function highlight(value: unknown): InstagramHighlightAiDraft {
  const item = object(value);
  if (!Array.isArray(item.stories)) throw new Error('AI не вернул сценарии сторис');
  const result: InstagramHighlightAiDraft = {
    title: text(item.title, 'название Highlight'),
    goal: text(item.goal, 'цель Highlight'),
    description: text(item.description, 'описание Highlight'),
    icon: text(item.icon, 'обозначение Highlight'),
    stories: item.stories.map(story),
  };
  if (!result.title) throw new Error('AI вернул Highlight без названия');
  return result;
}

export function parseHighlightsProposal(response: WorkflowResponse) {
  const root = parseRoot(response);
  if (!Array.isArray(root.highlights)) throw new Error('AI не вернул Highlights');
  return { highlights: root.highlights.map(highlight), missingFacts: missingFacts(root) };
}

export function parseScenarioProposal(response: WorkflowResponse) {
  const root = parseRoot(response);
  if (!Array.isArray(root.stories)) throw new Error('AI не вернул сценарий');
  return { stories: root.stories.map(story), missingFacts: missingFacts(root) };
}

export function parseHighlightProposal(response: WorkflowResponse) {
  const root = parseRoot(response);
  return { highlight: highlight(root.highlight), missingFacts: missingFacts(root) };
}

export function parseStoryProposal(response: WorkflowResponse) {
  const root = parseRoot(response);
  return { story: story(root.story), missingFacts: missingFacts(root) };
}

export function storyDraft(
  proposal: InstagramStoryAiDraft,
  id: string,
  position: number,
): InstagramStoryDraft {
  return { id, position, ...proposal };
}
