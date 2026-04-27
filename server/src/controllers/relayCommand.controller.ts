import { Request, Response, NextFunction } from 'express';
import { RelayCommandModel } from '../models/relayCommand.model';
import { DeviceModel } from '../models/device.model';
import { AppError } from '../utils/AppError';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { HTTP_STATUS, ERROR_CODES } from '../config/constants';
import { sseService } from '../services/sse.service';
import { logger } from '../utils/logger';

/** POST /devices/:id/relay-command — admin issues a command */
export const issueRelayCommand = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    if (!req.user)
      throw new AppError('Unauthenticated', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);

    const deviceId = parseInt(req.params.id, 10);
    const { command } = req.body as { command: 'on' | 'off' | 'reset' };

    if (!['on', 'off', 'reset'].includes(command)) {
      throw new AppError(
        'Invalid command. Use on, off, or reset.',
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    const device = await DeviceModel.findById(deviceId);
    if (!device)
      throw new AppError('Device not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.DEVICE_NOT_FOUND);

    if (!device.is_active)
      throw new AppError(
        'Device is not active',
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.DEVICE_INACTIVE
      );

    const cmd = await RelayCommandModel.create(deviceId, command, req.user.id);
    logger.info(
      `[Relay] Command "${command}" queued for device "${device.device_id}" (db#${deviceId}) cmd_id=${cmd.id} by user=${req.user.id}`
    );

    sseService.sendToDevice(deviceId, 'relay_command_issued', { command, deviceId });

    sendSuccess(res, { command: cmd }, HTTP_STATUS.CREATED);
  }
);

/** GET /devices/:id/relay-command — ESP polls for pending command (API key auth) */
export const getPendingCommand = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    const deviceId = req.deviceId;
    if (!deviceId)
      throw new AppError(
        'Device not identified',
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.UNAUTHORIZED
      );

    const cmd = await RelayCommandModel.findPendingForDevice(deviceId);

    sendSuccess(res, {
      command: cmd ? cmd.command : null,
      command_id: cmd ? cmd.id : null,
    });
  }
);

/** PUT /devices/:id/relay-command/ack — ESP acknowledges command (API key auth) */
export const ackRelayCommand = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    const deviceId = req.deviceId;
    if (!deviceId)
      throw new AppError(
        'Device not identified',
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.UNAUTHORIZED
      );

    const { command_id, relay_status } = req.body as {
      command_id: number;
      relay_status: 'on' | 'off' | 'tripped';
    };

    const cmd = await RelayCommandModel.findById(command_id);
    if (!cmd || cmd.device_id !== deviceId) {
      throw new AppError('Command not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);
    }

    await RelayCommandModel.acknowledge(command_id);
    logger.info(
      `[Relay] cmd_id=${command_id} ACKed by device#${deviceId} — relay is now "${relay_status}"`
    );

    // Sync relay_status on device record
    if (relay_status && ['on', 'off', 'tripped'].includes(relay_status)) {
      await DeviceModel.update(deviceId, { relay_status });
      sseService.sendToDevice(deviceId, 'relay_state', { device_id: deviceId, relay_status });
    }

    sendSuccess(res, { message: 'Acknowledged' });
  }
);

/** GET /devices/:id/relay-command/history — admin: recent commands */
export const getCommandHistory = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    const deviceId = parseInt(req.params.id, 10);
    const commands = await RelayCommandModel.findByDevice(deviceId);
    sendSuccess(res, { commands });
  }
);
