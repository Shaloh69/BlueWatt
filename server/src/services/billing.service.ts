import { BillingPeriodModel } from '../models/billingPeriod.model';
import { BillingScheduleModel } from '../models/billingSchedule.model';
import { PadModel } from '../models/pad.model';
import { StayModel } from '../models/stay.model';
import { PowerAggregateModel } from '../models/powerAggregate.model';
import { DeviceModel } from '../models/device.model';
import { logger } from '../utils/logger';

export class BillingService {
  /**
   * Generate a billing period for a pad.
   * periodStart: start of the billing window.
   * opts.periodEnd: explicit end date (defaults to last day of periodStart's month).
   * opts.dueDate: when the bill becomes visible to the tenant (defaults to periodEnd + 7 days).
   * opts.allowDuplicate: skip the duplicate check (used for manual admin generation).
   */
  static async generateBilling(
    padId: number,
    periodStart: Date,
    opts?: { periodEnd?: Date; dueDate?: Date; allowDuplicate?: boolean }
  ): Promise<void> {
    const pad = await PadModel.findById(padId);
    if (!pad || !pad.is_active) throw new Error(`Pad ${padId} not found or inactive`);

    const periodEnd = opts?.periodEnd ?? (() => {
      const d = new Date(periodStart);
      d.setMonth(d.getMonth() + 1);
      d.setDate(0);
      return d;
    })();

    const dueDate = opts?.dueDate ?? (() => {
      const d = new Date(periodEnd);
      d.setDate(d.getDate() + 7);
      return d;
    })();

    const startStr = periodStart.toISOString().split('T')[0];
    const endStr = periodEnd.toISOString().split('T')[0];

    // Skip if already exists (bypassed for manual admin generation)
    if (!opts?.allowDuplicate) {
      const exists = await BillingPeriodModel.existsForPeriod(padId, periodStart);
      if (exists) {
        logger.info(`Billing for pad ${padId} period ${startStr} already exists, skipping`);
        return;
      }
    }

    // Get energy consumption from daily aggregates if device linked
    let energyKwh = 0;
    if (pad.device_id) {
      const device = await DeviceModel.findById(pad.device_id);
      if (device) {
        energyKwh = await PowerAggregateModel.sumEnergyForPeriod(device.id, startStr, endStr);
      }
    }

    const amountDue = parseFloat((energyKwh * pad.rate_per_kwh).toFixed(2));

    await BillingPeriodModel.create(
      padId,
      pad.tenant_id ?? null,
      periodStart,
      periodEnd,
      energyKwh,
      pad.rate_per_kwh,
      amountDue,
      dueDate
    );

    logger.info(
      `Billing generated: pad=${padId} period=${startStr} energy=${energyKwh}kWh amount=₱${amountDue}`
    );
  }

  /** Auto-generate billing for all active pads for the previous month */
  static async autoGenerateAllPads(): Promise<void> {
    const lastMonth = new Date();
    lastMonth.setDate(0);
    const periodStart = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);

    const pads = await PadModel.findAll();
    let generated = 0;

    for (const pad of pads) {
      if (!pad.is_active) continue;
      try {
        await BillingService.generateBilling(pad.id, periodStart);
        generated++;
      } catch (err) {
        logger.error(`Auto-billing failed for pad ${pad.id}:`, err);
      }
    }

    logger.info(`Auto-billing: ${generated}/${pads.length} pads processed`);
  }

  /** Mark overdue bills */
  static async markOverdue(): Promise<void> {
    const count = await BillingPeriodModel.markOverdue();
    if (count > 0) logger.info(`Marked ${count} billing periods as overdue`);
  }

  /** Process all active schedules that are due and generate their next bill. */
  static async processSchedules(): Promise<void> {
    const schedules = await BillingScheduleModel.findActiveDue();
    for (const schedule of schedules) {
      try {
        await BillingService.processOneSchedule(schedule);
      } catch (err) {
        logger.error(`[schedule] Failed to process schedule ${schedule.id}:`, err);
      }
    }
  }

  private static async processOneSchedule(schedule: any): Promise<void> {
    // next_period_start may be a Date object (mysql2 default) or a string — normalize to YYYY-MM-DD
    const dateOnly = new Date(schedule.next_period_start).toISOString().split('T')[0];
    const periodStart = new Date(dateOnly + 'T00:00:00Z');

    const periodEnd = new Date(periodStart);
    if (schedule.frequency === 'daily') {
      // period_end = same day
    } else if (schedule.frequency === 'weekly') {
      periodEnd.setUTCDate(periodEnd.getUTCDate() + 6);
    } else {
      // monthly: last day of periodStart's month
      periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
      periodEnd.setUTCDate(0);
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const periodEndStr = periodEnd.toISOString().split('T')[0];

    // Electricity bills need the period to be fully closed (all sensor data available)
    if (schedule.bill_type === 'electricity' && periodEndStr >= todayStr) {
      logger.debug(`[schedule] ${schedule.id}: electricity period not yet closed (${periodEndStr}), skipping`);
      return;
    }

    // Skip if pad has no tenant
    if (!schedule.tenant_id) {
      logger.info(`[schedule] ${schedule.id}: pad ${schedule.pad_id} has no tenant, skipping`);
      return;
    }

    const startStr = periodStart.toISOString().split('T')[0];
    const dueDate = new Date(periodEnd);
    dueDate.setUTCDate(dueDate.getUTCDate() + schedule.due_date_offset_days);

    let energyKwh = 0;
    let amountDue = 0;

    if (schedule.bill_type === 'electricity') {
      if (schedule.device_id) {
        const device = await DeviceModel.findById(schedule.device_id);
        if (device) {
          energyKwh = await PowerAggregateModel.sumEnergyForPeriod(device.id, startStr, periodEndStr);
        }
      }
      amountDue = parseFloat((energyKwh * schedule.rate_per_kwh).toFixed(2));
    } else {
      // Rent: prefer the active stay's flat rate; fall back to schedule's flat_amount
      const activeStay = await StayModel.findActiveByPad(schedule.pad_id);
      amountDue = activeStay
        ? parseFloat(Number(activeStay.flat_rate_per_cycle).toFixed(2))
        : parseFloat((schedule.flat_amount ?? 0).toString());
    }

    await BillingPeriodModel.create(
      schedule.pad_id,
      schedule.tenant_id,
      periodStart,
      periodEnd,
      energyKwh,
      schedule.rate_per_kwh,
      amountDue,
      dueDate,
      schedule.bill_type === 'rent'
        ? { flatAmount: amountDue, billType: 'rent' }
        : { billType: 'electricity' }
    );

    const nextStart = new Date(periodEnd);
    nextStart.setUTCDate(nextStart.getUTCDate() + 1);
    await BillingScheduleModel.updateNextPeriod(schedule.id, nextStart.toISOString().split('T')[0]);

    logger.info(
      `[schedule] ${schedule.id}: generated ${schedule.bill_type} bill ` +
      `pad=${schedule.pad_id} period=${startStr}–${periodEndStr} amount=₱${amountDue}`
    );
  }
}
