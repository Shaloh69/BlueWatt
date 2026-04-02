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

const router = Router();

router.post('/',              authenticateJWT, requireAdmin, createPad);
router.get('/',               authenticateJWT, requireAdmin, listPads);
router.get('/my',             authenticateJWT, getMyPad);
router.get('/:id',            authenticateJWT, getPad);
router.put('/:id',            authenticateJWT, requireAdmin, updatePad);
router.delete('/:id',         authenticateJWT, requireAdmin, deletePad);
router.put('/:id/assign',     authenticateJWT, requireAdmin, assignPad);
router.put('/:id/unassign',   authenticateJWT, requireAdmin, unassignPad);

export default router;
