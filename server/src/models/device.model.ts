import { pool } from '../database/connection';
import { Device } from '../types/models';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export class DeviceModel {
  static async create(userId: number, deviceId: string, deviceName: string, location?: string, description?: string): Promise<Device> {
    const [result] = await pool.execute<ResultSetHeader>(
      'INSERT INTO devices (owner_id, device_id, device_name, location, description) VALUES (?, ?, ?, ?, ?)',
      [userId, deviceId, deviceName, location || null, description || null]
    );

    return this.findById(result.insertId) as Promise<Device>;
  }

  static async findById(id: number): Promise<Device | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, owner_id, device_id, device_name, location, description, is_active, relay_status,
              last_seen_at, firmware_version, created_at, updated_at
       FROM devices WHERE id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return null;
    }

    return rows[0] as Device;
  }

  static async findByDeviceId(deviceId: string): Promise<Device | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, owner_id, device_id, device_name, location, description, is_active, relay_status,
              last_seen_at, firmware_version, created_at, updated_at
       FROM devices WHERE device_id = ?`,
      [deviceId]
    );

    if (rows.length === 0) {
      return null;
    }

    return rows[0] as Device;
  }

  static async findByUserId(userId: number): Promise<Device[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, owner_id, device_id, device_name, location, description, is_active, relay_status,
              last_seen_at, firmware_version, created_at, updated_at
       FROM devices WHERE owner_id = ? ORDER BY created_at DESC`,
      [userId]
    );

    return rows as Device[];
  }

  static async update(id: number, data: Partial<Pick<Device, 'device_name' | 'location' | 'description' | 'is_active' | 'relay_status'>>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.device_name !== undefined) {
      fields.push('device_name = ?');
      values.push(data.device_name);
    }

    if (data.location !== undefined) {
      fields.push('location = ?');
      values.push(data.location);
    }

    if (data.description !== undefined) {
      fields.push('description = ?');
      values.push(data.description);
    }

    if (data.is_active !== undefined) {
      fields.push('is_active = ?');
      values.push(data.is_active);
    }

    if (data.relay_status !== undefined) {
      fields.push('relay_status = ?');
      values.push(data.relay_status);
    }

    if (fields.length === 0) {
      return;
    }

    values.push(id);

    await pool.execute(
      `UPDATE devices SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      values
    );
  }

  static async updateLastSeen(id: number): Promise<void> {
    await pool.execute(
      'UPDATE devices SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );
  }

  static async delete(id: number): Promise<void> {
    await pool.execute('DELETE FROM devices WHERE id = ?', [id]);
  }

  static async isOwnedByUser(deviceId: number, userId: number): Promise<boolean> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT id FROM devices WHERE id = ? AND owner_id = ?',
      [deviceId, userId]
    );

    return rows.length > 0;
  }
}
