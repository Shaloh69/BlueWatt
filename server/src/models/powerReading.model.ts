import { pool } from '../database/connection';
import { PowerReading } from '../types/models';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export class PowerReadingModel {
  static async create(
    deviceId: number,
    timestamp: Date,
    voltageRms: number,
    currentRms: number,
    powerApparent: number,
    powerReal: number,
    powerFactor: number,
    energyKwh?: number,
    frequency?: number
  ): Promise<number> {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO power_readings
       (device_id, timestamp, voltage_rms, current_rms, power_apparent, power_real, power_factor, energy_kwh, frequency)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        deviceId,
        timestamp,
        voltageRms,
        currentRms,
        powerApparent,
        powerReal,
        powerFactor,
        energyKwh ?? null,
        frequency ?? null,
      ]
    );

    return result.insertId;
  }

  static async findLatestByDevice(deviceId: number): Promise<PowerReading | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, device_id, timestamp, voltage_rms, current_rms,
              power_apparent, power_real, power_factor, energy_kwh, frequency, created_at
       FROM power_readings
       WHERE device_id = ?
       ORDER BY timestamp DESC
       LIMIT 1`,
      [deviceId]
    );

    if (rows.length === 0) {
      return null;
    }

    return rows[0] as PowerReading;
  }

  static async findByDeviceAndTimeRange(
    deviceId: number,
    startTime: Date,
    endTime: Date,
    limit: number = 1000
  ): Promise<PowerReading[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, device_id, timestamp, voltage_rms, current_rms,
              power_apparent, power_real, power_factor, energy_kwh, frequency, created_at
       FROM power_readings
       WHERE device_id = ? AND timestamp BETWEEN ? AND ?
       ORDER BY timestamp DESC
       LIMIT ?`,
      [deviceId, startTime, endTime, limit]
    );

    return rows as PowerReading[];
  }

  static async getAverageByDeviceAndTimeRange(
    deviceId: number,
    startTime: Date,
    endTime: Date
  ): Promise<{
    avg_voltage: number;
    avg_current: number;
    avg_power_real: number;
    avg_power_factor: number;
  } | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         AVG(voltage_rms) as avg_voltage,
         AVG(current_rms) as avg_current,
         AVG(power_real) as avg_power_real,
         AVG(power_factor) as avg_power_factor
       FROM power_readings
       WHERE device_id = ? AND timestamp BETWEEN ? AND ?`,
      [deviceId, startTime, endTime]
    );

    if (rows.length === 0 || rows[0].avg_voltage === null) {
      return null;
    }

    return rows[0] as any;
  }

  /**
   * Minute-precise energy consumption between two datetimes.
   * Uses MAX(energy_kwh) - MIN(energy_kwh) because energy_kwh is a cumulative counter.
   */
  static async energyBetween(deviceId: number, from: Date, to: Date): Promise<number> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT COALESCE(MAX(energy_kwh) - MIN(energy_kwh), 0) AS kwh
       FROM power_readings
       WHERE device_id = ? AND timestamp BETWEEN ? AND ?`,
      [deviceId, from, to]
    );
    return Math.max(0, Number((rows[0] as any).kwh) || 0);
  }

  /**
   * Energy consumed today (midnight → now) for a device.
   * Primary: MAX(energy_kwh) - MIN(energy_kwh) cumulative delta.
   * Fallback: avg_power_real (W) × elapsed time (h) / 1000 — used when the
   * PZEM energy register is near-zero (fresh power-on) or not reported.
   */
  static async energyToday(deviceId: number): Promise<number> {
    // Midnight in Philippine Standard Time (UTC+8)
    const now = new Date();
    const phtNow = new Date(now.getTime() + 8 * 3600 * 1000);
    const midnightPHT = new Date(
      Date.UTC(phtNow.getUTCFullYear(), phtNow.getUTCMonth(), phtNow.getUTCDate()) - 8 * 3600 * 1000
    );

    const fmt = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         COALESCE(MAX(energy_kwh) - MIN(energy_kwh), 0)           AS kwh_delta,
         COALESCE(AVG(power_real), 0)                              AS avg_power_w,
         COALESCE(UNIX_TIMESTAMP(MAX(timestamp))
                - UNIX_TIMESTAMP(MIN(timestamp)), 0)               AS span_seconds
       FROM power_readings
       WHERE device_id = ? AND timestamp >= ?`,
      [deviceId, fmt(midnightPHT)]
    );
    const r = rows[0] as { kwh_delta: unknown; avg_power_w: unknown; span_seconds: unknown };
    const delta = Math.max(0, Number(r.kwh_delta) || 0);
    if (delta > 0.001) return delta;
    // Fallback: W × h / 1000 = kWh
    const avgPowerW = Number(r.avg_power_w) || 0;
    const spanHours = (Number(r.span_seconds) || 0) / 3600;
    return Math.max(0, (avgPowerW * spanHours) / 1000);
  }

  static async deleteOlderThan(days: number): Promise<number> {
    const [result] = await pool.execute<ResultSetHeader>(
      `DELETE FROM power_readings
       WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [days]
    );

    return result.affectedRows;
  }
}
