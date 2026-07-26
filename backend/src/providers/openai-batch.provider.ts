import { createReadStream } from 'fs';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';

export type OpenAIBatchRequest = {
  custom_id: string;
  method: 'POST';
  url: '/v1/chat/completions';
  body: Record<string, unknown>;
};

export type OpenAIBatchResult = {
  id?: string;
  custom_id: string;
  response?: {
    status_code?: number;
    request_id?: string;
    body?: {
      id?: string;
      choices?: Array<{ message?: { content?: string | null } }>;
      usage?: Record<string, unknown>;
    };
  };
  error?: Record<string, unknown> | null;
};

async function client(apiKey: string) {
  const { default: OpenAI } = await import('openai');
  return new OpenAI({ apiKey });
}

function parseJsonl(text: string): OpenAIBatchResult[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as OpenAIBatchResult);
}

export const openAIBatchProvider = {
  async submit(input: {
    apiKey: string;
    requests: OpenAIBatchRequest[];
    metadata: Record<string, string>;
    idempotencyKey: string;
  }): Promise<{
    batchId: string;
    inputFileId: string;
    status: string;
  }> {
    const openai = await client(input.apiKey);
    const path = join(tmpdir(), `lumaiq-batch-${randomUUID()}.jsonl`);
    await writeFile(path, `${input.requests.map((request) => JSON.stringify(request)).join('\n')}\n`, 'utf8');
    try {
      const file: any = await openai.files.create({
        file: createReadStream(path),
        purpose: 'batch',
      });
      const batch: any = await openai.batches.create(
        {
          input_file_id: file.id,
          endpoint: '/v1/chat/completions',
          completion_window: '24h',
          metadata: input.metadata,
        },
        { idempotencyKey: input.idempotencyKey },
      );
      return {
        batchId: String(batch.id),
        inputFileId: String(file.id),
        status: String(batch.status ?? 'validating'),
      };
    } finally {
      await unlink(path).catch(() => undefined);
    }
  },

  async retrieve(input: { apiKey: string; batchId: string }): Promise<{
    id: string;
    status: string;
    outputFileId: string | null;
    errorFileId: string | null;
    requestCounts: { total: number; completed: number; failed: number };
    errors: unknown;
  }> {
    const openai = await client(input.apiKey);
    const batch: any = await openai.batches.retrieve(input.batchId);
    return {
      id: String(batch.id),
      status: String(batch.status),
      outputFileId: batch.output_file_id ? String(batch.output_file_id) : null,
      errorFileId: batch.error_file_id ? String(batch.error_file_id) : null,
      requestCounts: {
        total: Number(batch.request_counts?.total ?? 0),
        completed: Number(batch.request_counts?.completed ?? 0),
        failed: Number(batch.request_counts?.failed ?? 0),
      },
      errors: batch.errors ?? null,
    };
  },

  async cancel(input: { apiKey: string; batchId: string }): Promise<string> {
    const openai = await client(input.apiKey);
    const batch: any = await openai.batches.cancel(input.batchId);
    return String(batch.status ?? 'cancelling');
  },

  async downloadResults(input: { apiKey: string; fileId: string }): Promise<OpenAIBatchResult[]> {
    const openai = await client(input.apiKey);
    const response: any = await openai.files.content(input.fileId);
    return parseJsonl(await response.text());
  },
};

export const openAIBatchParsing = {
  parseJsonl,
};
