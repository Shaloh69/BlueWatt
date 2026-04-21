import { Router } from 'express';
import { authenticateJWT, requireAdmin } from '../middleware/auth.middleware';
import { listStays, getStaysByPad, getStay, checkIn, checkOut, deleteStay, generateBillNow } from '../controllers/stay.controller';

const router = Router();

router.get('/',              authenticateJWT, requireAdmin, listStays);
router.get('/pad/:padId',    authenticateJWT, requireAdmin, getStaysByPad);
router.get('/:id',           authenticateJWT, requireAdmin, getStay);
router.post('/',             authenticateJWT, requireAdmin, checkIn);
router.put('/:id/checkout',       authenticateJWT, requireAdmin, checkOut);
router.post('/:id/generate-bill', authenticateJWT, requireAdmin, generateBillNow);
router.delete('/:id',             authenticateJWT, requireAdmin, deleteStay);

export default router;
