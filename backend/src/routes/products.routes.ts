import { Router } from 'express';
import { productsController } from '../controllers/products.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.get('/',       requireAuth, productsController.list);
router.post('/',      requireAuth, productsController.create);
router.patch('/:id',  requireAuth, productsController.update);
router.delete('/:id', requireAuth, productsController.remove);

export default router;
