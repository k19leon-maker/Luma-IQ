import { Router } from 'express';
import { b2cPsychologistController } from '../controllers/b2c-psychologist.controller';
import { consentController } from '../controllers/consent.controller';

const router = Router();

router.post('/psychologist/chat', b2cPsychologistController.chat);
router.post('/consents', consentController.logPublicConsent);

export default router;
