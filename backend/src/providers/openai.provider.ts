import type { ReadStream } from 'fs';
import type { Message } from '../services/ai.service';
import type { TokenUsage } from '../services/ai-cost.service';
import { providerCallAccountingService } from '../services/provider-call-accounting.service';
import type { MeteredProviderResult, ProviderTelemetryContext } from './provider.types';

function textUsage(usage: any): TokenUsage {
  const inputTokens = Number(usage?.prompt_tokens ?? usage?.input_tokens ?? 0);
  const outputTokens = Number(usage?.completion_tokens ?? usage?.output_tokens ?? 0);
  return {
    inputTokens,
    cachedInputTokens: Number(
      usage?.prompt_tokens_details?.cached_tokens
      ?? usage?.input_tokens_details?.cached_tokens
      ?? 0,
    ),
    outputTokens,
    reasoningTokens: Number(
      usage?.completion_tokens_details?.reasoning_tokens
      ?? usage?.output_tokens_details?.reasoning_tokens
      ?? 0,
    ),
  };
}

function audioUsage(usage: any): TokenUsage {
  return {
    inputTokens: Number(usage?.input_tokens ?? 0),
    outputTokens: Number(usage?.output_tokens ?? 0),
    audioInputTokens: Number(
      usage?.input_token_details?.audio_tokens
      ?? usage?.input_tokens_details?.audio_tokens
      ?? 0,
    ),
    audioOutputTokens: Number(
      usage?.output_token_details?.audio_tokens
      ?? usage?.output_tokens_details?.audio_tokens
      ?? 0,
    ),
  };
}

async function client(apiKey: string) {
  const { default: OpenAI } = await import('openai');
  return new OpenAI({ apiKey });
}

export const openAIProvider = {
  async chatCompletion(input: {
    apiKey: string;
    model: string;
    messages: Message[];
    maxTokens: number;
    temperature?: number;
    telemetry: ProviderTelemetryContext;
  }): Promise<MeteredProviderResult<{ content: string }>> {
    return providerCallAccountingService.execute({
      provider: 'OPENAI',
      model: input.model,
      telemetry: input.telemetry,
      execute: async () => {
        const openai = await client(input.apiKey);
        const params: Record<string, unknown> = {
          model: input.model,
          messages: input.messages,
        };
        if (input.model.startsWith('gpt-5')) {
          params.max_completion_tokens = input.maxTokens;
        } else {
          params.max_tokens = input.maxTokens;
          params.temperature = input.temperature ?? 0.7;
        }
        const response: any = await openai.chat.completions.create(params as never);
        return {
          result: { content: response.choices?.[0]?.message?.content ?? '' },
          responseId: response.id ?? null,
          usage: textUsage(response.usage),
        };
      },
    });
  },

  async responses(input: {
    apiKey: string;
    model: string;
    request: Record<string, unknown>;
    telemetry: ProviderTelemetryContext;
  }): Promise<MeteredProviderResult<any>> {
    return providerCallAccountingService.execute({
      provider: 'OPENAI',
      model: input.model,
      telemetry: input.telemetry,
      execute: async () => {
        const openai = await client(input.apiKey);
        const response: any = await openai.responses.create(input.request as never);
        return {
          result: response,
          responseId: response.id ?? null,
          usage: textUsage(response.usage),
        };
      },
    });
  },

  async transcribe(input: {
    apiKey: string;
    model: string;
    file: ReadStream;
    language?: string;
    diarize?: boolean;
    telemetry: ProviderTelemetryContext;
  }): Promise<MeteredProviderResult<{ text: string }>> {
    return providerCallAccountingService.execute({
      provider: 'OPENAI',
      model: input.model,
      telemetry: input.telemetry,
      execute: async () => {
        const openai = await client(input.apiKey);
        const response: any = await openai.audio.transcriptions.create({
          model: input.model,
          file: input.file,
          language: input.language,
          ...(input.diarize
            ? {
              response_format: 'diarized_json',
              chunking_strategy: 'auto',
            }
            : {}),
        } as never);
        const diarizedText = Array.isArray(response.segments)
          ? response.segments
            .map((segment: { speaker?: string; text?: string }) => {
              const text = String(segment.text ?? '').trim();
              if (!text) return '';
              return `${segment.speaker || 'Спикер'}: ${text}`;
            })
            .filter(Boolean)
            .join('\n')
          : '';
        return {
          result: { text: diarizedText || String(response.text ?? '') },
          responseId: response.id ?? null,
          usage: audioUsage(response.usage),
        };
      },
    });
  },
};
