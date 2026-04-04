import { Request, Response, NextFunction } from 'express';
import { DeviceModel } from '../models/device.model';
import { PowerReadingModel } from '../models/powerReading.model';
import { AppError } from '../utils/AppError';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { HTTP_STATUS, ERROR_CODES } from '../config/constants';
import { PowerDataRequest } from '../types/api';
import { sseService } from '../services/sse.service';
import { logger } from '../utils/logger';

export const submitPowerData = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { device_id, timestamp, voltage_rms, current_rms, power_apparent, power_real, power_factor, energy_kwh, frequency } =
    req.body as PowerDataRequest & { energy_kwh?: number; frequency?: number };

  logger.info(`[ESP] Power data received from "${device_id}" — ${voltage_rms?.toFixed(1)} V, ${current_rms?.toFixed(3)} A, ${power_real?.toFixed(1)} W`);

  const device = await DeviceModel.findByDeviceId(device_id);

  if (!device) {
    logger.warn(`[ESP] Power data rejected — unknown device_id "${device_id}"`);
    throw new AppError('Device not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.DEVICE_NOT_FOUND);
  }

  if (!device.is_active) {
    logger.warn(`[ESP] Power data rejected — device "${device_id}" is inactive`);
    throw new AppError('Device is not active', HTTP_STATUS.FORBIDDEN, ERROR_CODES.DEVICE_INACTIVE);
  }

  const readingTimestamp = new Date(timestamp * 1000);

  await PowerReadingModel.create(
    device.id,
    readingTimestamp,
    voltage_rms,
    current_rms,
    power_apparent,
    power_real,
    power_factor,
    energy_kwh,
    frequency
  );

  await DeviceModel.updateLastSeen(device.id);

  // Notify all admin clients so the device card flips from Offline → Online in real time
  sseService.broadcastToAll('device_heartbeat', { device_id: device.id });

  // Forward live reading to SSE subscribers of this device
  sseService.sendToDevice(device.id, 'power_reading', {
    device_id: device.id,
    timestamp,
    voltage_rms,
    current_rms,
    power_real,
    power_apparent,
    power_factor,
    energy_kwh,
    frequency,
  });

  sendSuccess(res, { message: 'Power data recorded successfully' }, HTTP_STATUS.CREATED);
});

export const getPowerData = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
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

  const startTime = req.query.start_time ? new Date(req.query.start_time as string) : new Date(Date.now() - 24 * 60 * 60 * 1000);
  const endTime = req.query.end_time ? new Date(req.query.end_time as string) : new Date();
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 1000;

  const readings = await PowerReadingModel.findByDeviceAndTimeRange(deviceId, startTime, endTime, limit);

  sendSuccess(res, { readings, count: readings.length });
});

export const getLatestPowerData = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
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

  const latestReading = await PowerReadingModel.findLatestByDevice(deviceId);

  if (!latestReading) {
    throw new AppError('No power data available', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);
  }

  sendSuccess(res, { reading: latestReading });
});

export const getPowerStats = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
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

  const startTime = req.query.start_time ? new Date(req.query.start_time as string) : new Date(Date.now() - 24 * 60 * 60 * 1000);
  const endTime = req.query.end_time ? new Date(req.query.end_time as string) : new Date();

  const stats = await PowerReadingModel.getAverageByDeviceAndTimeRange(deviceId, startTime, endTime);

  if (!stats) {
    throw new AppError('No data available for this time range', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);
  }

  sendSuccess(res, { stats });
});
