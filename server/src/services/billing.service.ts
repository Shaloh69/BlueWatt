import { BillingPeriodModel } from '../models/billingPeriod.model';
import { PadModel } from '../models/pad.model';
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
}
