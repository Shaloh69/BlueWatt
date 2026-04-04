import { Router } from 'express';
import { authenticateJWT, requireAdmin } from '../middleware/auth.middleware';
import { listTenants, createTenant, deleteTenant } from '../controllers/admin.controller';

const router = Router();

router.get('/tenants',     authenticateJWT, requireAdmin, listTenants);
router.post('/tenants',    authenticateJWT, requireAdmin, createTenant);
router.delete('/tenants/:id', authenticateJWT, requireAdmin, deleteTenant);

export default router;
