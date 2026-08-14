import { beforeEach, describe, expect, it, vi } from 'vitest';

const generationRunMock = vi.hoisted(() => vi.fn());
const actionResolveMock = vi.hoisted(() => vi.fn());
const routeMock = vi.hoisted(() => vi.fn());
const responsesMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/config/env', () => ({ env: { OPENAI_API_KEY: 'configured-test-key' } }));
vi.mock('../../src/services/ai-generation.service', () => ({ aiGenerationService: { run: generationRunMock } }));
vi.mock('../../src/services/ai-action-registry.service', () => ({ aiActionRegistryService: { resolve: actionResolveMock } }));
vi.mock('../../src/services/model-router.service', () => ({ modelRouterService: { routeForAttempt: routeMock } }));
vi.mock('../../src/providers/openai.provider', () => ({ openAIProvider: { responses: responsesMock } }));

import { caseStudyOcrService } from '../../src/services/case-study-ocr.service';

describe('caseStudyOcrService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionResolveMock.mockResolvedValue({
      pipeline: [{ stage: 'extract', modelAlias: 'LUNA', reasoning: 'low' }],
      outputLimit: 10_000,
    });
    routeMock.mockResolvedValue({ provider: 'OPENAI', selectedAlias: 'LUNA', actualModelId: 'gpt-5.6-luna' });
    responsesMock.mockResolvedValue({
      result: { output_text: 'Клиенты приходили по рекомендациям.' },
      usage: { input_tokens: 12, output_tokens: 8 },
    });
    generationRunMock.mockImplementation(async (input: { execute: (context: { generationId: string }) => Promise<{ result: { text: string } }> }) => {
      const executed = await input.execute({ generationId: 'ocr-generation-1' });
      return { result: executed.result, generationId: 'ocr-generation-1', aiPointsCharged: 20, aiBalanceRemaining: 980 };
    });
  });

  it('sends screenshots to OpenAI Responses and returns editable text', async () => {
    const result = await caseStudyOcrService.recognize({
      userId: 'user-1', projectId: 'project-1', idempotencyKey: 'ocr-key-123',
      sources: [{ fileName: 'screen.png', mimeType: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]) }],
    });

    expect(generationRunMock).toHaveBeenCalledWith(expect.objectContaining({
      featureCode: 'cases_extract_case', actionKey: 'cases_extract_case', provider: 'OPENAI',
      metadata: expect.objectContaining({ sourceKind: 'screenshots', sourceCount: 1 }),
    }));
    expect(responsesMock).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-5.6-luna',
      request: expect.objectContaining({ input: [expect.objectContaining({ content: expect.arrayContaining([
        expect.objectContaining({ type: 'input_image', image_url: expect.stringContaining('data:image/png;base64,') }),
      ]) })] }),
      telemetry: expect.objectContaining({ pipeline: 'cases.ocr', generationId: 'ocr-generation-1' }),
    }));
    expect(result).toMatchObject({ text: 'Клиенты приходили по рекомендациям.', aiPointsCharged: 20 });
  });

  it('sends a scanned PDF as an OpenAI input file', async () => {
    await caseStudyOcrService.recognize({
      userId: 'user-1', projectId: 'project-1', kind: 'pdf_scan',
      sources: [{ fileName: 'scan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7') }],
    });

    expect(responsesMock).toHaveBeenCalledWith(expect.objectContaining({
      request: expect.objectContaining({ input: [expect.objectContaining({ content: expect.arrayContaining([
        expect.objectContaining({ type: 'input_file', filename: 'scan.pdf', file_data: expect.stringContaining('data:application/pdf;base64,') }),
      ]) })] }),
    }));
  });
});
