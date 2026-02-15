import { Request, Response } from 'express';
import { sseService } from '../services/sse.service';
import { DeviceModel } from '../models/device.model';
import { AppError } from '../utils/AppError';
import { HTTP_STATUS, ERROR_CODES } from '../config/constants';
import { v4 as uuidv4 } from 'uuid';

export const streamEvents = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    throw new AppError('User not authenticated', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const clientId = uuidv4();

  const devices = await DeviceModel.findByUserId(req.user.id);
  const deviceIds = devices.map((d) => d.id);

  sseService.addClient(clientId, req.user.id, res, deviceIds);

  res.write(`event: connected\n`);
  res.write(`data: ${JSON.stringify({ clientId, message: 'Connected to real-time updates' })}\n\n`);

  req.on('close', () => {
    sseService.removeClient(clientId);
  });
};
