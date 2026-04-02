import { pool } from '../database/connection';
import { PowerAggregateModel } from '../models/powerAggregate.model';
import { RowDataPacket } from 'mysql2';
import { logger } from '../utils/logger';

export class AggregationService {
  /**
   * Aggregate all power readings for a given hour into power_aggregates_hourly.
   * hourStart: exact hour boundary e.g. 2026-03-15 14:00:00
   */
  static async aggregateHour(deviceId: number, hourStart: Date): Promise<void> {
    const hourEnd = new Date(hourStart.getTime() + 3600_000);

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         AVG(voltage_rms)   AS avg_voltage,
         AVG(current_rms)   AS avg_current,
         AVG(power_real)    AS avg_power_real,
         MAX(power_real)    AS max_power_real,
         MIN(power_real)    AS min_power_real,
         AVG(power_factor)  AS avg_power_factor,
         COUNT(*)           AS reading_count,
         COALESCE(MAX(energy_kwh) - MIN(energy_kwh), 0) AS energy_diff
       FROM power_readings
       WHERE device_id = ? AND timestamp >= ? AND timestamp < ?`,
      [deviceId, hourStart, hourEnd]
    );

    const r = rows[0] as any;
    if (!r || r.reading_count === 0) return;

    await PowerAggregateModel.upsertHourly(deviceId, hourStart, {
      avg_voltage:      Number(r.avg_voltage)    || 0,
      avg_current:      Number(r.avg_current)    || 0,
      avg_power_real:   Number(r.avg_power_real) || 0,
      max_power_real:   Number(r.max_power_real) || 0,
      min_power_real:   Number(r.min_power_real) || 0,
      total_energy_kwh: Number(r.energy_diff)    || (Number(r.avg_power_real) * 1) / 1000,
      avg_power_factor: Number(r.avg_power_factor) || 0,
      reading_count:    Number(r.reading_count),
    });
  }

  /**
   * Aggregate all hourly records for a given day into power_aggregates_daily.
   * date: 'YYYY-MM-DD'
   */
  static async aggregateDay(deviceId: number, date: string): Promise<void> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         AVG(avg_voltage)      AS avg_voltage,
         AVG(avg_current)      AS avg_current,
         AVG(avg_power_real)   AS avg_power_real,
         MAX(max_power_real)   AS max_power_real,
         MIN(min_power_real)   AS min_power_real,
         SUM(total_energy_kwh) AS total_energy_kwh,
         AVG(avg_power_factor) AS avg_power_factor,
         SUM(reading_count)    AS reading_count,
         HOUR(MAX(CASE WHEN max_power_real = (SELECT MAX(max_power_real)
           FROM power_aggregates_hourly WHERE device_id = ? AND DATE(hour_start) = ?)
           THEN hour_start ELSE NULL END)) AS peak_hour
       FROM power_aggregates_hourly
       WHERE device_id = ? AND DATE(hour_start) = ?`,
      [deviceId, date, deviceId, date]
    );

    // Count anomalies for that day
    const [anomalyRows] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS cnt FROM anomaly_events
       WHERE device_id = ? AND DATE(timestamp) = ?`,
      [deviceId, date]
    );

    const r = rows[0] as any;
    if (!r || r.reading_count === 0) return;

    await PowerAggregateModel.upsertDaily(deviceId, date, {
      avg_voltage:      Number(r.avg_voltage)    || 0,
      avg_current:      Number(r.avg_current)    || 0,
      avg_power_real:   Number(r.avg_power_real) || 0,
      max_power_real:   Number(r.max_power_real) || 0,
      min_power_real:   Number(r.min_power_real) || 0,
      total_energy_kwh: Number(r.total_energy_kwh) || 0,
      avg_power_factor: Number(r.avg_power_factor) || 0,
      peak_hour:        r.peak_hour !== null ? Number(r.peak_hour) : undefined,
      reading_count:    Number(r.reading_count),
      anomaly_count:    Number((anomalyRows[0] as any).cnt) || 0,
    });
  }

  /**
   * Aggregate daily records for a month into power_aggregates_monthly.
   * yearMonth: 'YYYY-MM'
   */
  static async aggregateMonth(deviceId: number, yearMonth: string): Promise<void> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         SUM(total_energy_kwh) AS total_energy_kwh,
         AVG(avg_power_real)   AS avg_power_real,
         MAX(max_power_real)   AS max_power_real,
         AVG(avg_voltage)      AS avg_voltage,
         AVG(avg_current)      AS avg_current,
         AVG(avg_power_factor) AS avg_power_factor,
         SUM(anomaly_count)    AS anomaly_count
       FROM power_aggregates_daily
       WHERE device_id = ? AND DATE_FORMAT(date, '%Y-%m') = ?`,
      [deviceId, yearMonth]
    );

    const r = rows[0] as any;
    if (!r || r.total_energy_kwh === null) return;

    await PowerAggregateModel.upsertMonthly(deviceId, yearMonth, {
      total_energy_kwh: Number(r.total_energy_kwh) || 0,
      avg_power_real:   Number(r.avg_power_real)   || 0,
      max_power_real:   Number(r.max_power_real)   || 0,
      avg_voltage:      Number(r.avg_voltage)      || 0,
      avg_current:      Number(r.avg_current)      || 0,
      avg_power_factor: Number(r.avg_power_factor) || 0,
      anomaly_count:    Number(r.anomaly_count)    || 0,
    });
  }

  /** Run hourly aggregation for all active devices for the previous complete hour */
  static async runHourlyForAllDevices(): Promise<void> {
    const now = new Date();
    // Previous complete hour
    const hourStart = new Date(now);
    hourStart.setMinutes(0, 0, 0);
    hourStart.setHours(hourStart.getHours() - 1);

    const [devices] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM devices WHERE is_active = 1`
    );

    for (const d of devices) {
      try {
        await AggregationService.aggregateHour(d.id, hourStart);
      } catch (err) {
        logger.error(`Hourly aggregation failed for device ${d.id}:`, err);
      }
    }
    logger.info(`Hourly aggregation done for ${devices.length} devices`);
  }

  /** Run daily aggregation for all active devices for yesterday */
  static async runDailyForAllDevices(): Promise<void> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    const [devices] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM devices WHERE is_active = 1`
    );

    for (const d of devices) {
      try {
        await AggregationService.aggregateDay(d.id, dateStr);
      } catch (err) {
        logger.error(`Daily aggregation failed for device ${d.id}:`, err);
      }
    }
    logger.info(`Daily aggregation done for ${devices.length} devices`);
  }

  /** Run monthly aggregation for all active devices for last month */
  static async runMonthlyForAllDevices(): Promise<void> {
    const lastMonth = new Date();
    lastMonth.setDate(0); // last day of previous month
    const yearMonth = lastMonth.toISOString().slice(0, 7);

    const [devices] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM devices WHERE is_active = 1`
    );

    for (const d of devices) {
      try {
        await AggregationService.aggregateMonth(d.id, yearMonth);
      } catch (err) {
        logger.error(`Monthly aggregation failed for device ${d.id}:`, err);
      }
    }
    logger.info(`Monthly aggregation done for ${devices.length} devices`);
  }
}
