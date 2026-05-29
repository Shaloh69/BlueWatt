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

export const submitAnomalyEvent = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    const { device_id, timestamp, anomaly_type, current, voltage, power, relay_tripped, severity } =
      req.body as AnomalyEventRequest;

    const device = await DeviceModel.findByDeviceId(device_id);

    if (!device) {
      throw new AppError('Device not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.DEVICE_NOT_FOUND);
    }

    if (!device.is_active) {
      throw new AppError(
        'Device is not active',
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.DEVICE_INACTIVE
      );
    }

    const PROJECT_START = 1735689600; // 2026-01-01 00:00:00 UTC
    const MYSQL_TS_MAX = 2147483647; // 2038-01-19 03:14:07 UTC
    const nowSec = Math.floor(Date.now() / 1000);
    const tsValid =
      typeof timestamp === 'number' &&
      timestamp >= PROJECT_START &&
      timestamp <= Math.min(nowSec + 60, MYSQL_TS_MAX);
    // ESP sends uptime seconds (not Unix epoch) when clock is not synced — fall back to server time
    const eventTimestamp = tsValid ? new Date(timestamp * 1000) : new Date();
    if (!tsValid) {
      logger.warn(
        `[ESP] Invalid anomaly timestamp from device "${device_id}" (${timestamp}) — using server time`
      );
    }

    const determinedSeverity = relay_tripped ? 'critical' : severity || 'medium';

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
      id: eventId,
      event_id: eventId,
      device_id,
      anomaly_type,
      severity: determinedSeverity,
      relay_tripped,
      timestamp: eventTimestamp,
      current_value: current,
      voltage_value: voltage,
      power_value: power,
    });

    sendSuccess(
      res,
      { event_id: eventId, message: 'Anomaly event recorded successfully' },
      HTTP_STATUS.CREATED
    );
  }
);

export const getAnomalyEvents = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    if (!req.user) {
      throw new AppError(
        'User not authenticated',
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.UNAUTHORIZED
      );
    }

    const deviceId = parseInt(req.params.id, 10);

    const device = await DeviceModel.findById(deviceId);

    if (!device) {
      throw new AppError('Device not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.DEVICE_NOT_FOUND);
    }

    const ok =
      req.user.role === 'admin' || (await DeviceModel.isAccessibleByUser(deviceId, req.user.id));

    if (!ok) {
      throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN);
    }

    const startTime = req.query.start_time ? new Date(req.query.start_time as string) : new Date(0); // epoch — return all records regardless of how old
    const endTime = req.query.end_time
      ? new Date(req.query.end_time as string)
      : new Date(Date.now() + 24 * 60 * 60 * 1000);
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

    const events = await AnomalyEventModel.findByDeviceAndTimeRange(
      deviceId,
      startTime,
      endTime,
      limit
    );

    sendSuccess(res, { events, count: events.length });
  }
);

export const getUnresolvedAnomalies = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    if (!req.user) {
      throw new AppError(
        'User not authenticated',
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.UNAUTHORIZED
      );
    }

    const deviceId = parseInt(req.params.id, 10);

    const device = await DeviceModel.findById(deviceId);

    if (!device) {
      throw new AppError('Device not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.DEVICE_NOT_FOUND);
    }

    const ok =
      req.user.role === 'admin' || (await DeviceModel.isAccessibleByUser(deviceId, req.user.id));

    if (!ok) {
      throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN);
    }

    const events = await AnomalyEventModel.findUnresolvedByDevice(deviceId);

    sendSuccess(res, { events, count: events.length });
  }
);

export const resolveAnomaly = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    if (!req.user) {
      throw new AppError(
        'User not authenticated',
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.UNAUTHORIZED
      );
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

    const ok =
      req.user.role === 'admin' || (await DeviceModel.isAccessibleByUser(device.id, req.user.id));

    if (!ok) {
      throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN);
    }

    await AnomalyEventModel.markResolved(eventId, req.user.id);

    sseService.sendToDevice(device.id, 'anomaly_resolved', {
      event_id: eventId,
      resolved_by: req.user.id,
      resolved_at: new Date(),
    });

    sendSuccess(res, { message: 'Anomaly marked as resolved' });
  }
);

/** DELETE /anomaly-events/:id — admin: delete a single anomaly event */
export const deleteAnomalyEvent = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    const id = parseInt(req.params.id, 10);
    await AnomalyEventModel.deleteById(id);
    sendSuccess(res, { message: 'Anomaly deleted' });
  }
);

/** DELETE /anomaly-events/devices/:id/by-type?type=undervoltage — admin: bulk delete by type */
export const deleteAnomalyEventsByType = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    const deviceId = parseInt(req.params.id, 10);
    const anomalyType = req.query.type as string;
    if (!anomalyType) {
      throw new AppError('type query param required', HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR);
    }
    const count = await AnomalyEventModel.deleteByDeviceAndType(deviceId, anomalyType);
    sendSuccess(res, { deleted: count });
  }
);
