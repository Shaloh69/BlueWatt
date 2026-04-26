/**
 * BlueWatt Database Seeder — Real Meter Data
 * Run: npm run seed
 *
 * Seeds:
 *  - Cleanses all data, keeps admin account
 *  - 3 real tenants: Reynie (PAD-1), Sophie (PAD-2), Jassy (PAD-4)
 *  - 4 devices (bluewatt-001/002/003/004); PAD-3 unassigned
 *  - Daily power aggregates Mar 11 – Apr 9 (exact CKS spreadsheet values)
 *  - CKS meter readings (verified from spreadsheet bluewatt-excel):
 *      Reynie PAD-1 (#2020351142): Mar11=3340.8 → Apr9=3414.2  kWh  avg=2.51/day
 *      Sophie PAD-2 (#2020351146): Mar11=4515.7 → Apr9=4699.31 kWh  avg=6.25/day
 *      Jassy  PAD-4 (#2020351141): Mar11=6184.2 → Apr9=6531.05 kWh  avg=11.94/day
 *  - PAD-1 prototype values include realistic ±0.05–0.13 kWh noise (was copy of submeter)
 *  - Billing skipped — no verified Apr 10–17 meter data yet
 *  - Rate: ₱11.35/kWh | Check-in: March 11 2026
 */

import { pool } from '../connection';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

// ── Credentials ───────────────────────────────────────────────────────────────

const TENANTS = [
  { email: 'reynie-proto@test.com', password: 'Tenant@1234', full_name: 'Reynie Tapnio' },
  { email: 'sophie-proto@test.com', password: 'Tenant@1234', full_name: 'Sophie Garcia' },
  { email: 'jassy-proto@test.com',  password: 'Tenant@1234', full_name: 'Jassy Halt'    },
];

const DEVICES = [
  { device_id: 'bluewatt-001', device_name: 'PAD-1 Meter', location: 'Unit PAD-1', description: 'ESP32 meter — Reynie (CKS #2020351142)' },
  { device_id: 'bluewatt-002', device_name: 'PAD-2 Meter', location: 'Unit PAD-2', description: 'ESP32 meter — Sophie (CKS #2020351146)' },
  { device_id: 'bluewatt-003', device_name: 'PAD-3 Meter', location: 'Unit PAD-3', description: 'ESP32 meter — PAD-3 (unassigned)'        },
  { device_id: 'bluewatt-004', device_name: 'PAD-4 Meter', location: 'Unit PAD-4', description: 'ESP32 meter — Jassy  (CKS #2020351141)' },
];

const PADS = [
  { name: 'PAD-1', description: 'Reynie Tapnio unit', device_serial: 'bluewatt-001', tenant_email: 'reynie-proto@test.com', rate_per_kwh: 11.35, flat_rate: 2000.00 },
  { name: 'PAD-2', description: 'Sophie Garcia unit', device_serial: 'bluewatt-002', tenant_email: 'sophie-proto@test.com', rate_per_kwh: 11.35, flat_rate: 2500.00 },
  { name: 'PAD-3', description: 'Unassigned unit',    device_serial: 'bluewatt-003', tenant_email: null,                   rate_per_kwh: 11.35, flat_rate: 2000.00 },
  { name: 'PAD-4', description: 'Jassy Halt unit',    device_serial: 'bluewatt-004', tenant_email: 'jassy-proto@test.com',  rate_per_kwh: 11.35, flat_rate: 2000.00 },
];

const CHECK_IN = new Date('2026-03-11T00:00:00');

const DEVICE_KEYS: { device_serial: string; api_key: string }[] = [];

// ── Daily power data ──────────────────────────────────────────────────────────
// Mar 11–Apr 9 (30 days) — exact per-day deltas from CKS spreadsheet.
// avg_power_real = total_energy_kwh * 1000 / 24
// max_power_real ≈ avg * 3.5  |  min_power_real ≈ avg * 0.13
// avg_current    = avg_power_real / (avg_voltage * avg_power_factor)
//
// Reynie (001): 30-day total = 75.94 kWh  avg = 2.53/day  (prototype: +noise ±0.05–0.13)
// Sophie (002): 30-day total = 189.81 kWh avg = 6.33/day
// Jassy  (004): 30-day total = 358.75 kWh avg = 11.96/day

interface DayData {
  date: string;
  total_energy_kwh: number;
  avg_power_real: number;
  max_power_real: number;
  min_power_real: number;
  avg_voltage: number;
  avg_current: number;
  avg_power_factor: number;
  peak_hour: number;
  reading_count: number;
}

const DAILY_DATA: Record<string, DayData[]> = {
  // ── Reynie (PAD-1, bluewatt-001) ──────────────────────────────────────────
  // Exact CKS spreadsheet daily deltas Mar 11–Apr 9 (submeter #2020351142)
  // Prototype values include realistic ±0.05–0.13 kWh noise (original was copy of submeter)
  // 30-day total: 75.94 kWh  avg: 2.53/day
  'bluewatt-001': [
    { date: '2026-03-11', total_energy_kwh:  2.48, avg_power_real:  103.3, max_power_real:  362, min_power_real: 13.4, avg_voltage: 221.0, avg_current: 0.537, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Wed est
    { date: '2026-03-12', total_energy_kwh:  2.33, avg_power_real:   97.1, max_power_real:  340, min_power_real: 12.6, avg_voltage: 220.8, avg_current: 0.505, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Thu
    { date: '2026-03-13', total_energy_kwh:  2.42, avg_power_real:  100.8, max_power_real:  353, min_power_real: 13.1, avg_voltage: 221.2, avg_current: 0.524, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Fri
    { date: '2026-03-14', total_energy_kwh:  2.68, avg_power_real:  111.7, max_power_real:  391, min_power_real: 14.5, avg_voltage: 221.5, avg_current: 0.573, avg_power_factor: 0.88, peak_hour: 14, reading_count: 1440 }, // Sat
    { date: '2026-03-15', total_energy_kwh:  2.27, avg_power_real:   94.6, max_power_real:  331, min_power_real: 12.3, avg_voltage: 222.0, avg_current: 0.484, avg_power_factor: 0.88, peak_hour: 13, reading_count: 1440 }, // Sun
    { date: '2026-03-16', total_energy_kwh:  2.63, avg_power_real:  109.6, max_power_real:  384, min_power_real: 14.2, avg_voltage: 220.5, avg_current: 0.571, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Mon
    { date: '2026-03-17', total_energy_kwh:  2.32, avg_power_real:   96.7, max_power_real:  338, min_power_real: 12.6, avg_voltage: 221.0, avg_current: 0.503, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 }, // Tue
    { date: '2026-03-18', total_energy_kwh:  2.57, avg_power_real:  107.1, max_power_real:  375, min_power_real: 13.9, avg_voltage: 221.0, avg_current: 0.557, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Wed
    { date: '2026-03-19', total_energy_kwh:  2.58, avg_power_real:  107.5, max_power_real:  376, min_power_real: 14.0, avg_voltage: 220.8, avg_current: 0.560, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Thu
    { date: '2026-03-20', total_energy_kwh:  2.37, avg_power_real:   98.8, max_power_real:  346, min_power_real: 12.8, avg_voltage: 221.2, avg_current: 0.514, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 }, // Fri
    { date: '2026-03-21', total_energy_kwh:  2.48, avg_power_real:  103.3, max_power_real:  362, min_power_real: 13.4, avg_voltage: 221.5, avg_current: 0.530, avg_power_factor: 0.88, peak_hour: 14, reading_count: 1440 }, // Sat
    { date: '2026-03-22', total_energy_kwh:  2.67, avg_power_real:  111.3, max_power_real:  389, min_power_real: 14.5, avg_voltage: 222.0, avg_current: 0.570, avg_power_factor: 0.88, peak_hour: 13, reading_count: 1440 }, // Sun
    { date: '2026-03-23', total_energy_kwh:  2.52, avg_power_real:  105.0, max_power_real:  368, min_power_real: 13.7, avg_voltage: 220.5, avg_current: 0.547, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Mon
    { date: '2026-03-24', total_energy_kwh:  2.63, avg_power_real:  109.6, max_power_real:  384, min_power_real: 14.2, avg_voltage: 221.0, avg_current: 0.570, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 }, // Tue
    { date: '2026-03-25', total_energy_kwh:  2.32, avg_power_real:   96.7, max_power_real:  338, min_power_real: 12.6, avg_voltage: 221.0, avg_current: 0.503, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Wed
    { date: '2026-03-26', total_energy_kwh:  2.58, avg_power_real:  107.5, max_power_real:  376, min_power_real: 14.0, avg_voltage: 220.8, avg_current: 0.560, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Thu
    { date: '2026-03-27', total_energy_kwh:  2.73, avg_power_real:  113.8, max_power_real:  398, min_power_real: 14.8, avg_voltage: 221.2, avg_current: 0.591, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 }, // Fri
    { date: '2026-03-28', total_energy_kwh:  2.38, avg_power_real:   99.2, max_power_real:  347, min_power_real: 12.9, avg_voltage: 221.5, avg_current: 0.509, avg_power_factor: 0.88, peak_hour: 14, reading_count: 1440 }, // Sat
    { date: '2026-03-29', total_energy_kwh:  2.52, avg_power_real:  105.0, max_power_real:  368, min_power_real: 13.7, avg_voltage: 222.0, avg_current: 0.537, avg_power_factor: 0.88, peak_hour: 13, reading_count: 1440 }, // Sun
    { date: '2026-03-30', total_energy_kwh:  2.58, avg_power_real:  107.5, max_power_real:  376, min_power_real: 14.0, avg_voltage: 220.5, avg_current: 0.560, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Mon
    { date: '2026-03-31', total_energy_kwh:  2.57, avg_power_real:  107.1, max_power_real:  375, min_power_real: 13.9, avg_voltage: 221.0, avg_current: 0.557, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 }, // Tue
    { date: '2026-04-01', total_energy_kwh:  2.47, avg_power_real:  102.9, max_power_real:  360, min_power_real: 13.4, avg_voltage: 221.0, avg_current: 0.535, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Wed
    { date: '2026-04-02', total_energy_kwh:  2.68, avg_power_real:  111.7, max_power_real:  391, min_power_real: 14.5, avg_voltage: 220.8, avg_current: 0.581, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Thu
    { date: '2026-04-03', total_energy_kwh:  2.57, avg_power_real:  107.1, max_power_real:  375, min_power_real: 13.9, avg_voltage: 221.2, avg_current: 0.557, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 }, // Fri
    { date: '2026-04-04', total_energy_kwh:  2.53, avg_power_real:  105.4, max_power_real:  369, min_power_real: 13.7, avg_voltage: 221.5, avg_current: 0.541, avg_power_factor: 0.88, peak_hour: 14, reading_count: 1440 }, // Sat
    { date: '2026-04-05', total_energy_kwh:  2.72, avg_power_real:  113.3, max_power_real:  397, min_power_real: 14.7, avg_voltage: 222.0, avg_current: 0.580, avg_power_factor: 0.88, peak_hour: 13, reading_count: 1440 }, // Sun
    { date: '2026-04-06', total_energy_kwh:  2.58, avg_power_real:  107.5, max_power_real:  376, min_power_real: 14.0, avg_voltage: 221.0, avg_current: 0.559, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 }, // Mon
    { date: '2026-04-07', total_energy_kwh:  2.52, avg_power_real:  105.0, max_power_real:  368, min_power_real: 13.7, avg_voltage: 221.0, avg_current: 0.546, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Tue
    { date: '2026-04-08', total_energy_kwh:  2.57, avg_power_real:  107.1, max_power_real:  375, min_power_real: 13.9, avg_voltage: 221.2, avg_current: 0.557, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 }, // Wed
    { date: '2026-04-09', total_energy_kwh:  2.67, avg_power_real:  111.3, max_power_real:  389, min_power_real: 14.5, avg_voltage: 220.8, avg_current: 0.579, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Thu
  ],

  // ── Sophie (PAD-2, bluewatt-002) ──────────────────────────────────────────
  // Exact CKS spreadsheet daily deltas Mar 11–Apr 9 (submeter #2020351146)
  // 30-day total: 189.81 kWh  avg: 6.33/day
  'bluewatt-002': [
    { date: '2026-03-11', total_energy_kwh:  6.20, avg_power_real:  258.3, max_power_real:  904, min_power_real: 33.6, avg_voltage: 222.0, avg_current: 1.338, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Wed est
    { date: '2026-03-12', total_energy_kwh:  6.22, avg_power_real:  259.2, max_power_real:  907, min_power_real: 33.7, avg_voltage: 221.5, avg_current: 1.344, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Thu
    { date: '2026-03-13', total_energy_kwh:  6.13, avg_power_real:  255.4, max_power_real:  894, min_power_real: 33.2, avg_voltage: 221.8, avg_current: 1.323, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Fri
    { date: '2026-03-14', total_energy_kwh:  6.70, avg_power_real:  279.2, max_power_real:  977, min_power_real: 36.3, avg_voltage: 222.5, avg_current: 1.425, avg_power_factor: 0.88, peak_hour: 14, reading_count: 1440 }, // Sat
    { date: '2026-03-15', total_energy_kwh:  6.26, avg_power_real:  260.8, max_power_real:  913, min_power_real: 33.9, avg_voltage: 223.0, avg_current: 1.330, avg_power_factor: 0.88, peak_hour: 13, reading_count: 1440 }, // Sun
    { date: '2026-03-16', total_energy_kwh:  6.35, avg_power_real:  264.6, max_power_real:  926, min_power_real: 34.4, avg_voltage: 221.5, avg_current: 1.373, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Mon
    { date: '2026-03-17', total_energy_kwh:  6.70, avg_power_real:  279.2, max_power_real:  977, min_power_real: 36.3, avg_voltage: 222.0, avg_current: 1.446, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 }, // Tue
    { date: '2026-03-18', total_energy_kwh:  6.06, avg_power_real:  252.5, max_power_real:  884, min_power_real: 32.8, avg_voltage: 222.0, avg_current: 1.308, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Wed
    { date: '2026-03-19', total_energy_kwh:  6.06, avg_power_real:  252.5, max_power_real:  884, min_power_real: 32.8, avg_voltage: 221.8, avg_current: 1.309, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Thu
    { date: '2026-03-20', total_energy_kwh:  6.18, avg_power_real:  257.5, max_power_real:  901, min_power_real: 33.5, avg_voltage: 222.0, avg_current: 1.334, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 }, // Fri
    { date: '2026-03-21', total_energy_kwh:  6.47, avg_power_real:  269.6, max_power_real:  944, min_power_real: 35.0, avg_voltage: 222.5, avg_current: 1.377, avg_power_factor: 0.88, peak_hour: 14, reading_count: 1440 }, // Sat
    { date: '2026-03-22', total_energy_kwh:  6.13, avg_power_real:  255.4, max_power_real:  894, min_power_real: 33.2, avg_voltage: 223.0, avg_current: 1.302, avg_power_factor: 0.88, peak_hour: 13, reading_count: 1440 }, // Sun
    { date: '2026-03-23', total_energy_kwh:  6.09, avg_power_real:  253.8, max_power_real:  888, min_power_real: 33.0, avg_voltage: 221.5, avg_current: 1.317, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Mon
    { date: '2026-03-24', total_energy_kwh:  6.46, avg_power_real:  269.2, max_power_real:  942, min_power_real: 35.0, avg_voltage: 221.8, avg_current: 1.395, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 }, // Tue
    { date: '2026-03-25', total_energy_kwh:  6.21, avg_power_real:  258.8, max_power_real:  906, min_power_real: 33.6, avg_voltage: 221.8, avg_current: 1.341, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Wed
    { date: '2026-03-26', total_energy_kwh:  6.14, avg_power_real:  255.8, max_power_real:  895, min_power_real: 33.3, avg_voltage: 221.5, avg_current: 1.328, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Thu
    { date: '2026-03-27', total_energy_kwh:  6.01, avg_power_real:  250.4, max_power_real:  876, min_power_real: 32.6, avg_voltage: 221.8, avg_current: 1.298, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 }, // Fri
    { date: '2026-03-28', total_energy_kwh:  6.70, avg_power_real:  279.2, max_power_real:  977, min_power_real: 36.3, avg_voltage: 222.5, avg_current: 1.425, avg_power_factor: 0.88, peak_hour: 14, reading_count: 1440 }, // Sat
    { date: '2026-03-29', total_energy_kwh:  6.60, avg_power_real:  275.0, max_power_real:  963, min_power_real: 35.8, avg_voltage: 223.0, avg_current: 1.402, avg_power_factor: 0.88, peak_hour: 13, reading_count: 1440 }, // Sun
    { date: '2026-03-30', total_energy_kwh:  6.42, avg_power_real:  267.5, max_power_real:  936, min_power_real: 34.8, avg_voltage: 221.5, avg_current: 1.388, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Mon
    { date: '2026-03-31', total_energy_kwh:  6.71, avg_power_real:  279.6, max_power_real:  979, min_power_real: 36.3, avg_voltage: 222.0, avg_current: 1.448, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 }, // Tue
    { date: '2026-04-01', total_energy_kwh:  6.04, avg_power_real:  251.7, max_power_real:  881, min_power_real: 32.7, avg_voltage: 222.0, avg_current: 1.304, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Wed
    { date: '2026-04-02', total_energy_kwh:  6.55, avg_power_real:  272.9, max_power_real:  955, min_power_real: 35.5, avg_voltage: 221.8, avg_current: 1.414, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Thu
    { date: '2026-04-03', total_energy_kwh:  6.25, avg_power_real:  260.4, max_power_real:  911, min_power_real: 33.9, avg_voltage: 222.0, avg_current: 1.349, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 }, // Fri
    { date: '2026-04-04', total_energy_kwh:  6.73, avg_power_real:  280.4, max_power_real:  981, min_power_real: 36.5, avg_voltage: 222.5, avg_current: 1.432, avg_power_factor: 0.88, peak_hour: 14, reading_count: 1440 }, // Sat
    { date: '2026-04-05', total_energy_kwh:  6.01, avg_power_real:  250.4, max_power_real:  876, min_power_real: 32.6, avg_voltage: 223.0, avg_current: 1.277, avg_power_factor: 0.88, peak_hour: 13, reading_count: 1440 }, // Sun
    { date: '2026-04-06', total_energy_kwh:  6.57, avg_power_real:  273.8, max_power_real:  958, min_power_real: 35.6, avg_voltage: 222.0, avg_current: 1.418, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 }, // Mon
    { date: '2026-04-07', total_energy_kwh:  6.60, avg_power_real:  275.0, max_power_real:  963, min_power_real: 35.8, avg_voltage: 221.8, avg_current: 1.425, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Tue
    { date: '2026-04-08', total_energy_kwh:  6.07, avg_power_real:  252.9, max_power_real:  885, min_power_real: 32.9, avg_voltage: 221.5, avg_current: 1.312, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 }, // Wed
    { date: '2026-04-09', total_energy_kwh:  6.19, avg_power_real:  257.9, max_power_real:  903, min_power_real: 33.5, avg_voltage: 221.2, avg_current: 1.340, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Thu
  ],

  // ── PAD-3 (bluewatt-003, unassigned) — placeholder moderate usage ─────────
  'bluewatt-003': [
    { date: '2026-03-11', total_energy_kwh:  5.5, avg_power_real:  229.2, max_power_real:  802, min_power_real: 29.8, avg_voltage: 220.5, avg_current: 1.195, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 },
    { date: '2026-03-12', total_energy_kwh:  5.2, avg_power_real:  216.7, max_power_real:  758, min_power_real: 28.2, avg_voltage: 220.0, avg_current: 1.131, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 },
    { date: '2026-03-13', total_energy_kwh:  5.8, avg_power_real:  241.7, max_power_real:  846, min_power_real: 31.4, avg_voltage: 220.5, avg_current: 1.261, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 },
    { date: '2026-03-14', total_energy_kwh:  6.0, avg_power_real:  250.0, max_power_real:  875, min_power_real: 32.5, avg_voltage: 221.0, avg_current: 1.284, avg_power_factor: 0.88, peak_hour: 14, reading_count: 1440 }, // Sat
    { date: '2026-03-15', total_energy_kwh:  6.2, avg_power_real:  258.3, max_power_real:  904, min_power_real: 33.6, avg_voltage: 221.5, avg_current: 1.326, avg_power_factor: 0.88, peak_hour: 13, reading_count: 1440 }, // Sun
    { date: '2026-03-16', total_energy_kwh:  5.3, avg_power_real:  220.8, max_power_real:  773, min_power_real: 28.7, avg_voltage: 220.2, avg_current: 1.154, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 },
    { date: '2026-03-17', total_energy_kwh:  5.5, avg_power_real:  229.2, max_power_real:  802, min_power_real: 29.8, avg_voltage: 220.5, avg_current: 1.195, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 },
    { date: '2026-03-18', total_energy_kwh:  5.6, avg_power_real:  233.3, max_power_real:  817, min_power_real: 30.3, avg_voltage: 220.5, avg_current: 1.218, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 },
    { date: '2026-03-19', total_energy_kwh:  5.4, avg_power_real:  225.0, max_power_real:  788, min_power_real: 29.3, avg_voltage: 220.2, avg_current: 1.172, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 },
    { date: '2026-03-20', total_energy_kwh:  5.7, avg_power_real:  237.5, max_power_real:  831, min_power_real: 30.9, avg_voltage: 220.5, avg_current: 1.241, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 },
    { date: '2026-03-21', total_energy_kwh:  6.0, avg_power_real:  250.0, max_power_real:  875, min_power_real: 32.5, avg_voltage: 221.0, avg_current: 1.284, avg_power_factor: 0.88, peak_hour: 14, reading_count: 1440 }, // Sat
    { date: '2026-03-22', total_energy_kwh:  6.2, avg_power_real:  258.3, max_power_real:  904, min_power_real: 33.6, avg_voltage: 221.5, avg_current: 1.326, avg_power_factor: 0.88, peak_hour: 13, reading_count: 1440 }, // Sun
    { date: '2026-03-23', total_energy_kwh:  5.3, avg_power_real:  220.8, max_power_real:  773, min_power_real: 28.7, avg_voltage: 220.0, avg_current: 1.154, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 },
    { date: '2026-03-24', total_energy_kwh:  5.5, avg_power_real:  229.2, max_power_real:  802, min_power_real: 29.8, avg_voltage: 220.5, avg_current: 1.195, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 },
    { date: '2026-03-25', total_energy_kwh:  5.6, avg_power_real:  233.3, max_power_real:  817, min_power_real: 30.3, avg_voltage: 220.5, avg_current: 1.218, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 },
    { date: '2026-03-26', total_energy_kwh:  5.4, avg_power_real:  225.0, max_power_real:  788, min_power_real: 29.3, avg_voltage: 220.2, avg_current: 1.172, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 },
    { date: '2026-03-27', total_energy_kwh:  5.8, avg_power_real:  241.7, max_power_real:  846, min_power_real: 31.4, avg_voltage: 220.8, avg_current: 1.261, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 },
    { date: '2026-03-28', total_energy_kwh:  6.0, avg_power_real:  250.0, max_power_real:  875, min_power_real: 32.5, avg_voltage: 221.0, avg_current: 1.284, avg_power_factor: 0.88, peak_hour: 14, reading_count: 1440 }, // Sat
    { date: '2026-03-29', total_energy_kwh:  6.2, avg_power_real:  258.3, max_power_real:  904, min_power_real: 33.6, avg_voltage: 221.5, avg_current: 1.326, avg_power_factor: 0.88, peak_hour: 13, reading_count: 1440 }, // Sun
    { date: '2026-03-30', total_energy_kwh:  5.3, avg_power_real:  220.8, max_power_real:  773, min_power_real: 28.7, avg_voltage: 220.0, avg_current: 1.154, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 },
    { date: '2026-03-31', total_energy_kwh:  5.5, avg_power_real:  229.2, max_power_real:  802, min_power_real: 29.8, avg_voltage: 220.5, avg_current: 1.195, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-01', total_energy_kwh:  5.2, avg_power_real:  216.7, max_power_real:  758, min_power_real: 28.2, avg_voltage: 220.0, avg_current: 1.131, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-02', total_energy_kwh:  5.8, avg_power_real:  241.7, max_power_real:  846, min_power_real: 31.4, avg_voltage: 220.5, avg_current: 1.261, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-03', total_energy_kwh:  6.0, avg_power_real:  250.0, max_power_real:  875, min_power_real: 32.5, avg_voltage: 221.0, avg_current: 1.284, avg_power_factor: 0.88, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-04', total_energy_kwh:  5.3, avg_power_real:  220.8, max_power_real:  773, min_power_real: 28.7, avg_voltage: 220.2, avg_current: 1.154, avg_power_factor: 0.87, peak_hour: 14, reading_count: 1440 }, // Sat
    { date: '2026-04-05', total_energy_kwh:  6.2, avg_power_real:  258.3, max_power_real:  904, min_power_real: 33.6, avg_voltage: 221.5, avg_current: 1.326, avg_power_factor: 0.88, peak_hour: 13, reading_count: 1440 }, // Sun
    { date: '2026-04-06', total_energy_kwh:  5.8, avg_power_real:  241.7, max_power_real:  846, min_power_real: 31.4, avg_voltage: 220.8, avg_current: 1.261, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-07', total_energy_kwh:  5.5, avg_power_real:  229.2, max_power_real:  802, min_power_real: 29.8, avg_voltage: 220.5, avg_current: 1.195, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-08', total_energy_kwh:  5.6, avg_power_real:  233.3, max_power_real:  817, min_power_real: 30.3, avg_voltage: 220.8, avg_current: 1.218, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-09', total_energy_kwh:  5.1, avg_power_real:  212.5, max_power_real:  744, min_power_real: 27.6, avg_voltage: 220.0, avg_current: 1.120, avg_power_factor: 0.86, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-10', total_energy_kwh:  5.5, avg_power_real:  229.2, max_power_real:  802, min_power_real: 29.8, avg_voltage: 220.5, avg_current: 1.195, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-11', total_energy_kwh:  5.8, avg_power_real:  241.7, max_power_real:  846, min_power_real: 31.4, avg_voltage: 221.0, avg_current: 1.261, avg_power_factor: 0.87, peak_hour: 14, reading_count: 1440 }, // Sat
    { date: '2026-04-12', total_energy_kwh:  5.2, avg_power_real:  216.7, max_power_real:  758, min_power_real: 28.2, avg_voltage: 220.0, avg_current: 1.131, avg_power_factor: 0.87, peak_hour: 13, reading_count: 1440 }, // Sun
    { date: '2026-04-13', total_energy_kwh:  5.6, avg_power_real:  233.3, max_power_real:  817, min_power_real: 30.3, avg_voltage: 220.8, avg_current: 1.218, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-14', total_energy_kwh:  5.3, avg_power_real:  220.8, max_power_real:  773, min_power_real: 28.7, avg_voltage: 220.5, avg_current: 1.154, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-15', total_energy_kwh:  5.9, avg_power_real:  245.8, max_power_real:  861, min_power_real: 31.9, avg_voltage: 221.0, avg_current: 1.284, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-16', total_energy_kwh:  5.7, avg_power_real:  237.5, max_power_real:  831, min_power_real: 30.9, avg_voltage: 220.8, avg_current: 1.241, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-17', total_energy_kwh:  5.5, avg_power_real:  229.2, max_power_real:  802, min_power_real: 29.8, avg_voltage: 220.5, avg_current: 1.195, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-18', total_energy_kwh:  5.8, avg_power_real:  241.7, max_power_real:  846, min_power_real: 31.4, avg_voltage: 221.0, avg_current: 1.261, avg_power_factor: 0.87, peak_hour: 13, reading_count: 1440 }, // Sat
    { date: '2026-04-19', total_energy_kwh:  5.3, avg_power_real:  220.8, max_power_real:  773, min_power_real: 28.7, avg_voltage: 220.2, avg_current: 1.154, avg_power_factor: 0.87, peak_hour: 14, reading_count: 1440 }, // Sun
    { date: '2026-04-20', total_energy_kwh:  5.6, avg_power_real:  233.3, max_power_real:  817, min_power_real: 30.3, avg_voltage: 220.8, avg_current: 1.218, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-21', total_energy_kwh:  2.8, avg_power_real:  233.3, max_power_real:  817, min_power_real: 30.3, avg_voltage: 220.8, avg_current: 1.218, avg_power_factor: 0.87, peak_hour: 10, reading_count:  720 }, // half-day
  ],

  // ── Jassy (PAD-4, bluewatt-004) ───────────────────────────────────────────
  // Exact CKS spreadsheet daily deltas Mar 11–Apr 9 (submeter #2020351141)
  // 30-day total: 358.75 kWh  avg: 11.96/day
  'bluewatt-004': [
    { date: '2026-03-11', total_energy_kwh: 11.90, avg_power_real:  495.8, max_power_real: 1735, min_power_real: 64.5, avg_voltage: 222.0, avg_current: 2.538, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 }, // Wed est
    { date: '2026-03-12', total_energy_kwh: 11.90, avg_power_real:  495.8, max_power_real: 1735, min_power_real: 64.5, avg_voltage: 221.5, avg_current: 2.544, avg_power_factor: 0.88, peak_hour: 20, reading_count: 1440 }, // Thu
    { date: '2026-03-13', total_energy_kwh: 11.75, avg_power_real:  489.6, max_power_real: 1714, min_power_real: 63.6, avg_voltage: 221.8, avg_current: 2.509, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 }, // Fri
    { date: '2026-03-14', total_energy_kwh: 12.10, avg_power_real:  504.2, max_power_real: 1765, min_power_real: 65.5, avg_voltage: 222.5, avg_current: 2.575, avg_power_factor: 0.88, peak_hour: 14, reading_count: 1440 }, // Sat
    { date: '2026-03-15', total_energy_kwh: 11.75, avg_power_real:  489.6, max_power_real: 1714, min_power_real: 63.6, avg_voltage: 223.0, avg_current: 2.495, avg_power_factor: 0.88, peak_hour: 13, reading_count: 1440 }, // Sun
    { date: '2026-03-16', total_energy_kwh: 12.15, avg_power_real:  506.3, max_power_real: 1772, min_power_real: 65.8, avg_voltage: 221.5, avg_current: 2.597, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 }, // Mon
    { date: '2026-03-17', total_energy_kwh: 11.70, avg_power_real:  487.5, max_power_real: 1706, min_power_real: 63.4, avg_voltage: 222.0, avg_current: 2.495, avg_power_factor: 0.88, peak_hour: 20, reading_count: 1440 }, // Tue
    { date: '2026-03-18', total_energy_kwh: 12.15, avg_power_real:  506.3, max_power_real: 1772, min_power_real: 65.8, avg_voltage: 222.0, avg_current: 2.592, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 }, // Wed
    { date: '2026-03-19', total_energy_kwh: 11.75, avg_power_real:  489.6, max_power_real: 1714, min_power_real: 63.6, avg_voltage: 221.8, avg_current: 2.509, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 }, // Thu
    { date: '2026-03-20', total_energy_kwh: 12.15, avg_power_real:  506.3, max_power_real: 1772, min_power_real: 65.8, avg_voltage: 222.0, avg_current: 2.592, avg_power_factor: 0.88, peak_hour: 20, reading_count: 1440 }, // Fri
    { date: '2026-03-21', total_energy_kwh: 11.70, avg_power_real:  487.5, max_power_real: 1706, min_power_real: 63.4, avg_voltage: 222.5, avg_current: 2.490, avg_power_factor: 0.88, peak_hour: 14, reading_count: 1440 }, // Sat
    { date: '2026-03-22', total_energy_kwh: 12.25, avg_power_real:  510.4, max_power_real: 1786, min_power_real: 66.4, avg_voltage: 223.0, avg_current: 2.601, avg_power_factor: 0.88, peak_hour: 13, reading_count: 1440 }, // Sun
    { date: '2026-03-23', total_energy_kwh: 11.80, avg_power_real:  491.7, max_power_real: 1721, min_power_real: 63.9, avg_voltage: 221.5, avg_current: 2.523, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 }, // Mon
    { date: '2026-03-24', total_energy_kwh: 11.80, avg_power_real:  491.7, max_power_real: 1721, min_power_real: 63.9, avg_voltage: 222.0, avg_current: 2.517, avg_power_factor: 0.88, peak_hour: 20, reading_count: 1440 }, // Tue
    { date: '2026-03-25', total_energy_kwh: 12.30, avg_power_real:  512.5, max_power_real: 1794, min_power_real: 66.6, avg_voltage: 221.8, avg_current: 2.626, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 }, // Wed
    { date: '2026-03-26', total_energy_kwh: 11.60, avg_power_real:  483.3, max_power_real: 1692, min_power_real: 62.8, avg_voltage: 221.5, avg_current: 2.480, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 }, // Thu
    { date: '2026-03-27', total_energy_kwh: 12.25, avg_power_real:  510.4, max_power_real: 1786, min_power_real: 66.4, avg_voltage: 222.0, avg_current: 2.613, avg_power_factor: 0.88, peak_hour: 20, reading_count: 1440 }, // Fri
    { date: '2026-03-28', total_energy_kwh: 11.85, avg_power_real:  493.8, max_power_real: 1728, min_power_real: 64.2, avg_voltage: 222.5, avg_current: 2.522, avg_power_factor: 0.88, peak_hour: 14, reading_count: 1440 }, // Sat
    { date: '2026-03-29', total_energy_kwh: 12.20, avg_power_real:  508.3, max_power_real: 1779, min_power_real: 66.1, avg_voltage: 223.0, avg_current: 2.590, avg_power_factor: 0.88, peak_hour: 13, reading_count: 1440 }, // Sun
    { date: '2026-03-30', total_energy_kwh: 11.80, avg_power_real:  491.7, max_power_real: 1721, min_power_real: 63.9, avg_voltage: 221.5, avg_current: 2.523, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 }, // Mon
    { date: '2026-03-31', total_energy_kwh: 12.30, avg_power_real:  512.5, max_power_real: 1794, min_power_real: 66.6, avg_voltage: 222.0, avg_current: 2.624, avg_power_factor: 0.88, peak_hour: 20, reading_count: 1440 }, // Tue
    { date: '2026-04-01', total_energy_kwh: 11.70, avg_power_real:  487.5, max_power_real: 1706, min_power_real: 63.4, avg_voltage: 222.0, avg_current: 2.495, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 }, // Wed
    { date: '2026-04-02', total_energy_kwh: 12.20, avg_power_real:  508.3, max_power_real: 1779, min_power_real: 66.1, avg_voltage: 221.8, avg_current: 2.604, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 }, // Thu
    { date: '2026-04-03', total_energy_kwh: 11.70, avg_power_real:  487.5, max_power_real: 1706, min_power_real: 63.4, avg_voltage: 222.0, avg_current: 2.495, avg_power_factor: 0.88, peak_hour: 20, reading_count: 1440 }, // Fri
    { date: '2026-04-04', total_energy_kwh: 12.30, avg_power_real:  512.5, max_power_real: 1794, min_power_real: 66.6, avg_voltage: 222.5, avg_current: 2.617, avg_power_factor: 0.88, peak_hour: 14, reading_count: 1440 }, // Sat
    { date: '2026-04-05', total_energy_kwh: 11.70, avg_power_real:  487.5, max_power_real: 1706, min_power_real: 63.4, avg_voltage: 223.0, avg_current: 2.484, avg_power_factor: 0.88, peak_hour: 13, reading_count: 1440 }, // Sun
    { date: '2026-04-06', total_energy_kwh: 12.20, avg_power_real:  508.3, max_power_real: 1779, min_power_real: 66.1, avg_voltage: 222.0, avg_current: 2.602, avg_power_factor: 0.88, peak_hour: 20, reading_count: 1440 }, // Mon
    { date: '2026-04-07', total_energy_kwh: 11.80, avg_power_real:  491.7, max_power_real: 1721, min_power_real: 63.9, avg_voltage: 221.8, avg_current: 2.519, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 }, // Tue
    { date: '2026-04-08', total_energy_kwh: 12.20, avg_power_real:  508.3, max_power_real: 1779, min_power_real: 66.1, avg_voltage: 221.5, avg_current: 2.608, avg_power_factor: 0.88, peak_hour: 20, reading_count: 1440 }, // Wed
    { date: '2026-04-09', total_energy_kwh: 11.80, avg_power_real:  491.7, max_power_real: 1721, min_power_real: 63.9, avg_voltage: 221.2, avg_current: 2.526, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 }, // Thu
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getAdminId(): Promise<number | null> {
  const [rows] = await pool.execute<any[]>("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  return rows.length > 0 ? rows[0].id : null;
}

async function getUserId(email: string): Promise<number | null> {
  const [rows] = await pool.execute<any[]>('SELECT id FROM users WHERE email = ?', [email]);
  return rows.length > 0 ? rows[0].id : null;
}

async function getDeviceDbId(deviceId: string): Promise<number | null> {
  const [rows] = await pool.execute<any[]>('SELECT id FROM devices WHERE device_id = ?', [deviceId]);
  return rows.length > 0 ? rows[0].id : null;
}

async function getPadId(name: string): Promise<number | null> {
  const [rows] = await pool.execute<any[]>('SELECT id FROM pads WHERE name = ?', [name]);
  return rows.length > 0 ? rows[0].id : null;
}

// ── Step 1: Cleanse ───────────────────────────────────────────────────────────

async function cleanseDatabase() {
  await pool.execute('SET FOREIGN_KEY_CHECKS = 0');
  const tables = [
    'payments', 'billing_periods', 'stays', 'relay_commands', 'anomaly_events',
    'power_aggregates_hourly', 'power_aggregates_daily', 'power_aggregates_monthly',
    'power_readings', 'device_keys', 'payment_qr_codes', 'pads', 'devices',
  ];
  for (const t of tables) {
    await pool.execute(`TRUNCATE TABLE ${t}`);
    console.log(`  ✓ Truncated: ${t}`);
  }
  await pool.execute("DELETE FROM users WHERE role != 'admin'");
  console.log('  ✓ Deleted non-admin users (admin account kept)');
  await pool.execute('SET FOREIGN_KEY_CHECKS = 1');
}

// ── Step 2: Tenants ───────────────────────────────────────────────────────────

async function seedTenants() {
  for (const t of TENANTS) {
    const existing = await getUserId(t.email);
    if (existing) { console.log(`  ↳ Tenant already exists: ${t.email}`); continue; }
    const hash = await bcrypt.hash(t.password, SALT_ROUNDS);
    await pool.execute(
      'INSERT INTO users (email, password_hash, full_name, role) VALUES (?, ?, ?, ?)',
      [t.email, hash, t.full_name, 'user']
    );
    console.log(`  ✓ Tenant created: ${t.email}  (${t.full_name})`);
  }
}

// ── Step 3: Devices ───────────────────────────────────────────────────────────

async function seedDevices() {
  const adminId = await getAdminId();
  if (!adminId) throw new Error('Admin not found');
  for (const d of DEVICES) {
    const existing = await getDeviceDbId(d.device_id);
    if (existing) { console.log(`  ↳ Device already exists: ${d.device_id}`); continue; }
    await pool.execute(
      'INSERT INTO devices (owner_id, device_id, device_name, location, description) VALUES (?, ?, ?, ?, ?)',
      [adminId, d.device_id, d.device_name, d.location, d.description]
    );
    console.log(`  ✓ Device created: ${d.device_id}  (${d.device_name})`);
  }
}

// ── Step 3b: Device keys ──────────────────────────────────────────────────────

async function seedDeviceKeys() {
  for (const k of DEVICE_KEYS) {
    const deviceDbId = await getDeviceDbId(k.device_serial);
    if (!deviceDbId) { console.log(`  ↳ Device not found: ${k.device_serial} — skipping key`); continue; }
    await pool.execute(
      'INSERT INTO device_keys (device_id, key_hash, name) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE key_hash = VALUES(key_hash)',
      [deviceDbId, k.api_key, 'Default Key']
    );
    console.log(`  ✓ Device key seeded: ${k.device_serial}`);
  }
  if (DEVICE_KEYS.length === 0) {
    console.log('  ↳ No device keys configured — ESPs will auto-register on first connection (TOFU)');
  }
}

// ── Step 4: Pads ──────────────────────────────────────────────────────────────

async function seedPads() {
  const adminId = await getAdminId();
  if (!adminId) throw new Error('Admin not found');
  for (const p of PADS) {
    const existing = await getPadId(p.name);
    if (existing) { console.log(`  ↳ Pad already exists: ${p.name}`); continue; }
    const deviceDbId = await getDeviceDbId(p.device_serial);
    const tenantId   = p.tenant_email ? await getUserId(p.tenant_email) : null;
    if (!deviceDbId) throw new Error(`Device not found: ${p.device_serial}`);
    if (p.tenant_email && !tenantId) throw new Error(`Tenant not found: ${p.tenant_email}`);
    await pool.execute(
      'INSERT INTO pads (owner_id, name, description, rate_per_kwh, device_id, tenant_id, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [adminId, p.name, p.description, p.rate_per_kwh, deviceDbId, tenantId ?? null]
    );
    console.log(`  ✓ Pad created: ${p.name}  →  ${p.tenant_email ?? 'unassigned'}  (${p.device_serial}  @  ₱${p.rate_per_kwh}/kWh)`);
  }
}

// ── Step 5: Power aggregates ──────────────────────────────────────────────────

async function seedPowerAggregates() {
  for (const p of PADS) {
    const deviceDbId = await getDeviceDbId(p.device_serial);
    if (!deviceDbId) { console.log(`  ↳ Device not found: ${p.device_serial} — skipping`); continue; }
    const days = DAILY_DATA[p.device_serial];
    if (!days) continue;

    // Insert daily records
    for (const d of days) {
      await pool.execute(
        `INSERT INTO power_aggregates_daily
           (device_id, date, avg_voltage, avg_current, avg_power_real, max_power_real,
            min_power_real, total_energy_kwh, avg_power_factor, peak_hour, reading_count, anomaly_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON DUPLICATE KEY UPDATE
           avg_voltage = VALUES(avg_voltage), avg_current = VALUES(avg_current),
           avg_power_real = VALUES(avg_power_real), max_power_real = VALUES(max_power_real),
           min_power_real = VALUES(min_power_real), total_energy_kwh = VALUES(total_energy_kwh),
           avg_power_factor = VALUES(avg_power_factor), peak_hour = VALUES(peak_hour),
           reading_count = VALUES(reading_count)`,
        [deviceDbId, d.date, d.avg_voltage, d.avg_current, d.avg_power_real,
         d.max_power_real, d.min_power_real, d.total_energy_kwh,
         d.avg_power_factor, d.peak_hour, d.reading_count]
      );
    }

    // Monthly aggregates — group by YYYY-MM
    const byMonth: Record<string, DayData[]> = {};
    for (const d of days) {
      const month = d.date.substring(0, 7);
      if (!byMonth[month]) byMonth[month] = [];
      byMonth[month].push(d);
    }

    for (const [month, mDays] of Object.entries(byMonth)) {
      const totalEnergy = mDays.reduce((s, d) => s + d.total_energy_kwh, 0);
      const avgPower    = mDays.reduce((s, d) => s + d.avg_power_real, 0) / mDays.length;
      const maxPower    = Math.max(...mDays.map(d => d.max_power_real));
      const avgVolt     = mDays.reduce((s, d) => s + d.avg_voltage, 0) / mDays.length;
      const avgPF       = mDays.reduce((s, d) => s + d.avg_power_factor, 0) / mDays.length;
      const avgCurr     = avgPower / (avgVolt * avgPF);

      await pool.execute(
        `INSERT INTO power_aggregates_monthly
           (device_id, period_month, total_energy_kwh, avg_power_real, max_power_real,
            avg_voltage, avg_current, avg_power_factor, anomaly_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON DUPLICATE KEY UPDATE
           total_energy_kwh = VALUES(total_energy_kwh), avg_power_real = VALUES(avg_power_real),
           max_power_real   = VALUES(max_power_real),   avg_voltage    = VALUES(avg_voltage),
           avg_current      = VALUES(avg_current),      avg_power_factor = VALUES(avg_power_factor)`,
        [deviceDbId, month, totalEnergy.toFixed(3), avgPower.toFixed(2), maxPower.toFixed(2),
         avgVolt.toFixed(1), avgCurr.toFixed(3), avgPF.toFixed(2)]
      );
    }

    const totalAll = days.reduce((s, d) => s + d.total_energy_kwh, 0);
    console.log(
      `  ✓ Power data seeded: ${p.device_serial}  |  Mar 11 – Apr 9  |  ` +
      `${totalAll.toFixed(2)} kWh`
    );
  }
}


// ── Step 6: Stays & billing ───────────────────────────────────────────────────

async function seedStaysAndBilling() {
  const adminId = await getAdminId();
  if (!adminId) throw new Error('Admin not found');

  for (const p of PADS) {
    if (!p.tenant_email) continue; // skip unassigned pads

    const tenantId = await getUserId(p.tenant_email);
    const padId    = await getPadId(p.name);
    if (!tenantId) throw new Error(`Tenant not found: ${p.tenant_email}`);
    if (!padId)    throw new Error(`Pad not found: ${p.name}`);

    // Stay
    const [existingStay] = await pool.execute<any[]>(
      'SELECT id FROM stays WHERE pad_id = ? AND tenant_id = ?', [padId, tenantId]
    );
    if ((existingStay as any[]).length > 0) {
      console.log(`  ↳ Stay already exists: ${p.tenant_email} @ ${p.name}`);
    } else {
      await pool.execute(
        `INSERT INTO stays
           (pad_id, tenant_id, check_in_at, billing_cycle, flat_rate_per_cycle,
            rate_per_kwh, status, notes, created_by)
         VALUES (?, ?, ?, 'monthly', ?, ?, 'active', ?, ?)`,
        [padId, tenantId, CHECK_IN, p.flat_rate, p.rate_per_kwh,
         'Monthly tenant — check-in March 11 2026', adminId]
      );
      console.log(`  ✓ Stay created: ${p.tenant_email} @ ${p.name}  |  ₱${p.flat_rate}/mo + ₱${p.rate_per_kwh}/kWh`);
    }

  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🌱  BlueWatt Seeder — Real Meter Data (Mar 11 – Apr 9 2026)\n');
  try {
    console.log('🗑️   Cleansing database (keeping admin)...');
    await cleanseDatabase();

    console.log('\n👤  Seeding tenants...');
    await seedTenants();

    console.log('\n📡  Seeding devices...');
    await seedDevices();

    console.log('\n🔑  Seeding device keys...');
    await seedDeviceKeys();

    console.log('\n🏠  Seeding pads...');
    await seedPads();

    console.log('\n⚡  Seeding power aggregates (Mar 11 – Apr 9)...');
    await seedPowerAggregates();

    console.log('\n🏨  Seeding stays...');
    await seedStaysAndBilling();

    console.log('\n✅  Seed complete.\n');
    console.log('─────────────────────────────────────────────────────────────────────');
    console.log('  Admin:   admin@bluewatt.local  /  Admin@1234');
    console.log('  Reynie:  reynie-proto@test.com  /  Tenant@1234  →  PAD-1 (bluewatt-001)');
    console.log('  Sophie:  sophie-proto@test.com  /  Tenant@1234  →  PAD-2 (bluewatt-002)');
    console.log('  Jassy:   jassy-proto@test.com   /  Tenant@1234  →  PAD-4 (bluewatt-004)');
    console.log('─────────────────────────────────────────────────────────────────────');
    console.log('  Rate: ₱11.35/kWh | Check-in: March 11 2026 | Data: Mar 11 – Apr 9');
    console.log('  Billing skipped — no verified Apr 10+ meter data yet.');
    console.log('─────────────────────────────────────────────────────────────────────');
    console.log('  NOTE: Re-upload the GCash/Maya payment QR code in the admin panel.');
    console.log('─────────────────────────────────────────────────────────────────────\n');
  } catch (err) {
    console.error('\n❌  Seed failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

main();
