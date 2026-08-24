import type { WorkflowResponse } from '../../api/ai';
import { TG_CHANNEL_DESCRIPTION_MAX_LENGTH } from './tgChannelWorkspace';

export const TG_CHANNEL_NAME_MAX_LENGTH = 128;

export interface TgChannelDescriptionAiProposal {
  channelName: string;
  channelDescription: string;
}

function jsonContent(value: string): string {
  const normalized = value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  if (normalized.startsWith('{')) return normalized;
  const start = normalized.indexOf('{');
  const end = normalized.lastIndexOf('}');
  return start >= 0 && end > start ? normalized.slice(start, end + 1) : normalized;
}

export function parseTgChannelDescriptionProposal(
  response: Pick<WorkflowResponse, 'content' | 'structured'>,
): TgChannelDescriptionAiProposal {
  const source = response.structured && typeof response.structured === 'object'
    ? response.structured
    : JSON.parse(jsonContent(response.content)) as Record<string, unknown>;
  const channelName = typeof source.channelName === 'string' ? source.channelName.trim() : '';
  const channelDescription = typeof source.channelDescription === 'string'
    ? source.channelDescription.trim()
    : '';

  if (!channelName || channelName.length > TG_CHANNEL_NAME_MAX_LENGTH) {
    throw new Error('AI вернул некорректное название канала');
  }
  if (!channelDescription || channelDescription.length > TG_CHANNEL_DESCRIPTION_MAX_LENGTH) {
    throw new Error('AI вернул описание длиннее 250 символов');
  }

  return { channelName, channelDescription };
}
