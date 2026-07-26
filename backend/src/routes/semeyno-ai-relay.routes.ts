import { Router } from 'express';
import { semeynoAiRelayController } from '../controllers/semeyno-ai-relay.controller';

const router = Router();

router.post('/responses', semeynoAiRelayController.responses);

export default router;
