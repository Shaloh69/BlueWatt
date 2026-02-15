import winston from 'winston';
import { config } from '../config/environment';

const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

winston.addColors(logColors);

const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => `${info.timestamp} [${info.level}]: ${info.message}`)
);

const transports = [
  new winston.transports.Console(),
  new winston.transports.File({
    filename: `${config.logging.filePath}/error.log`,
    level: 'error',
  }),
  new winston.transports.File({
    filename: `${config.logging.filePath}/all.log`,
  }),
];

export const logger = winston.createLogger({
  level: config.logging.level,
  levels: logLevels,
  format,
  transports,
});
