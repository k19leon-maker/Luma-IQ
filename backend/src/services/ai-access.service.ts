import { accessPolicyService, AccessPolicyError } from './access-policy.service';

export class AiAccessError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status = 402, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const aiAccessService = {
  async consume(userId: string): Promise<void> {
    try {
      await accessPolicyService.assertCanUseFeature({
        userId,
        featureCode: 'ai_chat',
      });
    } catch (err) {
      if (err instanceof AccessPolicyError) {
        throw new AiAccessError(err.message, err.status, err.code);
      }
      throw err;
    }
  },
};
