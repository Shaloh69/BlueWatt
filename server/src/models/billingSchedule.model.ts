import { pool } from '../database/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export interface BillingSchedule {
  id: number;
  pad_id: number;
  bill_type: 'electricity' | 'rent';
  frequency: 'daily' | 'weekly' | 'monthly';
  due_date_offset_days: number;
  flat_amount: number | null;
  next_period_start: string;
  status: 'active' | 'stopped';
  created_at: string;
  pad_name?: string;
  tenant_name?: string;
}

export class BillingScheduleModel {
  static async create(data: {
    pad_id: number;
    bill_type: 'electricity' | 'rent';
    frequency: 'daily' | 'weekly' | 'monthly';
    due_date_offset_days: number;
    flat_amount?: number | null;
    start_date: string;
  }): Promise<BillingSchedule> {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO billing_schedules
         (pad_id, bill_type, frequency, due_date_offset_days, flat_amount, next_period_start)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        data.pad_id,
        data.bill_type,
        data.frequency,
        data.due_date_offset_days,
        data.flat_amount ?? null,
        data.start_date,
      ]
    );
    return (await BillingScheduleModel.findById(result.insertId))!;
  }

  static async findById(id: number): Promise<BillingSchedule | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT s.*, p.name AS pad_name, u.full_name AS tenant_name
       FROM billing_schedules s
       JOIN pads p ON p.id = s.pad_id
       LEFT JOIN users u ON u.id = p.tenant_id
       WHERE s.id = ?`,
      [id]
    );
    return rows.length > 0 ? (rows[0] as BillingSchedule) : null;
  }

  static async findAll(): Promise<BillingSchedule[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT s.*, p.name AS pad_name, u.full_name AS tenant_name
       FROM billing_schedules s
       JOIN pads p ON p.id = s.pad_id
       LEFT JOIN users u ON u.id = p.tenant_id
       ORDER BY s.created_at DESC`
    );
    return rows as BillingSchedule[];
  }

  /** Active schedules whose billing period has fully closed and is ready to generate. */
  static async findActiveDue(): Promise<RowDataPacket[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT s.*,
              p.name AS pad_name,
              p.tenant_id,
              p.device_id,
              p.rate_per_kwh
       FROM billing_schedules s
       JOIN pads p ON p.id = s.pad_id
       WHERE s.status = 'active'
         AND (
           -- Rent: generate as soon as the period starts
           (s.bill_type != 'electricity' AND s.next_period_start <= CURDATE())
           OR
           -- Electricity: wait for the full period to close so all readings are available
           (s.bill_type = 'electricity' AND (
             (s.frequency = 'daily'   AND s.next_period_start  < CURDATE())
             OR (s.frequency = 'weekly'  AND DATE_ADD(s.next_period_start, INTERVAL 6 DAY) < CURDATE())
             OR (s.frequency = 'monthly' AND LAST_DAY(s.next_period_start) < CURDATE())
           ))
         )`
    );
    return rows;
  }

  static async updateNextPeriod(id: number, nextPeriodStart: string): Promise<void> {
    await pool.execute(`UPDATE billing_schedules SET next_period_start = ? WHERE id = ?`, [
      nextPeriodStart,
      id,
    ]);
  }

  static async stop(id: number): Promise<void> {
    await pool.execute(`UPDATE billing_schedules SET status = 'stopped' WHERE id = ?`, [id]);
  }

  static async delete(id: number): Promise<void> {
    await pool.execute(`DELETE FROM billing_schedules WHERE id = ?`, [id]);
  }
}
