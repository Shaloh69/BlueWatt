import { body, param } from 'express-validator';
import { RELAY_STATUSES } from '../config/constants';

export const registerDeviceValidator = [
  body('device_id')
    .trim()
    .notEmpty()
    .withMessage('Device ID is required')
    .matches(/^[A-Za-z0-9_-]+$/)
    .withMessage('Device ID can only contain letters, numbers, underscores, and hyphens')
    .isLength({ min: 3, max: 50 })
    .withMessage('Device ID must be between 3 and 50 characters'),
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Device name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Device name must be between 2 and 100 characters'),
  body('location')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Location must be less than 200 characters'),
];

export const updateDeviceValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Valid device ID is required'),
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Device name cannot be empty')
    .isLength({ min: 2, max: 100 })
    .withMessage('Device name must be between 2 and 100 characters'),
  body('location')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Location must be less than 200 characters'),
  body('status')
    .optional()
    .isIn(['active', 'inactive'])
    .withMessage('Status must be either active or inactive'),
];

export const updateRelayValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Valid device ID is required'),
  body('relay_status')
    .isIn(RELAY_STATUSES)
    .withMessage(`Relay status must be one of: ${RELAY_STATUSES.join(', ')}`),
];

export const deviceIdParamValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Valid device ID is required'),
];
