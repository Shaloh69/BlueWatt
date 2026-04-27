import { Request, Response } from 'express';
import { sseService } from '../services/sse.service';
import { DeviceModel } from '../models/device.model';
import { PadModel } from '../models/pad.model';
import { AppError } from '../utils/AppError';
import { HTTP_STATUS, ERROR_CODES } from '../config/constants';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

export const streamEvents = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    throw new AppError(
      'User not authenticated',
      HTTP_STATUS.UNAUTHORIZED,
      ERROR_CODES.UNAUTHORIZED
    );
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const clientId = uuidv4();

  // Admin: devices they own. Tenant: device linked to their pad.
  const ownedDevices = await DeviceModel.findByUserId(req.user.id);
  const deviceIds = ownedDevices.map((d) => d.id);

  if (req.user.role !== 'admin') {
    const pad = await PadModel.findByTenantId(req.user.id);
    if (pad?.device_id && !deviceIds.includes(pad.device_id)) {
      deviceIds.push(pad.device_id);
    }
  }

  sseService.addClient(clientId, req.user.id, res, deviceIds);
  logger.info(
    `[SSE] Connected: "${req.user.email}" (id=${req.user.id}, role=${req.user.role}) client=${clientId.slice(0, 8)} watching devices [${deviceIds.join(', ')}] from ${req.ip}`
  );

  res.write(`event: connected\n`);
  res.write(`data: ${JSON.stringify({ clientId, message: 'Connected to real-time updates' })}\n\n`);

  req.on('close', () => {
    sseService.removeClient(clientId);
    logger.info(
      `[SSE] Disconnected: "${req.user!.email}" (id=${req.user!.id}) client=${clientId.slice(0, 8)}`
    );
  });
};
