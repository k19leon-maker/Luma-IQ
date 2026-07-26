import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import type { AIActionDefinition, AIActionKey } from '../config/ai-action-registry';
import { prisma } from '../lib/prisma';
import {
  type ContextBlock,
  type ProjectContextBundle,
  projectContextService,
} from './project-context.service';

const TOKEN_CHAR_RATIO = 4;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function hash(value: unknown): string {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

function estimateTokens(content: string): number {
  return Math.ceil(content.length / TOKEN_CHAR_RATIO);
}

function blockWeight(block: ContextBlock): number {
  if (block.priority === 'critical') return 5;
  if (block.priority === 'high') return 3;
  if (block.priority === 'medium') return 2;
  return 1;
}

function meaningfulTrim(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;
  const paragraphs = content.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const kept: string[] = [];
  let used = 0;
  for (const paragraph of paragraphs) {
    if (used + paragraph.length > maxChars) break;
    kept.push(paragraph);
    used += paragraph.length + 2;
  }
  if (kept.length) return `${kept.join('\n\n')}\n...[контекст сокращён]`;
  return `${content.slice(0, Math.max(0, maxChars - 24)).trim()}\n...[контекст сокращён]`;
}

function compressBlocks(blocks: ContextBlock[], tokenBudget: number) {
  const sourceTokens = blocks.reduce((sum, block) => sum + estimateTokens(block.content), 0);
  if (sourceTokens <= tokenBudget) {
    return { blocks, sourceTokens, compressed: false, droppedBlockKeys: [] as string[] };
  }

  const maxChars = tokenBudget * TOKEN_CHAR_RATIO;
  const totalWeight = blocks.reduce((sum, block) => sum + blockWeight(block), 0);
  const compressedBlocks = blocks
    .map((block) => {
      const share = Math.max(240, Math.floor(maxChars * (blockWeight(block) / totalWeight)));
      return { ...block, content: meaningfulTrim(block.content, share) };
    })
    .filter((block) => block.content.trim());

  const renderedLength = compressedBlocks.reduce((sum, block) => sum + block.content.length, 0);
  const droppedBlockKeys = blocks
    .filter((block) => !compressedBlocks.some((candidate) => candidate.key === block.key))
    .map((block) => block.key);

  if (renderedLength <= maxChars) {
    return { blocks: compressedBlocks, sourceTokens, compressed: true, droppedBlockKeys };
  }

  const ordered = [...compressedBlocks].sort((left, right) => blockWeight(right) - blockWeight(left));
  const selected: ContextBlock[] = [];
  let used = 0;
  for (const block of ordered) {
    if (used + block.content.length > maxChars && block.priority !== 'critical') {
      droppedBlockKeys.push(block.key);
      continue;
    }
    selected.push(block);
    used += block.content.length;
  }
  return {
    blocks: selected.sort((left, right) => blocks.findIndex((item) => item.key === left.key)
      - blocks.findIndex((item) => item.key === right.key)),
    sourceTokens,
    compressed: true,
    droppedBlockKeys,
  };
}

function render(blocks: ContextBlock[]): string {
  return blocks.map((block) => `## ${block.title}\n${block.content}`).join('\n\n');
}

export type BuiltTaskContext = {
  bundle: ProjectContextBundle;
  compactJson: {
    contextVersion: string;
    blocks: Array<{ key: string; title: string; content: string }>;
  };
  summaryId: string | null;
  summaryVersion: number;
  sourceHash: string;
  promptCacheKey: string;
  cacheHit: boolean;
  compressed: boolean;
  sourceTokens: number;
  approxTokens: number;
  droppedBlockKeys: string[];
};

export const contextBuilderService = {
  stablePromptCacheKey(input: {
    actionKey: AIActionKey;
    stage: string;
    promptVersion: string;
    contextVersion: string;
    sourceHash: string;
  }): string {
    return `prompt:${hash(input)}`;
  },

  async build(input: {
    userId: string;
    projectId: string;
    workflow: string;
    step?: string;
    actionKey: AIActionKey;
    actionDefinition: AIActionDefinition;
    inputs: Record<string, unknown>;
    promptVersion: string;
    stage?: string;
  }): Promise<BuiltTaskContext> {
    const base = await projectContextService.build({
      userId: input.userId,
      projectId: input.projectId,
      workflow: input.workflow,
      step: input.step,
      inputs: input.inputs,
      tokenBudget: input.actionDefinition.contextBudget,
    });
    const compressed = compressBlocks(base.blocks, input.actionDefinition.contextBudget);
    const rendered = render(compressed.blocks);
    const approxTokens = estimateTokens(rendered);
    const sourceHash = hash({
      projectId: input.projectId,
      workflow: input.workflow,
      step: input.step ?? null,
      contextVersion: base.contextVersion,
      blocks: base.blocks,
    });
    const promptCacheKey = contextBuilderService.stablePromptCacheKey({
      actionKey: input.actionKey,
      stage: input.stage ?? input.step ?? 'pipeline',
      promptVersion: input.promptVersion,
      contextVersion: base.contextVersion,
      sourceHash,
    });
    const scope = `task:${input.actionKey}:${input.workflow}:${input.step ?? 'pipeline'}`;
    const store = prisma.aIContextSummary;
    let summary = store
      ? await store.findFirst({
        where: { userId: input.userId, projectId: input.projectId, scope, sourceHash },
      })
      : null;
    const cacheHit = Boolean(summary);

    if (!summary && store) {
      const latest = await store.findFirst({
        where: { userId: input.userId, projectId: input.projectId, scope },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      summary = await store.create({
        data: {
          userId: input.userId,
          projectId: input.projectId,
          scope,
          version: (latest?.version ?? 0) + 1,
          contextVersion: base.contextVersion,
          sourceHash,
          cacheKey: promptCacheKey,
          content: rendered,
          data: {
            blocks: compressed.blocks.map((block) => ({
              key: block.key,
              title: block.title,
              priority: block.priority,
              content: block.content,
            })),
          } as Prisma.InputJsonValue,
          approxTokens,
          sourceTokens: compressed.sourceTokens,
          compressed: compressed.compressed,
          metadata: {
            actionKey: input.actionKey,
            workflow: input.workflow,
            step: input.step ?? null,
            droppedBlockKeys: compressed.droppedBlockKeys,
          },
        },
      }).catch(async () => store.findFirst({
        where: { userId: input.userId, projectId: input.projectId, scope, sourceHash },
      }));
    }

    const bundle: ProjectContextBundle = {
      ...base,
      blocks: compressed.blocks,
      rendered,
      approxTokens,
      contextVersion: `${base.contextVersion}:summary-v${summary?.version ?? 1}`,
    };
    return {
      bundle,
      compactJson: {
        contextVersion: bundle.contextVersion,
        blocks: compressed.blocks.map((block) => ({
          key: block.key,
          title: block.title,
          content: block.content,
        })),
      },
      summaryId: summary?.id ?? null,
      summaryVersion: summary?.version ?? 1,
      sourceHash,
      promptCacheKey,
      cacheHit,
      compressed: compressed.compressed,
      sourceTokens: compressed.sourceTokens,
      approxTokens,
      droppedBlockKeys: compressed.droppedBlockKeys,
    };
  },
};
