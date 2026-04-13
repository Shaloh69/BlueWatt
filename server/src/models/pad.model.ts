import { pool } from '../database/connection';
import { Pad } from '../types/models';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export class PadModel {
  static async create(
    ownerId: number,
    name: string,
    description?: string,
    ratePerKwh: number = 11.0
  ): Promise<Pad> {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO pads (owner_id, name, description, rate_per_kwh, is_active)
       VALUES (?, ?, ?, ?, 1)`,
      [ownerId, name, description ?? null, ratePerKwh]
    );
    const pad = await PadModel.findById(result.insertId);
    return pad!;
  }

  static async findById(id: number): Promise<Pad | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM pads WHERE id = ?`,
      [id]
    );
    return rows.length > 0 ? (rows[0] as Pad) : null;
  }

  static async findAll(ownerId?: number): Promise<Pad[]> {
    if (ownerId !== undefined) {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT * FROM pads WHERE owner_id = ? ORDER BY name`,
        [ownerId]
      );
      return rows as Pad[];
    }
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM pads ORDER BY name`
    );
    return rows as Pad[];
  }

  static async findByTenantId(tenantId: number): Promise<Pad | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM pads WHERE tenant_id = ? AND is_active = 1 LIMIT 1`,
      [tenantId]
    );
    return rows.length > 0 ? (rows[0] as Pad) : null;
  }

  static async findByDeviceId(deviceId: number): Promise<Pad | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM pads WHERE device_id = ? LIMIT 1`,
      [deviceId]
    );
    return rows.length > 0 ? (rows[0] as Pad) : null;
  }

  static async update(
    id: number,
    data: Partial<Pick<Pad, 'name' | 'description' | 'rate_per_kwh' | 'is_active'>>
  ): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    if (data.name !== undefined)         { fields.push('name = ?');          values.push(data.name); }
    if (data.description !== undefined)  { fields.push('description = ?');   values.push(data.description); }
    if (data.rate_per_kwh !== undefined) { fields.push('rate_per_kwh = ?');  values.push(data.rate_per_kwh); }
    if (data.is_active !== undefined)    { fields.push('is_active = ?');     values.push(data.is_active); }
    if (fields.length === 0) return;
    values.push(id);
    await pool.execute(`UPDATE pads SET ${fields.join(', ')} WHERE id = ?`, values);
  }

  static async assignTenant(id: number, tenantId: number | null): Promise<void> {
    await pool.execute(`UPDATE pads SET tenant_id = ? WHERE id = ?`, [tenantId, id]);
  }

  static async assignDevice(id: number, deviceId: number | null): Promise<void> {
    // Clear any existing assignment of this device to another pad first
    // (pads.device_id has a UNIQUE constraint — only one pad can hold a device at a time)
    if (deviceId !== null) {
      await pool.execute(
        `UPDATE pads SET device_id = NULL WHERE device_id = ? AND id != ?`,
        [deviceId, id]
      );
    }
    await pool.execute(`UPDATE pads SET device_id = ? WHERE id = ?`, [deviceId, id]);
  }

  static async delete(id: number): Promise<void> {
    await pool.execute(`UPDATE pads SET is_active = 0 WHERE id = ?`, [id]);
  }

  /** Returns pads with joined tenant name, device name, and latest billing status */
  static async findAllWithDetails(ownerId?: number): Promise<RowDataPacket[]> {
    const where = ownerId !== undefined ? 'WHERE p.is_active = 1 AND p.owner_id = ?' : 'WHERE p.is_active = 1';
    const params = ownerId !== undefined ? [ownerId] : [];
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT p.*,
              u.full_name  AS tenant_name,
              u.email      AS tenant_email,
              d.device_id  AS device_serial,
              d.device_name,
              d.relay_status,
              d.last_seen_at,
              b.status     AS latest_bill_status,
              b.amount_due AS latest_bill_amount,
              b.due_date   AS latest_bill_due_date
       FROM pads p
       LEFT JOIN users   u ON u.id = p.tenant_id
       LEFT JOIN devices d ON d.id = p.device_id
       LEFT JOIN billing_periods b ON b.pad_id = p.id
         AND b.id = (SELECT id FROM billing_periods WHERE pad_id = p.id ORDER BY period_start DESC LIMIT 1)
       ${where}
       ORDER BY p.name`,
      params
    );
    return rows;
  }
}
