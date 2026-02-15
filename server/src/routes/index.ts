import { Router } from 'express';
import authRoutes from './auth.routes';
import deviceRoutes from './device.routes';
import powerDataRoutes from './powerData.routes';
import anomalyEventRoutes from './anomalyEvent.routes';
import uploadRoutes from './upload.routes';
import sseRoutes from './sse.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/devices', deviceRoutes);
router.use('/power-data', powerDataRoutes);
router.use('/anomaly-events', anomalyEventRoutes);
router.use('/upload', uploadRoutes);
router.use('/sse', sseRoutes);

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
