import cron from 'node-cron';
import https from 'https';
import http from 'http';
import { AggregationService } from '../services/aggregation.service';
import { BillingService } from '../services/billing.service';
import { StayBillingService } from '../services/stayBilling.service';
import { PowerAggregateModel } from '../models/powerAggregate.model';
import { PowerReadingModel } from '../models/powerReading.model';
import { config } from '../config/environment';
import { logger } from '../utils/logger';

export function startCronJobs(): void {
  // ── Every hour: aggregate previous hour for all devices ──────────────────
  cron.schedule('5 * * * *', async () => {
    logger.info('[cron] Running hourly aggregation');
    try { await AggregationService.runHourlyForAllDevices(); }
    catch (e) { logger.error('[cron] Hourly aggregation failed:', e); }
  });

  // ── Daily 00:10: aggregate yesterday for all devices ─────────────────────
  cron.schedule('10 0 * * *', async () => {
    logger.info('[cron] Running daily aggregation');
    try { await AggregationService.runDailyForAllDevices(); }
    catch (e) { logger.error('[cron] Daily aggregation failed:', e); }
  });

  // ── 1st of month 00:20: aggregate last month ─────────────────────────────
  cron.schedule('20 0 1 * *', async () => {
    logger.info('[cron] Running monthly aggregation');
    try { await AggregationService.runMonthlyForAllDevices(); }
    catch (e) { logger.error('[cron] Monthly aggregation failed:', e); }
  });

  // ── Every hour :45 — scan active stays and generate due bills ────────────
  cron.schedule('45 * * * *', async () => {
    logger.debug('[cron] Running stay billing scan');
    try { await StayBillingService.scanAndBill(); }
    catch (e) { logger.error('[cron] Stay billing scan failed:', e); }
  });

  // ── 1st of month 00:30: legacy pad billing (pads without stays) ──────────
  cron.schedule('30 0 1 * *', async () => {
    logger.info('[cron] Auto-generating legacy monthly billing');
    try { await BillingService.autoGenerateAllPads(); }
    catch (e) { logger.error('[cron] Auto-billing failed:', e); }
  });

  // ── Daily 08:00: mark overdue bills ──────────────────────────────────────
  cron.schedule('0 8 * * *', async () => {
    logger.info('[cron] Marking overdue bills');
    try { await BillingService.markOverdue(); }
    catch (e) { logger.error('[cron] Mark overdue failed:', e); }
  });

  // ── Weekly Sunday 03:00: purge old data ──────────────────────────────────
  cron.schedule('0 3 * * 0', async () => {
    logger.info('[cron] Running data cleanup');
    try {
      const rawDeleted = await PowerReadingModel.deleteOlderThan(config.dataRetention.detailedDays);
      const aggDeleted = await PowerAggregateModel.deleteHourlyOlderThanDays(90);
      logger.info(`[cron] Cleanup: ${rawDeleted} raw readings, ${aggDeleted} hourly aggregates deleted`);
    } catch (e) { logger.error('[cron] Cleanup failed:', e); }
  });

  // ── Every 14 min: self-ping to prevent Render free tier from sleeping ────────
  const selfUrl = process.env.RENDER_EXTERNAL_URL
    ? `${process.env.RENDER_EXTERNAL_URL}/api/v1/health`
    : null;

  if (selfUrl) {
    cron.schedule('*/14 * * * *', () => {
      const mod = selfUrl.startsWith('https') ? https : http;
      mod.get(selfUrl, (res) => {
        logger.debug(`[keep-alive] ping → ${res.statusCode}`);
        res.resume(); // drain response
      }).on('error', (e) => logger.warn(`[keep-alive] ping failed: ${e.message}`));
    });
    logger.info(`[keep-alive] Pinging ${selfUrl} every 14 min`);
  }

  logger.info('Cron jobs registered: hourly-agg, daily-agg, monthly-agg, stay-billing, legacy-billing, overdue, cleanup, keep-alive');
}
