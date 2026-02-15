import { Request, Response, NextFunction } from 'express';
import { DeviceModel } from '../models/device.model';
import { DeviceKeyModel } from '../models/deviceKey.model';
import { ApiKeyService } from '../services/apiKey.service';
import { HashService } from '../services/hash.service';
import { AppError } from '../utils/AppError';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { HTTP_STATUS, ERROR_CODES } from '../config/constants';
import { DeviceRegistrationRequest } from '../types/api';

export const registerDevice = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  if (!req.user) {
    throw new AppError('User not authenticated', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
  }

  const { device_id, device_name, location } = req.body as DeviceRegistrationRequest;

  const existingDevice = await DeviceModel.findByDeviceId(device_id);
  if (existingDevice) {
    throw new AppError('Device ID already registered', HTTP_STATUS.CONFLICT, ERROR_CODES.DUPLICATE_ENTRY);
  }

  const device = await DeviceModel.create(req.user.id, device_id, device_name, location);

  const apiKey = ApiKeyService.generateApiKey();
  const apiKeyHash = await HashService.hashApiKey(apiKey);

  await DeviceKeyModel.create(device.id, apiKeyHash, 'Default Key');

  sendSuccess(
    res,
    {
      device: {
        id: device.id,
        device_id: device.device_id,
        name: device.device_name,
        location: device.location,
        is_active: device.is_active,
      },
      api_key: apiKey,
    },
    HTTP_STATUS.CREATED,
    'Device registered successfully. Save the API key - it will not be shown again.'
  );
});

export const listDevices = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  if (!req.user) {
    throw new AppError('User not authenticated', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
  }

  const devices = await DeviceModel.findByUserId(req.user.id);

  sendSuccess(res, { devices });
});

export const getDevice = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  if (!req.user) {
    throw new AppError('User not authenticated', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
  }

  const deviceId = parseInt(req.params.id, 10);

  const device = await DeviceModel.findById(deviceId);

  if (!device) {
    throw new AppError('Device not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.DEVICE_NOT_FOUND);
  }

  const isOwner = await DeviceModel.isOwnedByUser(deviceId, req.user.id);

  if (!isOwner) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN);
  }

  sendSuccess(res, { device });
});

export const updateDevice = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  if (!req.user) {
    throw new AppError('User not authenticated', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
  }

  const deviceId = parseInt(req.params.id, 10);

  const device = await DeviceModel.findById(deviceId);

  if (!device) {
    throw new AppError('Device not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.DEVICE_NOT_FOUND);
  }

  const isOwner = await DeviceModel.isOwnedByUser(deviceId, req.user.id);

  if (!isOwner) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN);
  }

  const { device_name, location, is_active } = req.body;

  await DeviceModel.update(deviceId, { device_name, location, is_active });

  const updatedDevice = await DeviceModel.findById(deviceId);

  sendSuccess(res, { device: updatedDevice }, HTTP_STATUS.OK, 'Device updated successfully');
});

export const updateRelay = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  if (!req.user) {
    throw new AppError('User not authenticated', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
  }

  const deviceId = parseInt(req.params.id, 10);

  const device = await DeviceModel.findById(deviceId);

  if (!device) {
    throw new AppError('Device not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.DEVICE_NOT_FOUND);
  }

  const isOwner = await DeviceModel.isOwnedByUser(deviceId, req.user.id);

  if (!isOwner) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN);
  }

  const { relay_status } = req.body;

  await DeviceModel.update(deviceId, { relay_status });

  const updatedDevice = await DeviceModel.findById(deviceId);

  sendSuccess(res, { device: updatedDevice }, HTTP_STATUS.OK, 'Relay status updated successfully');
});
