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
    powerFactor: number
  ): Promise<number> {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO power_readings
       (device_id, timestamp, voltage_rms, current_rms, power_apparent, power_real, power_factor)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [deviceId, timestamp, voltageRms, currentRms, powerApparent, powerReal, powerFactor]
    );

    return result.insertId;
  }

  static async findLatestByDevice(deviceId: number): Promise<PowerReading | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, device_id, timestamp, voltage_rms, current_rms,
              power_apparent, power_real, power_factor, created_at
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
              power_apparent, power_real, power_factor, created_at
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

  static async deleteOlderThan(days: number): Promise<number> {
    const [result] = await pool.execute<ResultSetHeader>(
      `DELETE FROM power_readings
       WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [days]
    );

    return result.affectedRows;
  }
}
