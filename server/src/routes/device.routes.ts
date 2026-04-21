import { Router } from 'express';
import * as deviceController from '../controllers/device.controller';
import {
  registerDeviceValidator,
  updateDeviceValidator,
  updateRelayValidator,
  deviceIdParamValidator,
} from '../validators/device.validators';
import { validate } from '../middleware/validation.middleware';
import { authenticateJWT } from '../middleware/auth.middleware';
import { cacheFor } from '../middleware/cache.middleware';

const router = Router();

router.post('/register', authenticateJWT, validate(registerDeviceValidator), deviceController.registerDevice);

router.get('/', authenticateJWT, cacheFor(30, 'devices'), deviceController.listDevices);

router.get('/:id', authenticateJWT, cacheFor(30, 'devices'), validate(deviceIdParamValidator), deviceController.getDevice);

router.put('/:id', authenticateJWT, validate(updateDeviceValidator), deviceController.updateDevice);

router.put('/:id/relay', authenticateJWT, validate(updateRelayValidator), deviceController.updateRelay);

router.delete('/:id', authenticateJWT, validate(deviceIdParamValidator), deviceController.deleteDevice);

router.post('/:id/keys/regenerate', authenticateJWT, validate(deviceIdParamValidator), deviceController.regenerateDeviceKey);

export default router;
