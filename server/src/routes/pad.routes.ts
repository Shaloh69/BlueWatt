import { Router } from 'express';
import { authenticateJWT, requireAdmin } from '../middleware/auth.middleware';
import {
  createPad,
  listPads,
  getMyPad,
  getPad,
  updatePad,
  deletePad,
  assignPad,
  unassignPad,
} from '../controllers/pad.controller';
import { cacheFor } from '../middleware/cache.middleware';

const router = Router();

router.post('/',              authenticateJWT, requireAdmin, createPad);
router.get('/',               authenticateJWT, requireAdmin, cacheFor(30, 'pads'), listPads);
router.get('/my',             authenticateJWT, cacheFor(30, 'pads'), getMyPad);
router.get('/:id',            authenticateJWT, cacheFor(30, 'pads'), getPad);
router.put('/:id',            authenticateJWT, requireAdmin, updatePad);
router.delete('/:id',         authenticateJWT, requireAdmin, deletePad);
router.put('/:id/assign',     authenticateJWT, requireAdmin, assignPad);
router.put('/:id/unassign',   authenticateJWT, requireAdmin, unassignPad);

export default router;
