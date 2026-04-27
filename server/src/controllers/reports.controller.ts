import { Request, Response, NextFunction } from 'express';
import { PowerAggregateModel } from '../models/powerAggregate.model';
import { DeviceModel } from '../models/device.model';
import { AppError } from '../utils/AppError';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { HTTP_STATUS, ERROR_CODES } from '../config/constants';
import { pool } from '../database/connection';
import { RowDataPacket } from 'mysql2';

/** GET /reports/hourly/:deviceId?date=YYYY-MM-DD */
export const getHourlyReport = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    if (!req.user)
      throw new AppError('Unauthenticated', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
    const deviceId = parseInt(req.params.deviceId, 10);
    await assertDeviceAccess(deviceId, req.user);

    const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
    const data = await PowerAggregateModel.findHourlyByDate(deviceId, date);
    sendSuccess(res, { date, device_id: deviceId, hours: data });
  }
);

/** GET /reports/daily/:deviceId?month=YYYY-MM */
export const getDailyReport = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    if (!req.user)
      throw new AppError('Unauthenticated', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
    const deviceId = parseInt(req.params.deviceId, 10);
    await assertDeviceAccess(deviceId, req.user);

    const now = new Date();
    const month =
      (req.query.month as string) ||
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const data = await PowerAggregateModel.findDailyByMonth(deviceId, month);

    // For the current month, inject today's live data if the cron hasn't aggregated it yet
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (month === currentMonth) {
      const today = now.toISOString().split('T')[0]; // 'YYYY-MM-DD'
      const hasToday = data.some((r) => {
        const d =
          r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date).slice(0, 10);
        return d === today;
      });
      if (!hasToday) {
        const [liveRows] = await pool.execute<RowDataPacket[]>(
          `SELECT
           ? AS date,
           COALESCE(AVG(voltage_rms), 0) AS avg_voltage,
           COALESCE(AVG(current_rms), 0) AS avg_current,
           COALESCE(AVG(power_real), 0) AS avg_power_real,
           COALESCE(MAX(power_real), 0) AS max_power_real,
           COALESCE(MIN(power_real), 0) AS min_power_real,
           COALESCE(MAX(energy_kwh) - MIN(energy_kwh), 0) AS total_energy_kwh,
           COALESCE(AVG(power_factor), 0) AS avg_power_factor,
           COUNT(*) AS reading_count,
           0 AS anomaly_count
         FROM power_readings
         WHERE device_id = ? AND DATE(timestamp) = ?`,
          [today, deviceId, today]
        );
        if (liveRows.length > 0 && Number(liveRows[0].reading_count) > 0) {
          data.push(liveRows[0] as any);
          data.sort((a, b) => String(a.date).localeCompare(String(b.date)));
        }
      }
    }

    sendSuccess(res, { month, device_id: deviceId, days: data });
  }
);

/** GET /reports/daily/:deviceId/all — all-time daily records, newest first */
export const getAllDailyReport = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    if (!req.user)
      throw new AppError('Unauthenticated', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
    const deviceId = parseInt(req.params.deviceId, 10);
    await assertDeviceAccess(deviceId, req.user);

    const data = await PowerAggregateModel.findAllDaily(deviceId);
    sendSuccess(res, { device_id: deviceId, days: data });
  }
);

/** GET /reports/monthly/:deviceId?year=YYYY */
export const getMonthlyReport = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    if (!req.user)
      throw new AppError('Unauthenticated', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
    const deviceId = parseInt(req.params.deviceId, 10);
    await assertDeviceAccess(deviceId, req.user);

    const year = (req.query.year as string) || String(new Date().getFullYear());
    const data = await PowerAggregateModel.findMonthlyByYear(deviceId, year);
    sendSuccess(res, { year, device_id: deviceId, months: data });
  }
);

/** GET /reports/pad-summary — admin: all pads, current month energy + bill */
export const getPadSummary = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    const yearMonth = (req.query.month as string) || new Date().toISOString().slice(0, 7);

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT p.id, p.name, p.rate_per_kwh,
            u.full_name AS tenant_name,
            d.id AS device_id_int,
            d.device_id AS device_serial,
            d.relay_status, d.last_seen_at,
            COALESCE(agg.total_energy_kwh, 0) AS energy_kwh,
            COALESCE(agg.total_energy_kwh * p.rate_per_kwh, 0) AS estimated_amount,
            COALESCE(agg.anomaly_count, 0) AS anomaly_count,
            b.status AS bill_status, b.amount_due AS billed_amount
     FROM pads p
     LEFT JOIN users u ON u.id = p.tenant_id
     LEFT JOIN devices d ON d.id = p.device_id
     LEFT JOIN power_aggregates_monthly agg ON agg.device_id = p.device_id AND agg.period_month = ?
     LEFT JOIN billing_periods b ON b.pad_id = p.id AND DATE_FORMAT(b.period_start, '%Y-%m') = ?
     WHERE p.is_active = 1
     ORDER BY p.name`,
      [yearMonth, yearMonth]
    );

    sendSuccess(res, { month: yearMonth, pads: rows });
  }
);

/** GET /reports/anomalies/:deviceId?start=&end= */
export const getAnomalyReport = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    if (!req.user)
      throw new AppError('Unauthenticated', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
    const deviceId = parseInt(req.params.deviceId, 10);
    await assertDeviceAccess(deviceId, req.user);

    const endDate = req.query.end ? new Date(req.query.end as string) : new Date();
    const startDate = req.query.start
      ? new Date(req.query.start as string)
      : new Date(endDate.getTime() - 30 * 86400_000);

    // Grouped by type
    const [byType] = await pool.execute<RowDataPacket[]>(
      `SELECT anomaly_type, severity, COUNT(*) AS count,
            SUM(relay_tripped) AS trips
     FROM anomaly_events
     WHERE device_id = ? AND timestamp BETWEEN ? AND ?
     GROUP BY anomaly_type, severity
     ORDER BY count DESC`,
      [deviceId, startDate, endDate]
    );

    // Daily timeline
    const [timeline] = await pool.execute<RowDataPacket[]>(
      `SELECT DATE(timestamp) AS date, COUNT(*) AS count,
            SUM(relay_tripped) AS trips
     FROM anomaly_events
     WHERE device_id = ? AND timestamp BETWEEN ? AND ?
     GROUP BY DATE(timestamp)
     ORDER BY date`,
      [deviceId, startDate, endDate]
    );

    // Severity distribution
    const [bySeverity] = await pool.execute<RowDataPacket[]>(
      `SELECT severity, COUNT(*) AS count
     FROM anomaly_events
     WHERE device_id = ? AND timestamp BETWEEN ? AND ?
     GROUP BY severity`,
      [deviceId, startDate, endDate]
    );

    sendSuccess(res, {
      device_id: deviceId,
      start: startDate,
      end: endDate,
      by_type: byType,
      timeline,
      by_severity: bySeverity,
    });
  }
);

/** GET /reports/anomalies/summary — admin: anomaly count per pad this month */
export const getAnomalySummary = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    const yearMonth = (req.query.month as string) || new Date().toISOString().slice(0, 7);

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT p.id AS pad_id, p.name AS pad_name,
            COALESCE(agg.anomaly_count, 0) AS anomaly_count,
            d.device_id AS device_serial, d.relay_status
     FROM pads p
     LEFT JOIN devices d ON d.id = p.device_id
     LEFT JOIN power_aggregates_monthly agg ON agg.device_id = p.device_id AND agg.period_month = ?
     WHERE p.is_active = 1
     ORDER BY anomaly_count DESC`,
      [yearMonth]
    );

    sendSuccess(res, { month: yearMonth, pads: rows });
  }
);

/** GET /reports/export/:deviceId — CSV download */
export const exportCsv = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  if (!req.user)
    throw new AppError('Unauthenticated', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
  const deviceId = parseInt(req.params.deviceId, 10);
  await assertDeviceAccess(deviceId, req.user);

  const endDate = req.query.end ? new Date(req.query.end as string) : new Date();
  const startDate = req.query.start
    ? new Date(req.query.start as string)
    : new Date(endDate.getTime() - 7 * 86400_000);

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT timestamp, voltage_rms, current_rms, power_real, power_apparent,
            power_factor, energy_kwh, frequency
     FROM power_readings
     WHERE device_id = ? AND timestamp BETWEEN ? AND ?
     ORDER BY timestamp`,
    [deviceId, startDate, endDate]
  );

  const header =
    'timestamp,voltage_rms,current_rms,power_real,power_apparent,power_factor,energy_kwh,frequency\n';
  const csv =
    header +
    rows
      .map(
        (r) =>
          `${r.timestamp},${r.voltage_rms},${r.current_rms},${r.power_real},${r.power_apparent},${r.power_factor},${r.energy_kwh ?? ''},${r.frequency ?? ''}`
      )
      .join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="bluewatt-device-${deviceId}.csv"`);
  res.send(csv);
});

// ── Helper ───────────────────────────────────────────────────────────────────

async function assertDeviceAccess(deviceId: number, user: any): Promise<void> {
  const device = await DeviceModel.findById(deviceId);
  if (!device)
    throw new AppError('Device not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.DEVICE_NOT_FOUND);
  if (user.role === 'admin') return;
  const ok = await DeviceModel.isAccessibleByUser(deviceId, user.id);
  if (!ok) throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN);
}
