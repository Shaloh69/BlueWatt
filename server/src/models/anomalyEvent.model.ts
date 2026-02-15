import { pool } from '../database/connection';
import { AnomalyEvent } from '../types/models';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export class AnomalyEventModel {
  static async create(
    deviceId: number,
    timestamp: Date,
    anomalyType: string,
    severity: string,
    current: number,
    voltage: number,
    power: number,
    relayTripped: boolean
  ): Promise<number> {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO anomaly_events
       (device_id, timestamp, anomaly_type, severity, current_value, voltage_value, power_value, relay_tripped)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [deviceId, timestamp, anomalyType, severity, current, voltage, power, relayTripped]
    );

    return result.insertId;
  }

  static async findById(id: number): Promise<AnomalyEvent | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, device_id, timestamp, anomaly_type, severity, current_value, voltage_value, power_value,
              relay_tripped, is_resolved, resolved_at, resolved_by, notes, created_at
       FROM anomaly_events WHERE id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return null;
    }

    return rows[0] as AnomalyEvent;
  }

  static async findByDeviceAndTimeRange(
    deviceId: number,
    startTime: Date,
    endTime: Date,
    limit: number = 100
  ): Promise<AnomalyEvent[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, device_id, timestamp, anomaly_type, severity, current_value, voltage_value, power_value,
              relay_tripped, is_resolved, resolved_at, resolved_by, notes, created_at
       FROM anomaly_events
       WHERE device_id = ? AND timestamp BETWEEN ? AND ?
       ORDER BY timestamp DESC
       LIMIT ?`,
      [deviceId, startTime, endTime, limit]
    );

    return rows as AnomalyEvent[];
  }

  static async findUnresolvedByDevice(deviceId: number): Promise<AnomalyEvent[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, device_id, timestamp, anomaly_type, severity, current_value, voltage_value, power_value,
              relay_tripped, is_resolved, resolved_at, resolved_by, notes, created_at
       FROM anomaly_events
       WHERE device_id = ? AND is_resolved = 0
       ORDER BY timestamp DESC`,
      [deviceId]
    );

    return rows as AnomalyEvent[];
  }

  static async markResolved(id: number): Promise<void> {
    await pool.execute(
      'UPDATE anomaly_events SET is_resolved = 1, resolved_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );
  }

  static async countByDeviceAndTimeRange(
    deviceId: number,
    startTime: Date,
    endTime: Date
  ): Promise<number> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as count
       FROM anomaly_events
       WHERE device_id = ? AND timestamp BETWEEN ? AND ?`,
      [deviceId, startTime, endTime]
    );

    return rows[0].count;
  }

  static async deleteResolvedOlderThan(days: number): Promise<number> {
    const [result] = await pool.execute<ResultSetHeader>(
      `DELETE FROM anomaly_events
       WHERE is_resolved = 1 AND resolved_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [days]
    );

    return result.affectedRows;
  }
}
