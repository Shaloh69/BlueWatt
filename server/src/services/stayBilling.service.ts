/**
 * Stay-based billing service.
 *
 * Billing model:
 *  - Each stay has a billing_cycle ('daily' | 'monthly') anchored to check_in_at.
 *  - Bills are generated for every *completed* cycle.
 *  - Energy is sourced from power_aggregates_daily (seeded + cron-aggregated).
 *  - The flat_rate_per_cycle is prorated on the final bill too.
 *
 * Cycle numbering (1-based):
 *   cycle 1  →  check_in_at  ..  check_in_at + 1 cycle
 *   cycle 2  →  check_in_at + 1 cycle  ..  check_in_at + 2 cycles
 *   …
 */

import { BillingPeriodModel } from '../models/billingPeriod.model';
import { StayModel } from '../models/stay.model';
import { PowerAggregateModel } from '../models/powerAggregate.model';
import { logger } from '../utils/logger';

// ── Helpers ──────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

/** Add N daily-cycle units to a date (minute-precise clone) */
function addCycles(base: Date, n: number, cycle: 'daily' | 'monthly'): Date {
  const d = new Date(base);
  if (cycle === 'daily') {
    d.setTime(d.getTime() + n * 24 * 60 * 60 * 1000);
  } else {
    d.setMonth(d.getMonth() + n);
  }
  return d;
}

/** Duration of one full cycle in milliseconds */
function cycleDurationMs(base: Date, cycle: 'daily' | 'monthly'): number {
  return addCycles(base, 1, cycle).getTime() - base.getTime();
}

/** Due date = period_end + 7 days */
function dueDate(periodEnd: Date): Date {
  const d = new Date(periodEnd);
  d.setDate(d.getDate() + 7);
  return d;
}

// ── Core scanner ─────────────────────────────────────────────────────────────

export class StayBillingService {
  /**
   * Scan all active stays and recently-ended stays, generate any missing bills.
   * Called hourly by the cron scheduler.
   */
  static async scanAndBill(): Promise<void> {
    const now = new Date();

    const active = await StayModel.findActive();
    const ended = await StayModel.findRecentlyEnded(72); // look back 3 days for safety
    const allStays = [...active, ...ended];

    let generated = 0;
    let skipped = 0;

    for (const stay of allStays) {
      try {
        const bills = await StayBillingService.billStay(stay, now);
        generated += bills;
      } catch (err) {
        logger.error(`[StayBilling] Error processing stay ${stay.id}:`, err);
        skipped++;
      }
    }

    if (generated > 0 || skipped > 0) {
      logger.info(`[StayBilling] Scan complete — generated=${generated} errors=${skipped}`);
    } else {
      logger.debug('[StayBilling] Scan complete — no new bills');
    }
  }

  /**
   * Generate all missing bills for a single stay.
   * Returns the number of bills created.
   */
  static async billStay(stay: any, now: Date): Promise<number> {
    const checkIn: Date = new Date(stay.check_in_at);
    const checkOut: Date | null = stay.check_out_at ? new Date(stay.check_out_at) : null;
    const effective = checkOut ?? now; // don't bill past check-out or now

    // How many full cycles have elapsed?
    const fullCycleDurationMs = cycleDurationMs(checkIn, stay.billing_cycle);
    const elapsed = effective.getTime() - checkIn.getTime();
    const completedCycles = Math.floor(elapsed / fullCycleDurationMs);

    // Determine device_id for energy queries
    const deviceId: number | null = stay.device_db_id ?? null;

    let created = 0;

    // ── Full cycles ──────────────────────────────────────────────────────────
    for (let cycle = 1; cycle <= completedCycles; cycle++) {
      const periodStart = addCycles(checkIn, cycle - 1, stay.billing_cycle);
      const periodEnd = addCycles(checkIn, cycle, stay.billing_cycle);

      // ── Electricity bill ────────────────────────────────────────────────
      const elecExists = await BillingPeriodModel.existsForStayCycle(stay.id, cycle, 'electricity');
      if (!elecExists) {
        const endInclusive = new Date(periodEnd.getTime() - 86400_000);
        const energyKwh = deviceId
          ? await PowerAggregateModel.sumEnergyForPeriod(
              deviceId,
              toDateStr(periodStart),
              toDateStr(endInclusive)
            )
          : 0;
        const energyAmount = parseFloat((energyKwh * stay.rate_per_kwh).toFixed(2));

        await BillingPeriodModel.create(
          stay.pad_id,
          stay.tenant_id,
          periodStart,
          periodEnd,
          energyKwh,
          stay.rate_per_kwh,
          energyAmount,
          dueDate(periodEnd),
          { stayId: stay.id, flatAmount: 0, cycleNumber: cycle, billType: 'electricity' }
        );
        logger.info(
          `[StayBilling] stay=${stay.id} cycle=${cycle} electricity ${energyKwh.toFixed(4)}kWh ₱${energyAmount}`
        );
        created++;
      }

      // ── Rent bill ───────────────────────────────────────────────────────
      const rentExists = await BillingPeriodModel.existsForStayCycle(stay.id, cycle, 'rent');
      if (!rentExists) {
        const flatAmount = parseFloat(Number(stay.flat_rate_per_cycle).toFixed(2));

        await BillingPeriodModel.create(
          stay.pad_id,
          stay.tenant_id,
          periodStart,
          periodEnd,
          0,
          0,
          flatAmount,
          dueDate(periodEnd),
          { stayId: stay.id, flatAmount, cycleNumber: cycle, billType: 'rent' }
        );
        logger.info(`[StayBilling] stay=${stay.id} cycle=${cycle} rent ₱${flatAmount}`);
        created++;
      }
    }

    // ── Prorated final cycle on check-out ────────────────────────────────────
    if (checkOut) {
      const finalCycle = completedCycles + 1;
      const periodStart = addCycles(checkIn, completedCycles, stay.billing_cycle);
      const periodEnd = checkOut;

      const fullMs = cycleDurationMs(periodStart, stay.billing_cycle);
      const usedMs = checkOut.getTime() - periodStart.getTime();
      const proRate = usedMs > 0 ? Math.min(usedMs / fullMs, 1) : 0;

      if (proRate > 0) {
        const elecExists = await BillingPeriodModel.existsForStayCycle(
          stay.id,
          finalCycle,
          'electricity'
        );
        if (!elecExists) {
          const endInclusive = new Date(periodEnd.getTime() - 86400_000);
          const energyKwh = deviceId
            ? await PowerAggregateModel.sumEnergyForPeriod(
                deviceId,
                toDateStr(periodStart),
                toDateStr(endInclusive)
              )
            : 0;
          const energyAmount = parseFloat((energyKwh * stay.rate_per_kwh).toFixed(2));
          await BillingPeriodModel.create(
            stay.pad_id,
            stay.tenant_id,
            periodStart,
            periodEnd,
            energyKwh,
            stay.rate_per_kwh,
            energyAmount,
            dueDate(periodEnd),
            { stayId: stay.id, flatAmount: 0, cycleNumber: finalCycle, billType: 'electricity' }
          );
          logger.info(
            `[StayBilling] stay=${stay.id} cycle=${finalCycle}(prorated ${(proRate * 100).toFixed(1)}%) electricity ${energyKwh.toFixed(4)}kWh ₱${energyAmount}`
          );
          created++;
        }

        const rentExists = await BillingPeriodModel.existsForStayCycle(stay.id, finalCycle, 'rent');
        if (!rentExists) {
          const flatAmount = parseFloat((stay.flat_rate_per_cycle * proRate).toFixed(2));
          await BillingPeriodModel.create(
            stay.pad_id,
            stay.tenant_id,
            periodStart,
            periodEnd,
            0,
            0,
            flatAmount,
            dueDate(periodEnd),
            { stayId: stay.id, flatAmount, cycleNumber: finalCycle, billType: 'rent' }
          );
          logger.info(
            `[StayBilling] stay=${stay.id} cycle=${finalCycle}(prorated ${(proRate * 100).toFixed(1)}%) rent ₱${flatAmount}`
          );
          created++;
        }
      }
    }

    return created;
  }

  /** Mark bills as overdue */
  static async markOverdue(): Promise<void> {
    const count = await BillingPeriodModel.markOverdue();
    if (count > 0) logger.info(`[StayBilling] Marked ${count} bills as overdue`);
  }
}
