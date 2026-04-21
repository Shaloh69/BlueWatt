import { pool } from '../database/connection';
import { BillingPeriod } from '../types/models';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export class BillingPeriodModel {
  static async create(
    padId: number,
    tenantId: number | null,
    periodStart: Date,
    periodEnd: Date,
    energyKwh: number,
    ratePerKwh: number,
    amountDue: number,
    dueDate: Date,
    opts?: { stayId?: number; flatAmount?: number; cycleNumber?: number; billType?: 'electricity' | 'rent' }
  ): Promise<BillingPeriod> {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO billing_periods
         (pad_id, stay_id, tenant_id, period_start, period_end,
          energy_kwh, rate_per_kwh, amount_due, flat_amount, cycle_number, bill_type, due_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        padId,
        opts?.stayId ?? null,
        tenantId,
        periodStart,
        periodEnd,
        energyKwh,
        ratePerKwh,
        amountDue,
        opts?.flatAmount ?? 0,
        opts?.cycleNumber ?? null,
        opts?.billType ?? 'electricity',
        dueDate,
      ]
    );
    return (await BillingPeriodModel.findById(result.insertId))!;
  }

  /** Check whether a specific stay-cycle+type bill already exists */
  static async existsForStayCycle(
    stayId: number,
    cycleNumber: number,
    billType: 'electricity' | 'rent' = 'electricity'
  ): Promise<boolean> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM billing_periods WHERE stay_id = ? AND cycle_number = ? AND bill_type = ? LIMIT 1`,
      [stayId, cycleNumber, billType]
    );
    return rows.length > 0;
  }

  static async findById(id: number): Promise<BillingPeriod | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM billing_periods WHERE id = ?`,
      [id]
    );
    return rows.length > 0 ? (rows[0] as BillingPeriod) : null;
  }

  static async findByPad(padId: number, limit: number = 24): Promise<BillingPeriod[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM billing_periods WHERE pad_id = ?
       ORDER BY period_start DESC LIMIT ${Math.floor(limit)}`,
      [padId]
    );
    return rows as BillingPeriod[];
  }

  static async findByTenant(tenantId: number, limit: number = 12): Promise<RowDataPacket[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT b.*, p.name AS pad_name
       FROM billing_periods b
       JOIN pads p ON p.id = b.pad_id
       WHERE b.tenant_id = ?
       ORDER BY b.period_start DESC LIMIT ${Math.floor(limit)}`,
      [tenantId]
    );
    return rows;
  }

  static async findAll(filters?: { status?: string; padId?: number }): Promise<RowDataPacket[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    if (filters?.status) { conditions.push('b.status = ?'); params.push(filters.status); }
    if (filters?.padId)  { conditions.push('b.pad_id = ?'); params.push(filters.padId); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT b.*, p.name AS pad_name,
              u.full_name AS tenant_name
       FROM billing_periods b
       JOIN pads p ON p.id = b.pad_id
       LEFT JOIN users u ON u.id = b.tenant_id
       ${where}
       ORDER BY b.period_start DESC`,
      params
    );
    return rows;
  }

  static async existsForPeriod(padId: number, periodStart: Date): Promise<boolean> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM billing_periods WHERE pad_id = ? AND period_start = ? LIMIT 1`,
      [padId, periodStart]
    );
    return rows.length > 0;
  }

  static async markPaid(id: number): Promise<void> {
    await pool.execute(
      `UPDATE billing_periods SET status = 'paid', paid_at = NOW() WHERE id = ?`,
      [id]
    );
  }

  static async markOverdue(): Promise<number> {
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE billing_periods
       SET status = 'overdue'
       WHERE status = 'unpaid' AND due_date < CURDATE()`
    );
    return result.affectedRows;
  }

  static async waive(id: number): Promise<void> {
    await pool.execute(
      `UPDATE billing_periods SET status = 'waived' WHERE id = ?`,
      [id]
    );
  }

  static async delete(id: number): Promise<void> {
    await pool.execute(`DELETE FROM billing_periods WHERE id = ?`, [id]);
  }
}
