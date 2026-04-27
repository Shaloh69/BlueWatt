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
    res.status(401).json({ message: 'Unauthenticated' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const clientId = uuidv4();

  // Admin: receives events for ALL devices (no filter).
  // Tenant: restricted to their pad's device.
  let deviceIds: number[] | undefined = undefined;
  try {
    if (req.user.role !== 'admin') {
      const ownedDevices = await DeviceModel.findByUserId(req.user.id);
      deviceIds = ownedDevices.map((d) => d.id);
      const pad = await PadModel.findByTenantId(req.user.id);
      if (pad?.device_id && !deviceIds.includes(pad.device_id)) {
        deviceIds.push(pad.device_id);
      }
    }
  } catch (err) {
    logger.error('[SSE] Setup error during device lookup:', err);
    res.status(500).end();
    return;
  }

  sseService.addClient(clientId, req.user.id, res, deviceIds);
  logger.info(
    `[SSE] Connected: "${req.user.email}" (id=${req.user.id}, role=${req.user.role}) client=${clientId.slice(0, 8)} watching devices [${deviceIds ? deviceIds.join(', ') : 'ALL'}] from ${req.ip}`
  );

  res.write(`event: connected\n`);
  res.write(`data: ${JSON.stringify({ clientId, message: 'Connected to real-time updates' })}\n\n`);
  (res as any).flush?.();

  req.on('close', () => {
    sseService.removeClient(clientId);
    logger.info(
      `[SSE] Disconnected: "${req.user!.email}" (id=${req.user!.id}) client=${clientId.slice(0, 8)}`
    );
  });
};
