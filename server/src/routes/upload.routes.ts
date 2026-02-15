import { Router } from 'express';
import * as uploadController from '../controllers/upload.controller';
import { authenticateJWT } from '../middleware/auth.middleware';
import { upload } from '../middleware/upload.middleware';

const router = Router();

router.post(
  '/profile-image',
  authenticateJWT,
  upload.single('image'),
  uploadController.uploadUserProfileImage
);

router.post(
  '/device/:id/image',
  authenticateJWT,
  upload.single('image'),
  uploadController.uploadDeviceImage
);

export default router;
