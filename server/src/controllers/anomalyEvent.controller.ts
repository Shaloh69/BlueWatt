import { Request, Response, NextFunction } from 'express';
import { DeviceModel } from '../models/device.model';
import { AnomalyEventModel } from '../models/anomalyEvent.model';
import { sseService } from '../services/sse.service';
import { AppError } from '../utils/AppError';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { HTTP_STATUS, ERROR_CODES } from '../config/constants';
import { AnomalyEventRequest } from '../types/api';
import { logger } from '../utils/logger';

export const submitAnomalyEvent = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { device_id, timestamp, anomaly_type, current, voltage, power, relay_tripped, severity } =
    req.body as AnomalyEventRequest;

  const device = await DeviceModel.findByDeviceId(device_id);

  if (!device) {
    throw new AppError('Device not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.DEVICE_NOT_FOUND);
  }

  if (!device.is_active) {
    throw new AppError('Device is not active', HTTP_STATUS.FORBIDDEN, ERROR_CODES.DEVICE_INACTIVE);
  }

  const eventTimestamp = new Date(timestamp * 1000);

  const determinedSeverity = relay_tripped ? 'critical' : (severity || 'medium');

  const eventId = await AnomalyEventModel.create(
    device.id,
    eventTimestamp,
    anomaly_type,
    determinedSeverity,
    current,
    voltage,
    power,
    relay_tripped
  );

  if (relay_tripped) {
    await DeviceModel.update(device.id, { relay_status: 'tripped' });
  }

  await DeviceModel.updateLastSeen(device.id);

  logger.warn(`Anomaly event recorded: ${anomaly_type} on device ${device_id} (ID: ${eventId})`);

  // Send real-time SSE notification
  sseService.sendToDevice(device.id, 'anomaly', {
    event_id: eventId,
    device_id,
    anomaly_type,
    severity: determinedSeverity,
    relay_tripped,
    timestamp: eventTimestamp,
  });

  sendSuccess(res, { event_id: eventId, message: 'Anomaly event recorded successfully' }, HTTP_STATUS.CREATED);
});

export const getAnomalyEvents = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
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

  const startTime = req.query.start_time ? new Date(req.query.start_time as string) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const endTime = req.query.end_time ? new Date(req.query.end_time as string) : new Date();
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

  const events = await AnomalyEventModel.findByDeviceAndTimeRange(deviceId, startTime, endTime, limit);

  sendSuccess(res, { events, count: events.length });
});

export const getUnresolvedAnomalies = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
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

  const events = await AnomalyEventModel.findUnresolvedByDevice(deviceId);

  sendSuccess(res, { events, count: events.length });
});

export const resolveAnomaly = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  if (!req.user) {
    throw new AppError('User not authenticated', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
  }

  const eventId = parseInt(req.params.id, 10);

  const event = await AnomalyEventModel.findById(eventId);

  if (!event) {
    throw new AppError('Anomaly event not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);
  }

  const device = await DeviceModel.findById(event.device_id);

  if (!device) {
    throw new AppError('Device not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.DEVICE_NOT_FOUND);
  }

  const isOwner = await DeviceModel.isOwnedByUser(device.id, req.user.id);

  if (!isOwner) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN);
  }

  await AnomalyEventModel.markResolved(eventId, req.user.id);

  // Send real-time SSE notification
  sseService.sendToDevice(device.id, 'anomaly_resolved', {
    event_id: eventId,
    resolved_by: req.user.id,
    resolved_at: new Date(),
  });

  sendSuccess(res, { message: 'Anomaly marked as resolved' });
});
