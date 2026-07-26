import { describe, expect, it } from 'vitest';
import {
  assertBatchEligible,
  deriveSettledBatchStatus,
  mapProviderBatchStatus,
} from '../../src/services/batch-job.service';
import { openAIBatchParsing } from '../../src/providers/openai-batch.provider';

describe('batch job lifecycle', () => {
  it('maps non-terminal provider states to durable public states', () => {
    expect(mapProviderBatchStatus('validating')).toBe('submitted');
    expect(mapProviderBatchStatus('in_progress')).toBe('in_progress');
    expect(mapProviderBatchStatus('finalizing')).toBe('finalizing');
    expect(mapProviderBatchStatus('cancelling')).toBe('finalizing');
  });

  it('settles a complete package', () => {
    expect(deriveSettledBatchStatus({
      providerStatus: 'completed',
      completed: 10,
      failed: 0,
      total: 10,
    })).toBe('completed');
  });

  it('settles a partially failed package without losing successful items', () => {
    expect(deriveSettledBatchStatus({
      providerStatus: 'completed',
      completed: 7,
      failed: 3,
      total: 10,
    })).toBe('partially_failed');
  });

  it('preserves cancelled and expired terminal states', () => {
    expect(deriveSettledBatchStatus({
      providerStatus: 'cancelled',
      completed: 2,
      failed: 8,
      total: 10,
    })).toBe('cancelled');
    expect(deriveSettledBatchStatus({
      providerStatus: 'expired',
      completed: 4,
      failed: 6,
      total: 10,
    })).toBe('expired');
  });

  it('rejects interactive and single-item batches', () => {
    expect(() => assertBatchEligible('content_post', true, 1)).toThrow(/минимум из двух/i);
    expect(() => assertBatchEligible('ai_chat', true, 3)).toThrow(/Диалог/i);
    expect(() => assertBatchEligible('product_main', true, 3)).toThrow(/конструкторы/i);
  });

  it('parses OpenAI output and error JSONL by custom id', () => {
    const rows = openAIBatchParsing.parseJsonl([
      JSON.stringify({
        custom_id: 'post-1',
        response: { status_code: 200, body: { choices: [{ message: { content: 'Готово' } }] } },
      }),
      JSON.stringify({
        custom_id: 'post-2',
        error: { code: 'invalid_request' },
      }),
      '',
    ].join('\n'));

    expect(rows).toHaveLength(2);
    expect(rows[0].custom_id).toBe('post-1');
    expect(rows[1].error).toMatchObject({ code: 'invalid_request' });
  });
});
