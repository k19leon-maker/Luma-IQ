import { TgChannelResult, TgPlanItem, TgPostDraft } from './tgChannelWorkspace';

export interface TgChannelIdeaProposal {
  role: string;
  readerTask: string;
  topic: string;
  keyMessage: string;
  cta: string;
}

function parseJsonContent(content: string): Record<string, unknown> {
  const normalized = content.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = normalized.indexOf('{');
  const end = normalized.lastIndexOf('}');
  const json = start >= 0 && end > start ? normalized.slice(start, end + 1) : normalized;
  const value = JSON.parse(json) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('AI вернул некорректный JSON');
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, field: string): string {
  const result = typeof value === 'string' ? value.trim() : '';
  if (!result) throw new Error(`AI не заполнил поле ${field}`);
  return result;
}

export function parseTgChannelIdeaProposal(content: string): TgChannelIdeaProposal {
  const value = parseJsonContent(content);
  return {
    role: requiredText(value.role, 'role'),
    readerTask: requiredText(value.readerTask, 'readerTask'),
    topic: requiredText(value.topic, 'topic'),
    keyMessage: requiredText(value.keyMessage, 'keyMessage'),
    cta: typeof value.cta === 'string' ? value.cta.trim() : '',
  };
}

export function parseTgChannelPostProposal(content: string): TgPostDraft {
  const value = parseJsonContent(content);
  return {
    title: requiredText(value.title, 'title'),
    text: requiredText(value.text, 'text'),
    callToAction: typeof value.callToAction === 'string' ? value.callToAction.trim() : '',
    authorComment: typeof value.authorComment === 'string' ? value.authorComment.trim() : '',
    status: value.status === 'draft' ? 'draft' : 'ready',
  };
}

export function applyTgChannelIdeaProposal(
  current: TgPlanItem,
  proposal: TgChannelIdeaProposal,
): TgPlanItem {
  return {
    ...current,
    role: proposal.role,
    clientTask: proposal.readerTask,
    topic: proposal.topic,
    keyMessage: proposal.keyMessage,
    callToAction: proposal.cta,
  };
}

export function applyTgChannelPostProposal(
  current: TgPostDraft,
  proposed: TgPostDraft,
  createdAt = new Date().toISOString(),
): TgPostDraft {
  return {
    ...proposed,
    previousAiVersion: {
      title: current.title,
      text: current.text,
      callToAction: current.callToAction,
      authorComment: current.authorComment,
      createdAt,
    },
  };
}

function excerpt(value: string, max = 240): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length > max ? `${compact.slice(0, max)}…` : compact;
}

export function buildTgChannelGenerationContext(result: TgChannelResult, selected: TgPlanItem) {
  const selectedIndex = result.items.findIndex((item) => item.id === selected.id);
  const neighboring = result.items.filter((_, index) => (
    index !== selectedIndex && Math.abs(index - selectedIndex) <= 2
  ));
  const planSummary = result.items.map((item) => ({
    position: item.number,
    role: item.role,
    topic: item.topic,
    keyMessage: item.keyMessage,
    status: item.status,
  }));
  const completedPostsSummary = result.items
    .filter((item) => Boolean(item.post) && item.id !== selected.id)
    .map((item) => ({
      position: item.number,
      title: item.post?.title ?? item.topic,
      role: item.role,
      purpose: item.post?.authorComment || item.clientTask,
      excerpt: excerpt(item.post?.text ?? ''),
    }));

  return {
    planSummary: JSON.stringify(planSummary),
    neighboringIdeas: JSON.stringify(neighboring.map((item) => ({
      position: item.number,
      role: item.role,
      topic: item.topic,
      keyMessage: item.keyMessage,
    }))),
    completedPostsSummary: JSON.stringify(completedPostsSummary),
  };
}
