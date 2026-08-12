import { Router } from 'express';
import { caseStudyController } from '../controllers/case-study.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.get('/:projectId/cases', requireAuth, caseStudyController.list);
router.post('/:projectId/cases', requireAuth, caseStudyController.create);
router.post('/:projectId/cases/extract', requireAuth, caseStudyController.extract);
router.post('/:projectId/cases/batch', requireAuth, caseStudyController.createBatch);
router.get('/:projectId/cases/:caseId', requireAuth, caseStudyController.get);
router.post('/:projectId/cases/:caseId/generate-insights', requireAuth, caseStudyController.generateInsights);
router.patch('/:projectId/cases/:caseId', requireAuth, caseStudyController.update);
router.delete('/:projectId/cases/:caseId', requireAuth, caseStudyController.remove);

export default router;
