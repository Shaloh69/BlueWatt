import { Router } from 'express';
import { streamEvents } from '../controllers/sse.controller';
import { authenticateJWT } from '../middleware/auth.middleware';

const router = Router();

router.get('/events', authenticateJWT, streamEvents);

export default router;
