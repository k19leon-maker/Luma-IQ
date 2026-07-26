import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { adminController } from '../controllers/admin.controller';
import { aiConfigurationController } from '../controllers/ai-configuration.controller';
import { aiEconomicsV2Controller } from '../controllers/ai-economics-v2.controller';

const router = Router();

const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов в админке. Попробуйте позже.' },
});

router.use(requireAuth, requireAdmin);
router.use(adminLimiter);

router.get('/dashboard', adminController.dashboard);
router.get('/plans', adminController.listPlans);
router.patch('/plans/:code', adminController.updatePlanCatalog);
router.get('/ai-config', aiConfigurationController.snapshot);
router.get('/ai-economics-v2', aiEconomicsV2Controller.report);
router.post('/ai-economics-v2/apply-price', aiEconomicsV2Controller.applyPrice);
router.post('/ai-economics-v2/simulate', aiEconomicsV2Controller.simulate);
router.get('/ai-economics-v2/reconcile', aiEconomicsV2Controller.reconcile);
router.get('/ai-config/pilot-metrics', aiConfigurationController.pilotMetrics);
router.patch('/ai-config/flags/:key', aiConfigurationController.setFlag);
router.post('/ai-config/model-profiles', aiConfigurationController.createModelProfile);
router.post('/ai-config/action-pricing', aiConfigurationController.createActionPricing);
router.post('/ai-config/action-definitions', aiConfigurationController.createActionDefinition);
router.post('/ai-config/ai-points/reconcile/:userId', aiConfigurationController.reconcileUserAiPoints);
router.post('/ai-config/ai-points/sweep', aiConfigurationController.sweepAiPointReservations);
router.post('/ai-config/ai-points/refund', aiConfigurationController.refundAiPoints);
router.get('/workflows', adminController.listWorkflows);
router.get('/prompts', adminController.listPrompts);
router.post('/prompts/versions', adminController.createPromptVersion);
router.post('/prompts/experiments', adminController.createPromptExperiment);
router.get('/prompts/experiments/:id/stats', adminController.promptExperimentStats);
router.get('/users', adminController.listUsers);
router.get('/users/:id', adminController.getUser);
router.post('/users/grant-pro', adminController.grantPro);
router.post('/users/:id/plan', adminController.updateUserPlan);
router.patch('/users/:id/access', adminController.updateUserAccess);
router.patch('/users/:id/archive', adminController.archiveUser);
router.post('/users/:id/credits', adminController.addUserCredits);
router.post('/users/:id/impersonate', adminController.impersonateUser);

export default router;
