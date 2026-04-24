import mysql, { PoolOptions } from 'mysql2/promise';
import { readFileSync } from 'fs';
import { config } from '../config/environment';
import { logger } from '../utils/logger';

const poolConfig: PoolOptions = {
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.name,
  waitForConnections: true,
  connectionLimit: config.db.connectionLimit,
  queueLimit: 20,         // reject after 20 queued — fail fast instead of OOM
  connectTimeout: 10000,  // 10s; prevents hung queries holding a slot forever
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
};

// Add SSL configuration for Aiven MySQL
// Priority: base64 env var (Render/cloud) → file path (local) → rejectUnauthorized
if (config.db.ssl) {
  if (config.db.sslCaBase64) {
    poolConfig.ssl = { ca: Buffer.from(config.db.sslCaBase64, 'base64').toString('utf-8') };
  } else if (config.db.sslCa) {
    poolConfig.ssl = { ca: readFileSync(config.db.sslCa, 'utf-8') };
  } else {
    poolConfig.ssl = { rejectUnauthorized: true };
  }
}

export const pool = mysql.createPool(poolConfig);

export const getConnection = async () => {
  try {
    return await pool.getConnection();
  } catch (error) {
    logger.error('Failed to get database connection', error);
    throw error;
  }
};

export const testConnection = async () => {
  try {
    const connection = await getConnection();
    await connection.ping();
    connection.release();
    logger.info('Database connection successful');
    return true;
  } catch (error) {
    logger.error('Database connection failed', error);
    throw error;
  }
};
