import { Router } from 'express';
import { authenticateJWT, requireAdmin } from '../middleware/auth.middleware';
import {
  listAllBilling,
  getBillingByPad,
  getMyBilling,
  getBillingById,
  generateBilling,
  markBillingPaid,
  waiveBilling,
  deleteBilling,
} from '../controllers/billing.controller';
import {
  listSchedules,
  createSchedule,
  stopSchedule,
  deleteSchedule,
  runSchedules,
} from '../controllers/billingSchedule.controller';
import { cacheFor } from '../middleware/cache.middleware';

const router = Router();

// ── Schedules (must be before /:id to avoid route conflict) ──────────────────
router.get('/schedules', authenticateJWT, requireAdmin, listSchedules);
router.post('/schedules', authenticateJWT, requireAdmin, createSchedule);
router.post('/schedules/run', authenticateJWT, requireAdmin, runSchedules);
router.put('/schedules/:id/stop', authenticateJWT, requireAdmin, stopSchedule);
router.delete('/schedules/:id', authenticateJWT, requireAdmin, deleteSchedule);

// ── Billing periods ───────────────────────────────────────────────────────────
router.get('/', authenticateJWT, requireAdmin, cacheFor(60, 'billing'), listAllBilling);
router.get('/my', authenticateJWT, cacheFor(60, 'billing'), getMyBilling);
router.get('/pad/:padId', authenticateJWT, cacheFor(60, 'billing'), getBillingByPad);
router.get('/:id', authenticateJWT, cacheFor(60, 'billing'), getBillingById);
router.post('/generate', authenticateJWT, requireAdmin, generateBilling);
router.put('/:id/mark-paid', authenticateJWT, requireAdmin, markBillingPaid);
router.put('/:id/waive', authenticateJWT, requireAdmin, waiveBilling);
router.delete('/:id', authenticateJWT, requireAdmin, deleteBilling);

export default router;
