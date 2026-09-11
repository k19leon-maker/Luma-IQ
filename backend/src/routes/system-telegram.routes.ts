import { Router } from 'express';
import { systemTelegramController } from '../controllers/system-telegram.controller';

const router = Router();

router.post('/webhook', systemTelegramController.webhook);

export default router;
