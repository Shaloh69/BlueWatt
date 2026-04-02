import cron from 'node-cron';
import { AggregationService } from '../services/aggregation.service';
import { BillingService } from '../services/billing.service';
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

  // ── 1st of month 00:30: auto-generate billing for all pads ───────────────
  cron.schedule('30 0 1 * *', async () => {
    logger.info('[cron] Auto-generating monthly billing');
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

  logger.info('Cron jobs registered: hourly-agg, daily-agg, monthly-agg, billing, overdue, cleanup');
}
