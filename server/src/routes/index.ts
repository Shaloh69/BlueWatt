import { Router } from 'express';
import authRoutes from './auth.routes';
import adminRoutes from './admin.routes';
import deviceRoutes from './device.routes';
import powerDataRoutes from './powerData.routes';
import anomalyEventRoutes from './anomalyEvent.routes';
import uploadRoutes from './upload.routes';
import sseRoutes from './sse.routes';
import padRoutes from './pad.routes';
import billingRoutes from './billing.routes';
import paymentRoutes from './payment.routes';
import reportsRoutes from './reports.routes';
import relayCommandRoutes from './relayCommand.routes';
import stayRoutes from './stay.routes';

const router = Router();

router.use('/auth',           authRoutes);
router.use('/admin',          adminRoutes);
router.use('/devices',        deviceRoutes);
router.use('/devices',        relayCommandRoutes);   // /:id/relay-command
router.use('/power-data',     powerDataRoutes);
router.use('/anomaly-events', anomalyEventRoutes);
router.use('/upload',         uploadRoutes);
router.use('/sse',            sseRoutes);
router.use('/pads',           padRoutes);
router.use('/billing',        billingRoutes);
router.use('/payments',       paymentRoutes);
router.use('/reports',        reportsRoutes);
router.use('/stays',          stayRoutes);

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
