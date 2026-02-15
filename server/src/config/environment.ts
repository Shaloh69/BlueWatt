import dotenv from 'dotenv';

dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  apiVersion: process.env.API_VERSION || 'v1',

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    name: process.env.DB_NAME || 'bluewatt_db',
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10),
    ssl: process.env.DB_SSL === 'true',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'change-this-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'change-this-too',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  apiKey: {
    prefix: process.env.API_KEY_PREFIX || 'bw_',
    length: parseInt(process.env.API_KEY_LENGTH || '32', 10),
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },

  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3001'],
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    filePath: process.env.LOG_FILE_PATH || './logs',
  },

  jobs: {
    enableAggregation: process.env.ENABLE_AGGREGATION_JOB === 'true',
    aggregationCron: process.env.AGGREGATION_CRON || '0 * * * *',
    enableCleanup: process.env.ENABLE_CLEANUP_JOB === 'true',
    cleanupCron: process.env.CLEANUP_CRON || '0 2 * * *',
  },

  dataRetention: {
    detailedDays: parseInt(process.env.DETAILED_DATA_RETENTION_DAYS || '30', 10),
    aggregatedDays: parseInt(process.env.AGGREGATED_DATA_RETENTION_DAYS || '365', 10),
  },
};
