import { BillingPeriodModel } from '../models/billingPeriod.model';
import { PadModel } from '../models/pad.model';
import { PowerAggregateModel } from '../models/powerAggregate.model';
import { DeviceModel } from '../models/device.model';
import { logger } from '../utils/logger';

export class BillingService {
  /**
   * Generate (or re-generate) a billing period for a pad.
   * periodStart: first day of the billing month, e.g. new Date('2026-03-01')
   */
  static async generateBilling(padId: number, periodStart: Date): Promise<void> {
    const pad = await PadModel.findById(padId);
    if (!pad || !pad.is_active) throw new Error(`Pad ${padId} not found or inactive`);

    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    periodEnd.setDate(0); // last day of the month

    const dueDate = new Date(periodEnd);
    dueDate.setDate(dueDate.getDate() + 7);

    const startStr = periodStart.toISOString().split('T')[0];
    const endStr = periodEnd.toISOString().split('T')[0];

    // Skip if already exists
    const exists = await BillingPeriodModel.existsForPeriod(padId, periodStart);
    if (exists) {
      logger.info(`Billing for pad ${padId} period ${startStr} already exists, skipping`);
      return;
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
