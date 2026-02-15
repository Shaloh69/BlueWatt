import { pool } from '../database/connection';
import { User } from '../types/models';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export class UserModel {
  static async create(email: string, passwordHash: string, fullName: string, role: 'admin' | 'user' = 'user'): Promise<User> {
    const [result] = await pool.execute<ResultSetHeader>(
      'INSERT INTO users (email, password_hash, full_name, role) VALUES (?, ?, ?, ?)',
      [email, passwordHash, fullName, role]
    );

    return this.findById(result.insertId) as Promise<User>;
  }

  static async findById(id: number): Promise<User | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT id, email, password_hash, full_name, role, is_active, created_at, updated_at, last_login_at FROM users WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      return null;
    }

    return rows[0] as User;
  }

  static async findByEmail(email: string): Promise<User | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT id, email, password_hash, full_name, role, is_active, created_at, updated_at, last_login_at FROM users WHERE email = ?',
      [email]
    );

    if (rows.length === 0) {
      return null;
    }

    return rows[0] as User;
  }

  static async update(id: number, data: Partial<Pick<User, 'email' | 'full_name' | 'password_hash'>>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.email !== undefined) {
      fields.push('email = ?');
      values.push(data.email);
    }

    if (data.full_name !== undefined) {
      fields.push('full_name = ?');
      values.push(data.full_name);
    }

    if (data.password_hash !== undefined) {
      fields.push('password_hash = ?');
      values.push(data.password_hash);
    }

    if (fields.length === 0) {
      return;
    }

    values.push(id);

    await pool.execute(
      `UPDATE users SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      values
    );
  }

  static async delete(id: number): Promise<void> {
    await pool.execute('DELETE FROM users WHERE id = ?', [id]);
  }

  static async updateProfileImage(id: number, imageUrl: string): Promise<void> {
    await pool.execute(
      'UPDATE users SET profile_image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [imageUrl, id]
    );
  }
}
