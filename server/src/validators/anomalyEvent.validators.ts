import { body, param } from 'express-validator';
import { ANOMALY_TYPES } from '../config/constants';

export const anomalyEventValidator = [
  body('device_id')
    .trim()
    .notEmpty()
    .withMessage('Device ID is required'),
  body('timestamp')
    .isInt({ min: 0 })
    .withMessage('Valid timestamp (Unix seconds) is required'),
  body('anomaly_type')
    .isIn(ANOMALY_TYPES)
    .withMessage(`Anomaly type must be one of: ${ANOMALY_TYPES.join(', ')}`),
  body('current')
    .isFloat({ min: 0 })
    .withMessage('Current must be a positive number'),
  body('voltage')
    .isFloat({ min: 0 })
    .withMessage('Voltage must be a positive number'),
  body('power')
    .isFloat({ min: 0 })
    .withMessage('Power must be a positive number'),
  body('relay_tripped')
    .isBoolean()
    .withMessage('Relay tripped must be a boolean'),
];

export const resolveAnomalyValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Valid anomaly event ID is required'),
];
