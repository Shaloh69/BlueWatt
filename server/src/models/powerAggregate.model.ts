import { pool } from '../database/connection';
import { PowerAggregateHourly, PowerAggregateDaily, PowerAggregateMonthly } from '../types/models';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export class PowerAggregateModel {
  // ── Hourly ──────────────────────────────────────────────────────────────────

  static async upsertHourly(
    deviceId: number,
    hourStart: Date,
    data: Omit<PowerAggregateHourly, 'id' | 'device_id' | 'hour_start' | 'created_at'>
  ): Promise<void> {
    await pool.execute(
      `INSERT INTO power_aggregates_hourly
         (device_id, hour_start, avg_voltage, avg_current, avg_power_real,
          max_power_real, min_power_real, total_energy_kwh, avg_power_factor, reading_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         avg_voltage = VALUES(avg_voltage), avg_current = VALUES(avg_current),
         avg_power_real = VALUES(avg_power_real), max_power_real = VALUES(max_power_real),
         min_power_real = VALUES(min_power_real), total_energy_kwh = VALUES(total_energy_kwh),
         avg_power_factor = VALUES(avg_power_factor), reading_count = VALUES(reading_count)`,
      [
        deviceId,
        hourStart,
        data.avg_voltage,
        data.avg_current,
        data.avg_power_real,
        data.max_power_real,
        data.min_power_real,
        data.total_energy_kwh,
        data.avg_power_factor,
        data.reading_count,
      ]
    );
  }

  static async findHourlyByDate(deviceId: number, date: string): Promise<PowerAggregateHourly[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM power_aggregates_hourly
       WHERE device_id = ? AND DATE(hour_start) = ?
       ORDER BY hour_start`,
      [deviceId, date]
    );
    return rows as PowerAggregateHourly[];
  }

  // ── Daily ────────────────────────────────────────────────────────────────────

  static async upsertDaily(
    deviceId: number,
    date: string,
    data: Omit<PowerAggregateDaily, 'id' | 'device_id' | 'date' | 'created_at'>
  ): Promise<void> {
    await pool.execute(
      `INSERT INTO power_aggregates_daily
         (device_id, date, avg_voltage, avg_current, avg_power_real,
          max_power_real, min_power_real, total_energy_kwh, avg_power_factor,
          peak_hour, reading_count, anomaly_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         avg_voltage = VALUES(avg_voltage), avg_current = VALUES(avg_current),
         avg_power_real = VALUES(avg_power_real), max_power_real = VALUES(max_power_real),
         min_power_real = VALUES(min_power_real), total_energy_kwh = VALUES(total_energy_kwh),
         avg_power_factor = VALUES(avg_power_factor), peak_hour = VALUES(peak_hour),
         reading_count = VALUES(reading_count), anomaly_count = VALUES(anomaly_count)`,
      [
        deviceId,
        date,
        data.avg_voltage,
        data.avg_current,
        data.avg_power_real,
        data.max_power_real,
        data.min_power_real,
        data.total_energy_kwh,
        data.avg_power_factor,
        data.peak_hour ?? null,
        data.reading_count,
        data.anomaly_count,
      ]
    );
  }

  static async findDailyByMonth(
    deviceId: number,
    yearMonth: string
  ): Promise<PowerAggregateDaily[]> {
    // yearMonth = 'YYYY-MM'
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM power_aggregates_daily
       WHERE device_id = ? AND DATE_FORMAT(date, '%Y-%m') = ?
       ORDER BY date`,
      [deviceId, yearMonth]
    );
    return rows as PowerAggregateDaily[];
  }

  static async findAllDaily(deviceId: number): Promise<PowerAggregateDaily[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM power_aggregates_daily
       WHERE device_id = ?
       ORDER BY date DESC`,
      [deviceId]
    );
    return rows as PowerAggregateDaily[];
  }

  static async sumEnergyForPeriod(
    deviceId: number,
    startDate: string,
    endDate: string
  ): Promise<number> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT COALESCE(SUM(total_energy_kwh), 0) AS total
       FROM power_aggregates_daily
       WHERE device_id = ? AND date BETWEEN ? AND ?`,
      [deviceId, startDate, endDate]
    );
    return Number((rows[0] as any).total);
  }

  // ── Monthly ──────────────────────────────────────────────────────────────────

  static async upsertMonthly(
    deviceId: number,
    yearMonth: string,
    data: Omit<PowerAggregateMonthly, 'id' | 'device_id' | 'period_month' | 'created_at'>
  ): Promise<void> {
    await pool.execute(
      `INSERT INTO power_aggregates_monthly
         (device_id, period_month, total_energy_kwh, avg_power_real, max_power_real,
          avg_voltage, avg_current, avg_power_factor, anomaly_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         total_energy_kwh = VALUES(total_energy_kwh), avg_power_real = VALUES(avg_power_real),
         max_power_real = VALUES(max_power_real), avg_voltage = VALUES(avg_voltage),
         avg_current = VALUES(avg_current), avg_power_factor = VALUES(avg_power_factor),
         anomaly_count = VALUES(anomaly_count)`,
      [
        deviceId,
        yearMonth,
        data.total_energy_kwh,
        data.avg_power_real,
        data.max_power_real,
        data.avg_voltage,
        data.avg_current,
        data.avg_power_factor,
        data.anomaly_count,
      ]
    );
  }

  static async findMonthlyByYear(deviceId: number, year: string): Promise<PowerAggregateMonthly[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM power_aggregates_monthly
       WHERE device_id = ? AND period_month LIKE ?
       ORDER BY period_month`,
      [deviceId, `${year}-%`]
    );
    return rows as PowerAggregateMonthly[];
  }

  static async findMonthly(
    deviceId: number,
    yearMonth: string
  ): Promise<PowerAggregateMonthly | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM power_aggregates_monthly WHERE device_id = ? AND period_month = ?`,
      [deviceId, yearMonth]
    );
    return rows.length > 0 ? (rows[0] as PowerAggregateMonthly) : null;
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────────

  static async deleteHourlyOlderThanDays(days: number): Promise<number> {
    const [result] = await pool.execute<ResultSetHeader>(
      `DELETE FROM power_aggregates_hourly
       WHERE hour_start < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [days]
    );
    return result.affectedRows;
  }
}
