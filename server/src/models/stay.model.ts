import { pool } from '../database/connection';
import { Stay } from '../types/models';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export class StayModel {
  static async create(data: {
    pad_id: number;
    tenant_id: number;
    check_in_at: Date;
    billing_cycle: 'daily' | 'monthly';
    flat_rate_per_cycle: number;
    rate_per_kwh: number;
    notes?: string;
    created_by: number;
  }): Promise<Stay> {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO stays
         (pad_id, tenant_id, check_in_at, billing_cycle, flat_rate_per_cycle, rate_per_kwh, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.pad_id,
        data.tenant_id,
        data.check_in_at,
        data.billing_cycle,
        data.flat_rate_per_cycle,
        data.rate_per_kwh,
        data.notes ?? null,
        data.created_by,
      ]
    );
    return (await StayModel.findById(result.insertId))!;
  }

  static async findById(id: number): Promise<Stay | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT s.*,
              p.name       AS pad_name,
              u.full_name  AS tenant_name,
              u.email      AS tenant_email,
              a.full_name  AS created_by_name
       FROM stays s
       JOIN pads  p ON p.id = s.pad_id
       JOIN users u ON u.id = s.tenant_id
       JOIN users a ON a.id = s.created_by
       WHERE s.id = ?`,
      [id]
    );
    return rows.length > 0 ? (rows[0] as Stay) : null;
  }

  static async findAll(): Promise<RowDataPacket[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT s.*,
              p.name       AS pad_name,
              u.full_name  AS tenant_name,
              u.email      AS tenant_email,
              a.full_name  AS created_by_name
       FROM stays s
       JOIN pads  p ON p.id = s.pad_id
       JOIN users u ON u.id = s.tenant_id
       JOIN users a ON a.id = s.created_by
       ORDER BY s.check_in_at DESC`
    );
    return rows;
  }

  static async findByPad(padId: number): Promise<RowDataPacket[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT s.*,
              p.name       AS pad_name,
              u.full_name  AS tenant_name,
              u.email      AS tenant_email
       FROM stays s
       JOIN pads  p ON p.id = s.pad_id
       JOIN users u ON u.id = s.tenant_id
       WHERE s.pad_id = ?
       ORDER BY s.check_in_at DESC`,
      [padId]
    );
    return rows;
  }

  /** All stays that are still active (no check_out yet) */
  static async findActive(): Promise<RowDataPacket[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT s.*,
              p.name       AS pad_name,
              p.device_id  AS device_db_id,
              u.full_name  AS tenant_name
       FROM stays s
       JOIN pads  p ON p.id = s.pad_id
       JOIN users u ON u.id = s.tenant_id
       WHERE s.status = 'active'`
    );
    return rows;
  }

  /** All stays that ended but may still need a final prorated bill */
  static async findRecentlyEnded(withinHours: number = 48): Promise<RowDataPacket[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT s.*,
              p.name       AS pad_name,
              p.device_id  AS device_db_id,
              u.full_name  AS tenant_name
       FROM stays s
       JOIN pads  p ON p.id = s.pad_id
       JOIN users u ON u.id = s.tenant_id
       WHERE s.status = 'ended'
         AND s.check_out_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)`,
      [withinHours]
    );
    return rows;
  }

  static async checkout(id: number, checkOutAt: Date): Promise<void> {
    await pool.execute(`UPDATE stays SET status = 'ended', check_out_at = ? WHERE id = ?`, [
      checkOutAt,
      id,
    ]);
  }

  static async delete(id: number): Promise<void> {
    await pool.execute(`DELETE FROM stays WHERE id = ?`, [id]);
  }
}
