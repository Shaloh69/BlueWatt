import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { config } from '../config/environment';
import { HTTP_STATUS } from '../config/constants';

const jsonHandler = (message: string) => (_req: Request, res: Response) => {
  res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({ success: false, message });
};

export const generalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler('Too many requests from this IP, please try again later'),
  // SSE uses ?token= (EventSource can't set headers), authenticated API calls use Bearer
  // req.path is full path at app level, e.g. /api/v1/sse/events
  skip: (req) => !!req.headers.authorization || req.path.includes('/sse/'),
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: jsonHandler('Too many authentication attempts, please try again later'),
});

export const deviceDataLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler('Too many data submissions, please slow down'),
  keyGenerator: (req) => {
    return req.deviceId?.toString() || req.ip || 'unknown';
  },
});
