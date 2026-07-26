import type { Message } from '../services/ai.service';
import { providerCallAccountingService } from '../services/provider-call-accounting.service';
import type { MeteredProviderResult, ProviderTelemetryContext } from './provider.types';

export const anthropicProvider = {
  async message(input: {
    apiKey: string;
    model: string;
    systemPrompt: string;
    messages: Message[];
    maxTokens: number;
    telemetry: ProviderTelemetryContext;
  }): Promise<MeteredProviderResult<{ content: string }>> {
    return providerCallAccountingService.execute({
      provider: 'ANTHROPIC',
      model: input.model,
      telemetry: input.telemetry,
      execute: async () => {
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const client = new Anthropic({ apiKey: input.apiKey });
        const response = await client.messages.create({
          model: input.model,
          max_tokens: input.maxTokens,
          system: input.systemPrompt,
          messages: input.messages
            .filter((message) => message.role !== 'system')
            .map((message) => ({ role: message.role as 'user' | 'assistant', content: message.content })),
        });
        const block = response.content[0];
        const content = block?.type === 'text' ? block.text : '';
        const cachedInputTokens = Number(
          (response.usage as unknown as { cache_read_input_tokens?: number }).cache_read_input_tokens ?? 0,
        );
        return {
          result: { content },
          responseId: response.id,
          usage: {
            inputTokens: response.usage.input_tokens ?? 0,
            cachedInputTokens,
            outputTokens: response.usage.output_tokens ?? 0,
          },
        };
      },
    });
  },
};
