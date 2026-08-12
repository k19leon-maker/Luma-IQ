import { caseExtractionResultSchema, caseInsightsResultSchema } from '../schemas/case-study.schema';
import { aiRuntimeService } from './ai-runtime.service';
import { caseStudyService } from './case-study.service';

function parsedContent(content: string): unknown {
  const normalized = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(normalized);
}

export const caseStudyAiService = {
  async extract(input: {
    userId: string;
    projectId: string;
    sourceText: string;
    sourceType: 'manual' | 'voice' | 'screenshot' | 'document';
    idempotencyKey?: string;
  }) {
    await caseStudyService.assertOwnedProject(input.userId, input.projectId);
    const result = await aiRuntimeService.runWorkflow({
      userId: input.userId,
      projectId: input.projectId,
      workflow: 'cases',
      step: 'extract',
      inputs: {
        sourceText: input.sourceText,
        sourceType: input.sourceType,
        transcriptChars: input.sourceText.length,
      },
      idempotencyKey: input.idempotencyKey,
    });
    const candidates = caseExtractionResultSchema.parse(parsedContent(result.content)).cases;
    return {
      candidates,
      generationId: result.generationId,
      aiPointsCharged: result.aiPointsCharged,
      aiBalanceRemaining: result.aiBalanceRemaining,
    };
  },

  async generateInsights(input: {
    userId: string;
    projectId: string;
    caseId: string;
    idempotencyKey?: string;
  }) {
    const record = await caseStudyService.get(input.userId, input.projectId, input.caseId);
    const result = await aiRuntimeService.runWorkflow({
      userId: input.userId,
      projectId: input.projectId,
      workflow: 'cases',
      step: 'insights',
      inputs: {
        title: record.title,
        beforeText: record.beforeText,
        actionsText: record.actionsText,
        afterText: record.afterText,
      },
      idempotencyKey: input.idempotencyKey,
    });
    const insights = caseInsightsResultSchema.parse(parsedContent(result.content));
    const updated = await caseStudyService.update(input.userId, input.projectId, input.caseId, insights);
    return {
      case: updated,
      generationId: result.generationId,
      aiPointsCharged: result.aiPointsCharged,
      aiBalanceRemaining: result.aiBalanceRemaining,
    };
  },
};
