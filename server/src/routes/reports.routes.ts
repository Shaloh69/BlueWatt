import { Router } from 'express';
import { authenticateJWT, requireAdmin } from '../middleware/auth.middleware';
import {
  getHourlyReport,
  getDailyReport,
  getAllDailyReport,
  getMonthlyReport,
  getPadSummary,
  getAnomalyReport,
  getAnomalySummary,
  exportCsv,
} from '../controllers/reports.controller';
import { cacheFor } from '../middleware/cache.middleware';

const router = Router();

// Power reports — cache for 5 min (historical data doesn't change frequently)
router.get('/hourly/:deviceId', authenticateJWT, cacheFor(300, 'reports'), getHourlyReport);
router.get('/daily/:deviceId/all', authenticateJWT, cacheFor(300, 'reports'), getAllDailyReport);
router.get('/daily/:deviceId', authenticateJWT, cacheFor(300, 'reports'), getDailyReport);
router.get('/monthly/:deviceId', authenticateJWT, cacheFor(300, 'reports'), getMonthlyReport);
router.get('/pad-summary', authenticateJWT, requireAdmin, cacheFor(300, 'reports'), getPadSummary);

// Anomaly reports
router.get(
  '/anomalies/summary',
  authenticateJWT,
  requireAdmin,
  cacheFor(120, 'reports'),
  getAnomalySummary
);
router.get('/anomalies/:deviceId', authenticateJWT, cacheFor(120, 'reports'), getAnomalyReport);

// CSV export — no cache (blob response)
router.get('/export/:deviceId', authenticateJWT, exportCsv);

export default router;
