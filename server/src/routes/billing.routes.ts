import { Router } from 'express';
import { authenticateJWT, requireAdmin } from '../middleware/auth.middleware';
import {
  listAllBilling,
  getBillingByPad,
  getMyBilling,
  getBillingById,
  generateBilling,
  waiveBilling,
} from '../controllers/billing.controller';

const router = Router();

router.get('/',                    authenticateJWT, requireAdmin, listAllBilling);
router.get('/my',                  authenticateJWT, getMyBilling);
router.get('/pad/:padId',          authenticateJWT, getBillingByPad);
router.get('/:id',                 authenticateJWT, getBillingById);
router.post('/generate',           authenticateJWT, requireAdmin, generateBilling);
router.put('/:id/waive',           authenticateJWT, requireAdmin, waiveBilling);

export default router;
