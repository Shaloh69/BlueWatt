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
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
};

// Add SSL configuration for Aiven MySQL
if (config.db.ssl) {
  poolConfig.ssl = config.db.sslCa
    ? { ca: readFileSync(config.db.sslCa, 'utf-8') }
    : { rejectUnauthorized: true };
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
