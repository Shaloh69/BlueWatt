import { Router } from 'express';
import { authenticateJWT, requireAdmin } from '../middleware/auth.middleware';
import {
  getHourlyReport,
  getDailyReport,
  getMonthlyReport,
  getPadSummary,
  getAnomalyReport,
  getAnomalySummary,
  exportCsv,
} from '../controllers/reports.controller';

const router = Router();

// Power reports
router.get('/hourly/:deviceId',    authenticateJWT, getHourlyReport);
router.get('/daily/:deviceId',     authenticateJWT, getDailyReport);
router.get('/monthly/:deviceId',   authenticateJWT, getMonthlyReport);
router.get('/pad-summary',         authenticateJWT, requireAdmin, getPadSummary);

// Anomaly reports
router.get('/anomalies/summary',         authenticateJWT, requireAdmin, getAnomalySummary);
router.get('/anomalies/:deviceId',       authenticateJWT, getAnomalyReport);

// CSV export
router.get('/export/:deviceId',    authenticateJWT, exportCsv);

export default router;
