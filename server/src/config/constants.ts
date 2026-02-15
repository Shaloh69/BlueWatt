export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  DEVICE_NOT_FOUND: 'DEVICE_NOT_FOUND',
  DEVICE_INACTIVE: 'DEVICE_INACTIVE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export const ANOMALY_TYPES = [
  'overcurrent',
  'short_circuit',
  'wire_fire',
  'overvoltage',
  'undervoltage',
  'overpower',
  'arc_fault',
  'ground_fault',
] as const;

export const RELAY_STATUSES = ['on', 'off', 'tripped'] as const;

export const USER_ROLES = ['admin', 'user'] as const;
