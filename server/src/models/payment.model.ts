import { pool } from '../database/connection';
import { Payment } from '../types/models';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export class PaymentModel {
  /** Tenant submits a receipt — creates a payment in pending_verification state */
  static async submitReceipt(
    billingPeriodId: number,
    tenantId: number,
    amount: number,
    paymentMethod: string,
    referenceNumber: string,
    receiptUrl: string
  ): Promise<Payment> {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO payments
         (billing_period_id, tenant_id, amount, payment_method, reference_number, receipt_url, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending_verification')`,
      [billingPeriodId, tenantId, amount, paymentMethod, referenceNumber, receiptUrl]
    );
    return (await PaymentModel.findById(result.insertId))!;
  }

  static async findById(id: number): Promise<Payment | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(`SELECT * FROM payments WHERE id = ?`, [id]);
    return rows.length > 0 ? (rows[0] as Payment) : null;
  }

  static async findByBillingPeriod(billingPeriodId: number): Promise<Payment[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM payments WHERE billing_period_id = ? ORDER BY created_at DESC`,
      [billingPeriodId]
    );
    return rows as Payment[];
  }

  static async findByTenant(tenantId: number, limit: number = 20): Promise<RowDataPacket[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT pay.*, b.period_start, b.period_end, p.name AS pad_name
       FROM payments pay
       JOIN billing_periods b ON b.id = pay.billing_period_id
       JOIN pads p ON p.id = b.pad_id
       WHERE pay.tenant_id = ?
       ORDER BY pay.created_at DESC LIMIT ?`,
      [tenantId, limit]
    );
    return rows;
  }

  /** Admin: all payments pending verification */
  static async findPendingVerification(): Promise<RowDataPacket[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT pay.*, b.period_start, b.period_end, p.name AS pad_name,
              u.full_name AS tenant_name, u.email AS tenant_email
       FROM payments pay
       JOIN billing_periods b ON b.id = pay.billing_period_id
       JOIN pads p ON p.id = b.pad_id
       JOIN users u ON u.id = pay.tenant_id
       WHERE pay.status = 'pending_verification'
       ORDER BY pay.created_at ASC`
    );
    return rows;
  }

  /** Admin: all payments with full detail */
  static async findAll(limit: number = 100): Promise<RowDataPacket[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT pay.*, b.period_start, b.period_end, p.name AS pad_name,
              u.full_name AS tenant_name, u.email AS tenant_email,
              v.full_name AS verified_by_name
       FROM payments pay
       JOIN billing_periods b ON b.id = pay.billing_period_id
       JOIN pads p ON p.id = b.pad_id
       JOIN users u ON u.id = pay.tenant_id
       LEFT JOIN users v ON v.id = pay.verified_by
       ORDER BY pay.created_at DESC LIMIT ?`,
      [limit]
    );
    return rows;
  }

  /** Admin approves: marks payment paid + records who verified */
  static async approve(id: number, adminId: number): Promise<void> {
    await pool.execute(
      `UPDATE payments
       SET status = 'paid', verified_by = ?, verified_at = NOW(), paid_at = NOW()
       WHERE id = ?`,
      [adminId, id]
    );
  }

  /** Admin rejects: marks payment failed + stores reason */
  static async reject(id: number, adminId: number, reason: string): Promise<void> {
    await pool.execute(
      `UPDATE payments
       SET status = 'failed', verified_by = ?, verified_at = NOW(), rejection_reason = ?
       WHERE id = ?`,
      [adminId, reason, id]
    );
  }
}
