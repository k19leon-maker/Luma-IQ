import { Router } from 'express';
import { b2cPsychologistController } from '../controllers/b2c-psychologist.controller';
import { consentController } from '../controllers/consent.controller';
import { b2cSessionController } from '../controllers/b2c-session.controller';

const router = Router();

router.use((req, res, next) => {
  if (req.get('x-semeyno-contract') !== 'v1') {
    res.status(400).json({ error: 'Unsupported Semeyno API contract' });
    return;
  }
  next();
});

router.get('/session', b2cSessionController.getState);
router.put('/session', b2cSessionController.saveState);
router.delete('/session', b2cSessionController.deleteState);
router.post('/psychologist/chat', b2cPsychologistController.chat);
router.post('/consents', consentController.logPublicConsent);

export default router;
