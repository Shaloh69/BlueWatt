import { pool } from '../database/connection';
import { PaymentQrCode } from '../types/models';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export class PaymentQrCodeModel {
  static async create(label: string, imageUrl: string, uploadedBy: number): Promise<PaymentQrCode> {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO payment_qr_codes (label, image_url, uploaded_by) VALUES (?, ?, ?)`,
      [label, imageUrl, uploadedBy]
    );
    return (await PaymentQrCodeModel.findById(result.insertId))!;
  }

  static async findById(id: number): Promise<PaymentQrCode | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM payment_qr_codes WHERE id = ?`, [id]
    );
    return rows.length > 0 ? (rows[0] as PaymentQrCode) : null;
  }

  static async findAllActive(): Promise<PaymentQrCode[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM payment_qr_codes WHERE is_active = 1 ORDER BY created_at DESC`
    );
    return rows as PaymentQrCode[];
  }

  static async findAll(): Promise<RowDataPacket[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT q.*, u.full_name AS uploaded_by_name
       FROM payment_qr_codes q
       JOIN users u ON u.id = q.uploaded_by
       ORDER BY q.created_at DESC`
    );
    return rows;
  }

  static async setActive(id: number, isActive: boolean): Promise<void> {
    await pool.execute(
      `UPDATE payment_qr_codes SET is_active = ? WHERE id = ?`,
      [isActive ? 1 : 0, id]
    );
  }

  static async delete(id: number): Promise<void> {
    await pool.execute(`DELETE FROM payment_qr_codes WHERE id = ?`, [id]);
  }
}
