import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import type { Message } from './ai.service';
import { prisma } from '../lib/prisma';

function compactMessages(messages: Message[], maxChars: number): string {
  const rendered = messages
    .map((message) => `${message.role === 'assistant' ? 'AI' : message.role === 'system' ? 'Система' : 'Пользователь'}: ${message.content.trim()}`)
    .filter((line) => !line.endsWith(':'));
  const selected: string[] = [];
  let used = 0;
  for (const line of [...rendered].reverse()) {
    if (used + line.length > maxChars) break;
    selected.unshift(line);
    used += line.length + 1;
  }
  return selected.join('\n');
}

export const dialogSummaryService = {
  async get(input: { userId: string; projectId: string; conversationKey?: string }) {
    return prisma.aIContextSummary.findFirst({
      where: {
        userId: input.userId,
        projectId: input.projectId,
        scope: `dialog:${input.conversationKey ?? 'default'}`,
      },
      orderBy: { version: 'desc' },
    });
  },

  async append(input: {
    userId: string;
    projectId: string;
    conversationKey?: string;
    messages: Message[];
    maxTokens?: number;
  }) {
    const scope = `dialog:${input.conversationKey ?? 'default'}`;
    const previous = await dialogSummaryService.get(input);
    const maxChars = (input.maxTokens ?? 2_000) * 4;
    const content = compactMessages([
      ...(previous?.content ? [{ role: 'system' as const, content: `Предыдущее резюме:\n${previous.content}` }] : []),
      ...input.messages,
    ], maxChars);
    const sourceHash = crypto.createHash('sha256').update(content).digest('hex');
    if (previous?.sourceHash === sourceHash) return { summary: previous, cacheHit: true };
    const cacheKey = `dialog-summary:${crypto.createHash('sha256').update(`${scope}:${sourceHash}`).digest('hex')}`;
    const summary = await prisma.aIContextSummary.create({
      data: {
        userId: input.userId,
        projectId: input.projectId,
        scope,
        version: (previous?.version ?? 0) + 1,
        contextVersion: 'dialog-summary-v1',
        sourceHash,
        cacheKey,
        content,
        data: {
          messagesIncluded: input.messages.length,
          previousSummaryId: previous?.id ?? null,
        } as Prisma.InputJsonValue,
        approxTokens: Math.ceil(content.length / 4),
        sourceTokens: Math.ceil(input.messages.reduce((sum, message) => sum + message.content.length, 0) / 4),
        compressed: content.length >= maxChars - 64,
        metadata: { rolling: true },
      },
    });
    return { summary, cacheHit: false };
  },
};
