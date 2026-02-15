import { body, query } from 'express-validator';

export const powerDataValidator = [
  body('device_id')
    .trim()
    .notEmpty()
    .withMessage('Device ID is required'),
  body('timestamp')
    .isInt({ min: 0 })
    .withMessage('Valid timestamp (Unix seconds) is required'),
  body('voltage_rms')
    .isFloat({ min: 0, max: 500 })
    .withMessage('Voltage RMS must be between 0 and 500'),
  body('current_rms')
    .isFloat({ min: 0, max: 100 })
    .withMessage('Current RMS must be between 0 and 100'),
  body('power_apparent')
    .isFloat({ min: 0 })
    .withMessage('Apparent power must be a positive number'),
  body('power_real')
    .isFloat({ min: 0 })
    .withMessage('Real power must be a positive number'),
  body('power_factor')
    .isFloat({ min: 0, max: 1 })
    .withMessage('Power factor must be between 0 and 1'),
];

export const queryTimeRangeValidator = [
  query('start_time')
    .optional()
    .isISO8601()
    .withMessage('Start time must be a valid ISO 8601 date'),
  query('end_time')
    .optional()
    .isISO8601()
    .withMessage('End time must be a valid ISO 8601 date'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 10000 })
    .withMessage('Limit must be between 1 and 10000'),
];
