import { Router } from 'express';
import { b2cPsychologistController } from '../controllers/b2c-psychologist.controller';

const router = Router();

router.post('/psychologist/chat', b2cPsychologistController.chat);

export default router;
