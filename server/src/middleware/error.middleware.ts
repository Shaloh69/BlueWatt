import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { HTTP_STATUS, ERROR_CODES } from '../config/constants';
import { sendError } from '../utils/apiResponse';

export const errorHandler = (
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (err instanceof AppError) {
    logger.error(`${err.code}: ${err.message}`);
    sendError(res, err.code, err.message, err.statusCode);
    return;
  }

  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });

  sendError(
    res,
    ERROR_CODES.INTERNAL_ERROR,
    'Internal server error',
    HTTP_STATUS.INTERNAL_SERVER_ERROR
  );
};

export const notFoundHandler = (req: Request, res: Response): void => {
  sendError(
    res,
    ERROR_CODES.NOT_FOUND,
    `Route ${req.originalUrl} not found`,
    HTTP_STATUS.NOT_FOUND
  );
};
