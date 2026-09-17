import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { HTTP_STATUS, ERROR_CODES } from '../config/constants';
import { sendError } from '../utils/apiResponse';

/** Driver-level MySQL error shape (mysql2). */
interface SqlError extends Error {
  errno?: number;
  code?: string;
  sqlMessage?: string;
}

/**
 * Friendly text per UNIQUE index. Keyed by the index name MySQL reports in
 * ER_DUP_ENTRY, e.g. "... for key 'billing_periods.uq_pad_period_type'".
 * Keep in sync with the unique constraints in src/database/schema.sql.
 */
const DUPLICATE_MESSAGES: Array<[string, string]> = [
  ['uq_pad_period_type', 'A bill already exists for this pad, period start date and bill type.'],
  ['uq_stay_cycle_type', 'A bill already exists for this stay, billing cycle and bill type.'],
  ['pads.device_id', 'That device is already assigned to another pad.'],
  ['devices.device_id', 'A device with that device ID already exists.'],
  ['users.email', 'An account with that email address already exists.'],
  ['unique_device_date', 'A daily aggregate already exists for that device and date.'],
  ['unique_device_hour', 'An hourly aggregate already exists for that device and hour.'],
  ['uq_dev_month', 'A monthly aggregate already exists for that device and month.'],
];

const describeDuplicate = (sqlMessage?: string): string => {
  if (sqlMessage) {
    for (const [key, text] of DUPLICATE_MESSAGES) {
      if (sqlMessage.includes(key)) return text;
    }
  }
  return 'That record already exists.';
};

/**
 * Translate infrastructure-level errors into client-meaningful responses.
 *
 * Without this, every constraint violation reaches the client as a bare
 * "Internal server error", hiding actionable problems (duplicate bill, missing
 * foreign key, bad enum value) behind a 500. Raw SQL text is logged, never sent.
 *
 * Returns null when the error is not one we recognise, so it falls through to
 * the generic 500 path.
 */
const mapKnownError = (
  err: SqlError
): { status: number; code: string; message: string } | null => {
  // Invalid date reaching .toISOString() — e.g. new Date('not-a-date')
  if (err instanceof RangeError && /invalid time value/i.test(err.message)) {
    return {
      status: HTTP_STATUS.BAD_REQUEST,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'An invalid date value was supplied.',
    };
  }

  // Database unreachable — a 500 is misleading; this is a transient outage.
  if (
    err.code === 'ECONNREFUSED' ||
    err.code === 'PROTOCOL_CONNECTION_LOST' ||
    err.code === 'ER_CON_COUNT_ERROR' ||
    err.code === 'ETIMEDOUT'
  ) {
    return {
      status: HTTP_STATUS.SERVICE_UNAVAILABLE,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'The database is temporarily unavailable. Please try again shortly.',
    };
  }

  switch (err.errno) {
    case 1062: // ER_DUP_ENTRY
      return {
        status: HTTP_STATUS.CONFLICT,
        code: ERROR_CODES.DUPLICATE_ENTRY,
        message: describeDuplicate(err.sqlMessage),
      };
    case 1452: // ER_NO_REFERENCED_ROW_2 — FK target missing on insert/update
      return {
        status: HTTP_STATUS.BAD_REQUEST,
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'A referenced record does not exist.',
      };
    case 1451: // ER_ROW_IS_REFERENCED_2 — child rows still point here
      return {
        status: HTTP_STATUS.CONFLICT,
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'This record is still referenced by other records and cannot be deleted.',
      };
    case 1048: // ER_BAD_NULL_ERROR
      return {
        status: HTTP_STATUS.BAD_REQUEST,
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'A required field was missing.',
      };
    case 1406: // ER_DATA_TOO_LONG
      return {
        status: HTTP_STATUS.BAD_REQUEST,
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'A submitted value is too long.',
      };
    case 1264: // ER_WARN_DATA_OUT_OF_RANGE
      return {
        status: HTTP_STATUS.BAD_REQUEST,
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'A numeric value is outside the allowed range.',
      };
    case 1265: // ER_TRUNCATED_WRONG_VALUE — bad enum member
    case 1292: // ER_TRUNCATED_WRONG_VALUE_FOR_FIELD — bad date/number literal
      return {
        status: HTTP_STATUS.BAD_REQUEST,
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'A submitted value has the wrong format or is not an allowed option.',
      };
    default:
      return null;
  }
};

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

  const known = mapKnownError(err as SqlError);
  if (known) {
    // Log the raw driver message for diagnosis; never send it to the client.
    logger.error(`${known.code}: ${err.message}`, {
      sqlMessage: (err as SqlError).sqlMessage,
      errno: (err as SqlError).errno,
    });
    sendError(res, known.code, known.message, known.status);
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
