import { useEffect, useState } from 'react';
import { aiApi } from '../../api/ai';
import type { AiActionQuote } from '../../api/ai';

const quoteCache = new Map<string, AiActionQuote>();
const quoteRequests = new Map<string, Promise<AiActionQuote>>();

function loadCost(
  cacheKey: string,
  workflow: string,
  projectId: string,
  inputs: Record<string, unknown>,
): Promise<AiActionQuote> {
  const cached = quoteCache.get(cacheKey);
  if (cached !== undefined) return Promise.resolve(cached);
  const pending = quoteRequests.get(cacheKey);
  if (pending) return pending;
  const request = aiApi.quoteWorkflow(workflow, { projectId, inputs })
    .then((quote) => {
      quoteCache.set(cacheKey, quote);
      return quote;
    })
    .finally(() => quoteRequests.delete(cacheKey));
  quoteRequests.set(cacheKey, request);
  return request;
}

export default function AiWorkflowCost({
  workflow,
  projectId,
  inputs = {},
}: {
  workflow: string;
  projectId?: string | null;
  inputs?: Record<string, unknown>;
}) {
  const inputsKey = JSON.stringify(inputs);
  const cacheKey = `${projectId ?? ''}:${workflow}:${inputsKey}`;
  const [quote, setQuote] = useState<AiActionQuote | null>(quoteCache.get(cacheKey) ?? null);

  useEffect(() => {
    if (!projectId) return;
    let current = true;
    const refresh = () => {
      quoteCache.delete(cacheKey);
      void loadCost(cacheKey, workflow, projectId, inputs)
        .then((nextQuote) => {
          if (current) setQuote(nextQuote);
        })
        .catch(() => undefined);
    };
    refresh();
    window.addEventListener('lumaiq:ai-balance-changed', refresh);
    return () => {
      current = false;
      window.removeEventListener('lumaiq:ai-balance-changed', refresh);
    };
  }, [cacheKey, projectId, workflow]);

  if (!quote) return null;
  if (!quote.affordable) {
    return <span title={`Доступно ${quote.aiBalanceRemaining} AI-баллов`}> · недостаточно AI-баллов</span>;
  }
  return <> · {quote.aiPoints} AI-баллов · останется {quote.aiBalanceAfter}</>;
}
