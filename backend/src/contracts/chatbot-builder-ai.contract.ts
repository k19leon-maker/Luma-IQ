import { z } from 'zod';
import {
  chatbotScenarioDefinitionV1Schema,
  validateChatbotScenarioDefinition,
} from './chatbot-scenario.contract';

const warningSchema = z.string().trim().min(1).max(500);

export const chatbotBuilderProposalSchema = z.object({
  kind: z.literal('proposal'),
  summary: z.string().trim().min(1).max(800),
  proposedDefinition: chatbotScenarioDefinitionV1Schema,
  warnings: z.array(warningSchema).max(20).default([]),
}).strict().superRefine((value, ctx) => {
  const report = validateChatbotScenarioDefinition(value.proposedDefinition);
  for (const issue of report.issues) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['proposedDefinition', issue.path],
      message: issue.message,
    });
  }
});

export const chatbotBuilderAnalysisSchema = z.object({
  kind: z.literal('analysis'),
  summary: z.string().trim().min(1).max(1200),
  suggestions: z.array(z.object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(800),
    priority: z.enum(['high', 'medium', 'low']),
  }).strict()).max(20).default([]),
  warnings: z.array(warningSchema).max(20).default([]),
}).strict();

export type ChatbotBuilderProposal = z.infer<typeof chatbotBuilderProposalSchema>;
export type ChatbotBuilderAnalysis = z.infer<typeof chatbotBuilderAnalysisSchema>;
