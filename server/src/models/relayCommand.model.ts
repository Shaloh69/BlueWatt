import { pool } from '../database/connection';
import { RelayCommand } from '../types/models';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export class RelayCommandModel {
  static async create(
    deviceId: number,
    command: 'on' | 'off' | 'reset',
    issuedBy: number
  ): Promise<RelayCommand> {
    // Cancel any existing pending commands for this device
    await pool.execute(
      `UPDATE relay_commands SET status = 'failed'
       WHERE device_id = ? AND status = 'pending'`,
      [deviceId]
    );
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO relay_commands (device_id, command, issued_by)
       VALUES (?, ?, ?)`,
      [deviceId, command, issuedBy]
    );
    return (await RelayCommandModel.findById(result.insertId))!;
  }

  static async findById(id: number): Promise<RelayCommand | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM relay_commands WHERE id = ?`,
      [id]
    );
    return rows.length > 0 ? (rows[0] as RelayCommand) : null;
  }

  static async findPendingForDevice(deviceId: number): Promise<RelayCommand | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM relay_commands
       WHERE device_id = ? AND status = 'pending'
       ORDER BY issued_at ASC LIMIT 1`,
      [deviceId]
    );
    return rows.length > 0 ? (rows[0] as RelayCommand) : null;
  }

  static async acknowledge(id: number): Promise<void> {
    await pool.execute(
      `UPDATE relay_commands SET status = 'acked', acked_at = NOW() WHERE id = ?`,
      [id]
    );
  }

  static async findByDevice(deviceId: number, limit: number = 20): Promise<RelayCommand[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT rc.*, u.full_name AS issued_by_name
       FROM relay_commands rc
       LEFT JOIN users u ON u.id = rc.issued_by
       WHERE rc.device_id = ?
       ORDER BY rc.issued_at DESC LIMIT ?`,
      [deviceId, limit]
    );
    return rows as RelayCommand[];
  }
}
