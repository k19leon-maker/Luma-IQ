import { z } from 'zod';

export const tgChannelDescriptionAiResultSchema = z.object({
  channelName: z.string().trim().min(1).max(128),
  channelDescription: z.string().trim().min(1).max(250),
}).strict();

export type TgChannelDescriptionAiResult = z.infer<typeof tgChannelDescriptionAiResultSchema>;
