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

const router = Router();

router.post('/register', authenticateJWT, validate(registerDeviceValidator), deviceController.registerDevice);

router.get('/', authenticateJWT, deviceController.listDevices);

router.get('/:id', authenticateJWT, validate(deviceIdParamValidator), deviceController.getDevice);

router.put('/:id', authenticateJWT, validate(updateDeviceValidator), deviceController.updateDevice);

router.put('/:id/relay', authenticateJWT, validate(updateRelayValidator), deviceController.updateRelay);

export default router;
