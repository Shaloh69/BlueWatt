import { Router } from 'express';
import { authenticateJWT } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/role.middleware';
import { listTenants, createTenant, deleteTenant } from '../controllers/admin.controller';

const router = Router();

router.get('/tenants',     authenticateJWT, requireAdmin, listTenants);
router.post('/tenants',    authenticateJWT, requireAdmin, createTenant);
router.delete('/tenants/:id', authenticateJWT, requireAdmin, deleteTenant);

export default router;
