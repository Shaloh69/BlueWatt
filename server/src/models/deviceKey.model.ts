import { pool } from '../database/connection';
import { DeviceKey } from '../types/models';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export class DeviceKeyModel {
  static async create(deviceId: number, keyHash: string, name?: string): Promise<DeviceKey> {
    const [result] = await pool.execute<ResultSetHeader>(
      'INSERT INTO device_keys (device_id, key_hash, name) VALUES (?, ?, ?)',
      [deviceId, keyHash, name || null]
    );

    return this.findById(result.insertId) as Promise<DeviceKey>;
  }

  static async findById(id: number): Promise<DeviceKey | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, device_id, key_hash, name, is_active, last_used,
              created_at, updated_at
       FROM device_keys WHERE id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return null;
    }

    return rows[0] as DeviceKey;
  }

  static async findByDeviceId(deviceId: number): Promise<DeviceKey[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, device_id, key_hash, name, is_active, last_used,
              created_at, updated_at
       FROM device_keys WHERE device_id = ? ORDER BY created_at DESC`,
      [deviceId]
    );

    return rows as DeviceKey[];
  }

  static async findAllActive(): Promise<DeviceKey[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, device_id, key_hash, name, is_active, last_used,
              created_at, updated_at
       FROM device_keys WHERE is_active = 1`
    );

    return rows as DeviceKey[];
  }

  static async updateLastUsed(id: number): Promise<void> {
    await pool.execute(
      'UPDATE device_keys SET last_used = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );
  }

  static async deactivate(id: number): Promise<void> {
    await pool.execute(
      'UPDATE device_keys SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );
  }

  static async activate(id: number): Promise<void> {
    await pool.execute(
      'UPDATE device_keys SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );
  }

  static async delete(id: number): Promise<void> {
    await pool.execute('DELETE FROM device_keys WHERE id = ?', [id]);
  }
}
