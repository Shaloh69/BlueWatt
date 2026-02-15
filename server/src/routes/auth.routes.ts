import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { registerValidator, loginValidator } from '../validators/auth.validators';
import { validate } from '../middleware/validation.middleware';
import { authenticateJWT } from '../middleware/auth.middleware';
import { authLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

router.post('/register', authLimiter, validate(registerValidator), authController.register);

router.post('/login', authLimiter, validate(loginValidator), authController.login);

router.get('/me', authenticateJWT, authController.getCurrentUser);

export default router;
