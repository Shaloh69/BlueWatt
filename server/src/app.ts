import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { config } from './config/environment';
import { logger } from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { generalLimiter } from './middleware/rateLimit.middleware';
import routes from './routes';
import { startCronJobs } from './jobs';

const app: Application = express();

// Render (and most cloud platforms) sit behind a reverse proxy that sets
// X-Forwarded-For. Trust one proxy hop so express-rate-limit can read the
// real client IP correctly.
app.set('trust proxy', 1);

app.use(helmet());

app.use(
  cors({
    origin: config.cors.origin,
    credentials: true,
  })
);

app.use(
  compression({
    // SSE streams must not be compressed — buffering breaks event delivery
    filter: (req, res) => {
      if (req.path.includes('/sse')) return false;
      return compression.filter(req, res);
    },
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const morganFormat = config.env === 'production' ? 'combined' : 'dev';
app.use(
  morgan(morganFormat, {
    stream: {
      write: (message) => logger.http(message.trim()),
    },
  })
);

app.use(generalLimiter);

app.use(`/api/${config.apiVersion}`, routes);

app.use(notFoundHandler);
app.use(errorHandler);

// Start background cron jobs
startCronJobs();

export default app;
