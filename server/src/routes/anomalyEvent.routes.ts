import { Router } from 'express';
import * as anomalyEventController from '../controllers/anomalyEvent.controller';
import { anomalyEventValidator, resolveAnomalyValidator } from '../validators/anomalyEvent.validators';
import { deviceIdParamValidator } from '../validators/device.validators';
import { queryTimeRangeValidator } from '../validators/powerData.validators';
import { validate } from '../middleware/validation.middleware';
import { authenticateJWT, authenticateApiKey } from '../middleware/auth.middleware';
import { deviceDataLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

router.post(
  '/',
  authenticateApiKey,
  deviceDataLimiter,
  validate(anomalyEventValidator),
  anomalyEventController.submitAnomalyEvent
);

router.get(
  '/devices/:id/anomaly-events',
  authenticateJWT,
  validate([...deviceIdParamValidator, ...queryTimeRangeValidator]),
  anomalyEventController.getAnomalyEvents
);

router.get(
  '/devices/:id/anomaly-events/unresolved',
  authenticateJWT,
  validate(deviceIdParamValidator),
  anomalyEventController.getUnresolvedAnomalies
);

router.put(
  '/anomaly-events/:id/resolve',
  authenticateJWT,
  validate(resolveAnomalyValidator),
  anomalyEventController.resolveAnomaly
);

export default router;
