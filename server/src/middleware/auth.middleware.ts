import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { ApiKeyService } from '../services/apiKey.service';
import { AppError } from '../utils/AppError';
import { HTTP_STATUS, ERROR_CODES } from '../config/constants';
import { UserModel } from '../models/user.model';
import { DeviceKeyModel } from '../models/deviceKey.model';
import { DeviceModel } from '../models/device.model';
import { logger } from '../utils/logger';

export const authenticateJWT = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const queryToken = req.query.token as string | undefined;

    if (!authHeader?.startsWith('Bearer ') && !queryToken) {
      throw new AppError('No token provided', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
    }

    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : queryToken!;

    const payload = AuthService.verifyAccessToken(token);

    const user = await UserModel.findById(payload.userId);

    if (!user) {
      throw new AppError('User not found', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      next(new AppError('Invalid token', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED));
    }
  }
};

export const authenticateApiKey = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
      logger.warn(`[ESP] No X-API-Key header — ${req.method} ${req.path} from ${req.ip}`);
      throw new AppError('No API key provided', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
    }

    const masked = apiKey.length > 12
      ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`
      : apiKey;
    logger.info(`[ESP] Key received: "${masked}"  len=${apiKey.length}  expected=67  ${req.method} ${req.path}`);

    if (!ApiKeyService.isValidFormat(apiKey)) {
      logger.warn(`[ESP] Format check FAILED — len=${apiKey.length} prefix="${apiKey.slice(0, 3)}" key_part_len=${apiKey.length - 3}`);
      throw new AppError('Invalid API key format', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
    }

    const deviceKeys = await DeviceKeyModel.findAllActive();

    if (deviceKeys.length === 0) {
      logger.warn(`[Auth] No active device keys in DB — register a device first`);
    } else {
      const summary = deviceKeys.map(k => `key#${k.id}→device#${k.device_id}`).join(', ');
      logger.info(`[Auth] ${deviceKeys.length} active key(s) found: [${summary}]`);
    }

    let matchedDeviceId: number | null = null;

    for (const deviceKey of deviceKeys) {
      if (apiKey === deviceKey.key_hash) {
        matchedDeviceId = deviceKey.device_id;
        await DeviceKeyModel.updateLastUsed(deviceKey.id);
        break;
      }
    }

    // Trust-on-first-use: if no key matched, find the device by serial and
    // auto-register the received key if that device has no keys yet.
    if (!matchedDeviceId) {
      const deviceSerial: string | undefined =
        (req.params.id as string | undefined) ||
        (req.body?.device_id as string | undefined);

      if (deviceSerial) {
        const candidate = await DeviceModel.findByDeviceId(deviceSerial);
        if (candidate) {
          const existingKeys = await DeviceKeyModel.findByDeviceId(candidate.id);
          if (existingKeys.length === 0) {
            await DeviceKeyModel.create(candidate.id, apiKey, 'Auto-registered');
            matchedDeviceId = candidate.id;
            logger.info(`[Auth] TOFU: auto-registered key for device "${deviceSerial}" — key starts "${apiKey.slice(0, 10)}..."`);
          } else {
            logger.warn(`[ESP] Key mismatch for "${deviceSerial}" — device has ${existingKeys.length} key(s) but none matched`);
          }
        }
      }

      if (!matchedDeviceId) {
        logger.warn(`[ESP] API key rejected (IP: ${req.ip}) — no match, no keyless device found`);
        throw new AppError('Invalid API key', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
      }
    }

    const device = await DeviceModel.findById(matchedDeviceId);

    if (!device) {
      logger.warn(`[ESP] API key matched but device ID ${matchedDeviceId} not found in DB`);
      throw new AppError('Device not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.DEVICE_NOT_FOUND);
    }

    if (!device.is_active) {
      logger.warn(`[ESP] Device "${device.device_id}" authenticated but is inactive — rejecting`);
      throw new AppError('Device is not active', HTTP_STATUS.FORBIDDEN, ERROR_CODES.DEVICE_INACTIVE);
    }

    logger.info(`[ESP] Device "${device.device_id}" connected (ID: ${device.id}, IP: ${req.ip}) → ${req.method} ${req.path}`);

    req.device = device;
    req.deviceId = device.id;

    await DeviceModel.updateLastSeen(device.id);

    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      next(new AppError('Authentication failed', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED));
    }
  }
};

export const requireAdmin = (req: Request, _res: Response, next: NextFunction): void => {
  if (!req.user || req.user.role !== 'admin') {
    throw new AppError('Admin access required', HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN);
  }
  next();
};
