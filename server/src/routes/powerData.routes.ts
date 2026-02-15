import { Router } from 'express';
import * as powerDataController from '../controllers/powerData.controller';
import { powerDataValidator, queryTimeRangeValidator } from '../validators/powerData.validators';
import { deviceIdParamValidator } from '../validators/device.validators';
import { validate } from '../middleware/validation.middleware';
import { authenticateJWT, authenticateApiKey } from '../middleware/auth.middleware';
import { deviceDataLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

router.post('/', authenticateApiKey, deviceDataLimiter, validate(powerDataValidator), powerDataController.submitPowerData);

router.get(
  '/devices/:id/power-data',
  authenticateJWT,
  validate([...deviceIdParamValidator, ...queryTimeRangeValidator]),
  powerDataController.getPowerData
);

router.get(
  '/devices/:id/power-data/latest',
  authenticateJWT,
  validate(deviceIdParamValidator),
  powerDataController.getLatestPowerData
);

router.get(
  '/devices/:id/power-data/stats',
  authenticateJWT,
  validate([...deviceIdParamValidator, ...queryTimeRangeValidator]),
  powerDataController.getPowerStats
);

export default router;
