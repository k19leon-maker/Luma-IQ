import type { WorkflowResponse } from '../../api/ai';
import type { TelegramScenarioDefinition } from '../../api/telegram-scenarios.api';

export type ChatbotBuilderStep = 'discover' | 'generate' | 'edit' | 'validate' | 'copy' | 'explain';

export interface ChatbotBuilderProposal {
  kind: 'proposal';
  summary: string;
  proposedDefinition: TelegramScenarioDefinition;
  warnings: string[];
}

export interface ChatbotBuilderAnalysis {
  kind: 'analysis';
  summary: string;
  suggestions: Array<{ title: string; description: string; priority: 'high' | 'medium' | 'low' }>;
  warnings: string[];
}

export type ChatbotBuilderResult = ChatbotBuilderProposal | ChatbotBuilderAnalysis;

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function parseChatbotBuilderResult(
  response: Pick<WorkflowResponse, 'content' | 'structured'>,
): ChatbotBuilderResult {
  let source = object(response.structured);
  if (source && object(source.data)) source = object(source.data);
  if (!source || (source.kind !== 'proposal' && source.kind !== 'analysis')) {
    const cleaned = response.content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    source = object(JSON.parse(cleaned));
  }
  if (!source || (source.kind !== 'proposal' && source.kind !== 'analysis')) {
    throw new Error('AI вернул ответ неизвестного формата');
  }
  return source as unknown as ChatbotBuilderResult;
}

export function scenarioDiff(current: TelegramScenarioDefinition, proposed: TelegramScenarioDefinition) {
  const currentById = new Map(current.nodes.map((node) => [node.id, node]));
  const proposedById = new Map(proposed.nodes.map((node) => [node.id, node]));
  const added = proposed.nodes.filter((node) => !currentById.has(node.id)).map((node) => node.id);
  const removed = current.nodes.filter((node) => !proposedById.has(node.id)).map((node) => node.id);
  const changed = proposed.nodes
    .filter((node) => {
      const previous = currentById.get(node.id);
      return previous && JSON.stringify(previous) !== JSON.stringify(node);
    })
    .map((node) => node.id);
  const structureChanged = JSON.stringify(current.entrypoints) !== JSON.stringify(proposed.entrypoints)
    || JSON.stringify(current.edges) !== JSON.stringify(proposed.edges)
    || JSON.stringify(current.variables) !== JSON.stringify(proposed.variables)
    || JSON.stringify(current.goals) !== JSON.stringify(proposed.goals);
  return { added, changed, removed, structureChanged };
}
