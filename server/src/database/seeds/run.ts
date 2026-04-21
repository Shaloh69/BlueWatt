/**
 * BlueWatt Database Seeder — Real Meter Data
 * Run: npm run seed
 *
 * Seeds:
 *  - Cleanses all data, keeps admin account
 *  - 3 real tenants: Reynie (PAD-1), Sophie (PAD-2), Jassy (PAD-4)
 *  - 4 devices (bluewatt-001/002/003/004); PAD-3 unassigned
 *  - Daily power aggregates Mar 31 – Apr 21 from real CKS meter readings
 *  - CKS meter photo anchors:
 *      Reynie PAD-1 (#2020351142): Mar31=3340.0 → Apr10=3416.0 → Apr17=3433.3 kWh
 *      Sophie PAD-2 (#2020351146): Mar31=4515.4 → Apr10=4703.0 → Apr17=4754.0 kWh
 *      Jassy  PAD-4 (#2020351141): Mar31=184.2  → Apr10=542.9  → Apr17=590.0  kWh
 *  - Rate: ₱11.40/kWh | Billing cycle 1: Mar 31 – Apr 17 (due Apr 22)
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
  { name: 'PAD-1', description: 'Reynie Tapnio unit', device_serial: 'bluewatt-001', tenant_email: 'reynie-proto@test.com', rate_per_kwh: 11.40, flat_rate: 2000.00 },
  { name: 'PAD-2', description: 'Sophie Garcia unit', device_serial: 'bluewatt-002', tenant_email: 'sophie-proto@test.com', rate_per_kwh: 11.40, flat_rate: 2500.00 },
  { name: 'PAD-3', description: 'Unassigned unit',    device_serial: 'bluewatt-003', tenant_email: null,                   rate_per_kwh: 11.40, flat_rate: 2000.00 },
  { name: 'PAD-4', description: 'Jassy Halt unit',    device_serial: 'bluewatt-004', tenant_email: 'jassy-proto@test.com',  rate_per_kwh: 11.40, flat_rate: 2000.00 },
];

const CHECK_IN = new Date('2026-03-31T00:00:00');

const DEVICE_KEYS: { device_serial: string; api_key: string }[] = [];

// ── Daily power data ──────────────────────────────────────────────────────────
// Mar 31–Apr 9 and Apr 10–16 intervals verified by CKS meter photos.
// Apr 17–21 extrapolated at same daily rate as Apr 10–16 period.
// Apr 21 = partial day (12 h, reading_count=720).
//
// Reynie (001): Mar31–Apr9 = 76 kWh (7.6/day), Apr10–16 = 17.3 kWh (2.47/day)
// Sophie (002): Mar31–Apr9 = 187.6 kWh (18.76/day), Apr10–16 = 51.0 kWh (7.29/day)
// Jassy  (004): Mar31–Apr9 = 358.7 kWh (35.87/day), Apr10–16 = 47.1 kWh (6.73/day)

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
  // Mar31–Apr9: 76.0 kWh | Apr10–16: 17.3 kWh | Apr17–21: ~2.47/day
  'bluewatt-001': [
    { date: '2026-03-31', total_energy_kwh:  7.5, avg_power_real:  312.5, max_power_real: 1094, min_power_real:  40.6, avg_voltage: 221.0, avg_current: 1.607, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-01', total_energy_kwh:  7.6, avg_power_real:  316.7, max_power_real: 1108, min_power_real:  41.2, avg_voltage: 221.5, avg_current: 1.628, avg_power_factor: 0.88, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-02', total_energy_kwh:  7.2, avg_power_real:  300.0, max_power_real: 1050, min_power_real:  39.0, avg_voltage: 220.8, avg_current: 1.562, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-03', total_energy_kwh:  7.8, avg_power_real:  325.0, max_power_real: 1138, min_power_real:  42.3, avg_voltage: 222.0, avg_current: 1.665, avg_power_factor: 0.88, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-04', total_energy_kwh:  7.5, avg_power_real:  312.5, max_power_real: 1094, min_power_real:  40.6, avg_voltage: 221.2, avg_current: 1.600, avg_power_factor: 0.88, peak_hour: 13, reading_count: 1440 }, // Sat
    { date: '2026-04-05', total_energy_kwh:  8.0, avg_power_real:  333.3, max_power_real: 1167, min_power_real:  43.3, avg_voltage: 222.5, avg_current: 1.680, avg_power_factor: 0.89, peak_hour: 14, reading_count: 1440 }, // Sun
    { date: '2026-04-06', total_energy_kwh:  7.8, avg_power_real:  325.0, max_power_real: 1138, min_power_real:  42.3, avg_voltage: 221.8, avg_current: 1.665, avg_power_factor: 0.88, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-07', total_energy_kwh:  7.5, avg_power_real:  312.5, max_power_real: 1094, min_power_real:  40.6, avg_voltage: 221.0, avg_current: 1.607, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-08', total_energy_kwh:  7.7, avg_power_real:  320.8, max_power_real: 1123, min_power_real:  41.7, avg_voltage: 221.6, avg_current: 1.644, avg_power_factor: 0.88, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-09', total_energy_kwh:  7.4, avg_power_real:  308.3, max_power_real: 1079, min_power_real:  40.1, avg_voltage: 221.2, avg_current: 1.603, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 },
    // Apr 10–16: 17.3 kWh verified
    { date: '2026-04-10', total_energy_kwh:  2.5, avg_power_real:  104.2, max_power_real:  365, min_power_real:  13.5, avg_voltage: 220.5, avg_current: 0.544, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-11', total_energy_kwh:  2.3, avg_power_real:   95.8, max_power_real:  335, min_power_real:  12.5, avg_voltage: 220.0, avg_current: 0.507, avg_power_factor: 0.86, peak_hour: 14, reading_count: 1440 }, // Sat
    { date: '2026-04-12', total_energy_kwh:  2.6, avg_power_real:  108.3, max_power_real:  379, min_power_real:  14.1, avg_voltage: 221.0, avg_current: 0.565, avg_power_factor: 0.87, peak_hour: 13, reading_count: 1440 }, // Sun
    { date: '2026-04-13', total_energy_kwh:  2.4, avg_power_real:  100.0, max_power_real:  350, min_power_real:  13.0, avg_voltage: 220.8, avg_current: 0.521, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-14', total_energy_kwh:  2.5, avg_power_real:  104.2, max_power_real:  365, min_power_real:  13.5, avg_voltage: 221.0, avg_current: 0.542, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-15', total_energy_kwh:  2.5, avg_power_real:  104.2, max_power_real:  365, min_power_real:  13.5, avg_voltage: 221.5, avg_current: 0.542, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-16', total_energy_kwh:  2.5, avg_power_real:  104.2, max_power_real:  365, min_power_real:  13.5, avg_voltage: 220.8, avg_current: 0.542, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 },
    // Apr 17–21: extrapolated ~2.47/day
    { date: '2026-04-17', total_energy_kwh:  2.5, avg_power_real:  104.2, max_power_real:  365, min_power_real:  13.5, avg_voltage: 221.0, avg_current: 0.542, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-18', total_energy_kwh:  2.4, avg_power_real:  100.0, max_power_real:  350, min_power_real:  13.0, avg_voltage: 220.5, avg_current: 0.527, avg_power_factor: 0.86, peak_hour: 13, reading_count: 1440 }, // Sat
    { date: '2026-04-19', total_energy_kwh:  2.5, avg_power_real:  104.2, max_power_real:  365, min_power_real:  13.5, avg_voltage: 221.0, avg_current: 0.542, avg_power_factor: 0.87, peak_hour: 14, reading_count: 1440 }, // Sun
    { date: '2026-04-20', total_energy_kwh:  2.4, avg_power_real:  100.0, max_power_real:  350, min_power_real:  13.0, avg_voltage: 220.8, avg_current: 0.521, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-21', total_energy_kwh:  1.2, avg_power_real:  100.0, max_power_real:  350, min_power_real:  13.0, avg_voltage: 220.8, avg_current: 0.521, avg_power_factor: 0.87, peak_hour: 10, reading_count:  720 }, // half day
  ],

  // ── Sophie (PAD-2, bluewatt-002) ──────────────────────────────────────────
  // Mar31–Apr9: 187.6 kWh | Apr10–16: 51.0 kWh | Apr17–21: ~7.29/day
  'bluewatt-002': [
    { date: '2026-03-31', total_energy_kwh: 18.5, avg_power_real:  770.8, max_power_real: 2317, min_power_real: 100.2, avg_voltage: 222.0, avg_current: 3.893, avg_power_factor: 0.89, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-01', total_energy_kwh: 19.0, avg_power_real:  791.7, max_power_real: 2375, min_power_real: 102.9, avg_voltage: 222.5, avg_current: 3.997, avg_power_factor: 0.89, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-02', total_energy_kwh: 18.8, avg_power_real:  783.3, max_power_real: 2350, min_power_real: 101.8, avg_voltage: 222.0, avg_current: 4.013, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-03', total_energy_kwh: 19.5, avg_power_real:  812.5, max_power_real: 2438, min_power_real: 105.6, avg_voltage: 223.0, avg_current: 4.098, avg_power_factor: 0.89, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-04', total_energy_kwh: 18.0, avg_power_real:  750.0, max_power_real: 2250, min_power_real:  97.5, avg_voltage: 221.5, avg_current: 3.851, avg_power_factor: 0.88, peak_hour: 13, reading_count: 1440 }, // Sat
    { date: '2026-04-05', total_energy_kwh: 20.0, avg_power_real:  833.3, max_power_real: 2500, min_power_real: 108.3, avg_voltage: 223.5, avg_current: 4.196, avg_power_factor: 0.89, peak_hour: 14, reading_count: 1440 }, // Sun
    { date: '2026-04-06', total_energy_kwh: 19.5, avg_power_real:  812.5, max_power_real: 2438, min_power_real: 105.6, avg_voltage: 222.8, avg_current: 4.098, avg_power_factor: 0.89, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-07', total_energy_kwh: 18.8, avg_power_real:  783.3, max_power_real: 2350, min_power_real: 101.8, avg_voltage: 222.0, avg_current: 4.013, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-08', total_energy_kwh: 18.0, avg_power_real:  750.0, max_power_real: 2250, min_power_real:  97.5, avg_voltage: 221.5, avg_current: 3.851, avg_power_factor: 0.88, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-09', total_energy_kwh: 17.5, avg_power_real:  729.2, max_power_real: 2188, min_power_real:  94.8, avg_voltage: 221.0, avg_current: 3.751, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 },
    // Apr 10–16: 51.0 kWh verified
    { date: '2026-04-10', total_energy_kwh:  7.2, avg_power_real:  300.0, max_power_real: 1050, min_power_real:  39.0, avg_voltage: 221.0, avg_current: 1.543, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-11', total_energy_kwh:  7.5, avg_power_real:  312.5, max_power_real: 1094, min_power_real:  40.6, avg_voltage: 221.5, avg_current: 1.600, avg_power_factor: 0.88, peak_hour: 14, reading_count: 1440 }, // Sat
    { date: '2026-04-12', total_energy_kwh:  7.0, avg_power_real:  291.7, max_power_real: 1021, min_power_real:  37.9, avg_voltage: 221.0, avg_current: 1.519, avg_power_factor: 0.87, peak_hour: 13, reading_count: 1440 }, // Sun
    { date: '2026-04-13', total_energy_kwh:  7.3, avg_power_real:  304.2, max_power_real: 1065, min_power_real:  39.5, avg_voltage: 221.5, avg_current: 1.558, avg_power_factor: 0.88, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-14', total_energy_kwh:  7.5, avg_power_real:  312.5, max_power_real: 1094, min_power_real:  40.6, avg_voltage: 222.0, avg_current: 1.600, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-15', total_energy_kwh:  7.2, avg_power_real:  300.0, max_power_real: 1050, min_power_real:  39.0, avg_voltage: 221.5, avg_current: 1.543, avg_power_factor: 0.88, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-16', total_energy_kwh:  7.3, avg_power_real:  304.2, max_power_real: 1065, min_power_real:  39.5, avg_voltage: 221.0, avg_current: 1.558, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 },
    // Apr 17–21: extrapolated ~7.29/day
    { date: '2026-04-17', total_energy_kwh:  7.3, avg_power_real:  304.2, max_power_real: 1065, min_power_real:  39.5, avg_voltage: 221.5, avg_current: 1.558, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-18', total_energy_kwh:  7.1, avg_power_real:  295.8, max_power_real: 1035, min_power_real:  38.5, avg_voltage: 221.0, avg_current: 1.539, avg_power_factor: 0.87, peak_hour: 13, reading_count: 1440 }, // Sat
    { date: '2026-04-19', total_energy_kwh:  7.5, avg_power_real:  312.5, max_power_real: 1094, min_power_real:  40.6, avg_voltage: 221.5, avg_current: 1.600, avg_power_factor: 0.88, peak_hour: 14, reading_count: 1440 }, // Sun
    { date: '2026-04-20', total_energy_kwh:  7.2, avg_power_real:  300.0, max_power_real: 1050, min_power_real:  39.0, avg_voltage: 221.0, avg_current: 1.543, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-21', total_energy_kwh:  3.6, avg_power_real:  300.0, max_power_real: 1050, min_power_real:  39.0, avg_voltage: 221.0, avg_current: 1.543, avg_power_factor: 0.88, peak_hour: 10, reading_count:  720 }, // half day
  ],

  // ── PAD-3 (bluewatt-003, unassigned) — placeholder moderate usage ─────────
  'bluewatt-003': [
    { date: '2026-03-31', total_energy_kwh:  5.5, avg_power_real:  229.2, max_power_real:  802, min_power_real:  29.8, avg_voltage: 220.5, avg_current: 1.195, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-01', total_energy_kwh:  5.2, avg_power_real:  216.7, max_power_real:  758, min_power_real:  28.2, avg_voltage: 220.0, avg_current: 1.131, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-02', total_energy_kwh:  5.8, avg_power_real:  241.7, max_power_real:  846, min_power_real:  31.4, avg_voltage: 220.5, avg_current: 1.261, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-03', total_energy_kwh:  6.0, avg_power_real:  250.0, max_power_real:  875, min_power_real:  32.5, avg_voltage: 221.0, avg_current: 1.284, avg_power_factor: 0.88, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-04', total_energy_kwh:  5.3, avg_power_real:  220.8, max_power_real:  773, min_power_real:  28.7, avg_voltage: 220.2, avg_current: 1.154, avg_power_factor: 0.87, peak_hour: 13, reading_count: 1440 }, // Sat
    { date: '2026-04-05', total_energy_kwh:  6.2, avg_power_real:  258.3, max_power_real:  904, min_power_real:  33.6, avg_voltage: 221.5, avg_current: 1.326, avg_power_factor: 0.88, peak_hour: 14, reading_count: 1440 }, // Sun
    { date: '2026-04-06', total_energy_kwh:  5.8, avg_power_real:  241.7, max_power_real:  846, min_power_real:  31.4, avg_voltage: 220.8, avg_current: 1.261, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-07', total_energy_kwh:  5.5, avg_power_real:  229.2, max_power_real:  802, min_power_real:  29.8, avg_voltage: 220.5, avg_current: 1.195, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-08', total_energy_kwh:  5.6, avg_power_real:  233.3, max_power_real:  817, min_power_real:  30.3, avg_voltage: 220.8, avg_current: 1.218, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-09', total_energy_kwh:  5.1, avg_power_real:  212.5, max_power_real:  744, min_power_real:  27.6, avg_voltage: 220.0, avg_current: 1.120, avg_power_factor: 0.86, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-10', total_energy_kwh:  5.5, avg_power_real:  229.2, max_power_real:  802, min_power_real:  29.8, avg_voltage: 220.5, avg_current: 1.195, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-11', total_energy_kwh:  5.8, avg_power_real:  241.7, max_power_real:  846, min_power_real:  31.4, avg_voltage: 221.0, avg_current: 1.261, avg_power_factor: 0.87, peak_hour: 14, reading_count: 1440 }, // Sat
    { date: '2026-04-12', total_energy_kwh:  5.2, avg_power_real:  216.7, max_power_real:  758, min_power_real:  28.2, avg_voltage: 220.0, avg_current: 1.131, avg_power_factor: 0.87, peak_hour: 13, reading_count: 1440 }, // Sun
    { date: '2026-04-13', total_energy_kwh:  5.6, avg_power_real:  233.3, max_power_real:  817, min_power_real:  30.3, avg_voltage: 220.8, avg_current: 1.218, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-14', total_energy_kwh:  5.3, avg_power_real:  220.8, max_power_real:  773, min_power_real:  28.7, avg_voltage: 220.5, avg_current: 1.154, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-15', total_energy_kwh:  5.9, avg_power_real:  245.8, max_power_real:  861, min_power_real:  31.9, avg_voltage: 221.0, avg_current: 1.284, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-16', total_energy_kwh:  5.7, avg_power_real:  237.5, max_power_real:  831, min_power_real:  30.9, avg_voltage: 220.8, avg_current: 1.241, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-17', total_energy_kwh:  5.5, avg_power_real:  229.2, max_power_real:  802, min_power_real:  29.8, avg_voltage: 220.5, avg_current: 1.195, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-18', total_energy_kwh:  5.8, avg_power_real:  241.7, max_power_real:  846, min_power_real:  31.4, avg_voltage: 221.0, avg_current: 1.261, avg_power_factor: 0.87, peak_hour: 13, reading_count: 1440 }, // Sat
    { date: '2026-04-19', total_energy_kwh:  5.3, avg_power_real:  220.8, max_power_real:  773, min_power_real:  28.7, avg_voltage: 220.2, avg_current: 1.154, avg_power_factor: 0.87, peak_hour: 14, reading_count: 1440 }, // Sun
    { date: '2026-04-20', total_energy_kwh:  5.6, avg_power_real:  233.3, max_power_real:  817, min_power_real:  30.3, avg_voltage: 220.8, avg_current: 1.218, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-21', total_energy_kwh:  2.8, avg_power_real:  233.3, max_power_real:  817, min_power_real:  30.3, avg_voltage: 220.8, avg_current: 1.218, avg_power_factor: 0.87, peak_hour: 10, reading_count:  720 }, // half day
  ],

  // ── Jassy (PAD-4, bluewatt-004) ───────────────────────────────────────────
  // Mar31–Apr9: 358.7 kWh | Apr10–16: 47.1 kWh | Apr17–21: ~6.73/day
  'bluewatt-004': [
    { date: '2026-03-31', total_energy_kwh: 35.0, avg_power_real: 1458.3, max_power_real: 2917, min_power_real: 189.6, avg_voltage: 222.0, avg_current: 7.374, avg_power_factor: 0.89, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-01', total_energy_kwh: 37.5, avg_power_real: 1562.5, max_power_real: 3000, min_power_real: 203.1, avg_voltage: 222.5, avg_current: 7.898, avg_power_factor: 0.89, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-02', total_energy_kwh: 36.8, avg_power_real: 1533.3, max_power_real: 2980, min_power_real: 199.3, avg_voltage: 222.0, avg_current: 7.750, avg_power_factor: 0.89, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-03', total_energy_kwh: 38.2, avg_power_real: 1591.7, max_power_real: 3000, min_power_real: 206.9, avg_voltage: 223.0, avg_current: 8.021, avg_power_factor: 0.89, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-04', total_energy_kwh: 35.5, avg_power_real: 1479.2, max_power_real: 2900, min_power_real: 192.3, avg_voltage: 222.2, avg_current: 7.479, avg_power_factor: 0.89, peak_hour: 13, reading_count: 1440 }, // Sat
    { date: '2026-04-05', total_energy_kwh: 37.0, avg_power_real: 1541.7, max_power_real: 3000, min_power_real: 200.4, avg_voltage: 222.8, avg_current: 7.694, avg_power_factor: 0.90, peak_hour: 14, reading_count: 1440 }, // Sun
    { date: '2026-04-06', total_energy_kwh: 36.5, avg_power_real: 1520.8, max_power_real: 2980, min_power_real: 197.7, avg_voltage: 222.5, avg_current: 7.672, avg_power_factor: 0.89, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-07', total_energy_kwh: 36.0, avg_power_real: 1500.0, max_power_real: 2950, min_power_real: 195.0, avg_voltage: 222.0, avg_current: 7.577, avg_power_factor: 0.89, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-08', total_energy_kwh: 35.8, avg_power_real: 1491.7, max_power_real: 2940, min_power_real: 193.9, avg_voltage: 221.8, avg_current: 7.552, avg_power_factor: 0.89, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-09', total_energy_kwh: 30.4, avg_power_real: 1266.7, max_power_real: 2533, min_power_real: 164.7, avg_voltage: 221.0, avg_current: 6.523, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 },
    // Apr 10–16: 47.1 kWh verified
    { date: '2026-04-10', total_energy_kwh:  6.5, avg_power_real:  270.8, max_power_real:  948, min_power_real:  35.2, avg_voltage: 221.0, avg_current: 1.407, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-11', total_energy_kwh:  7.0, avg_power_real:  291.7, max_power_real: 1021, min_power_real:  37.9, avg_voltage: 221.5, avg_current: 1.497, avg_power_factor: 0.88, peak_hour: 14, reading_count: 1440 }, // Sat
    { date: '2026-04-12', total_energy_kwh:  6.8, avg_power_real:  283.3, max_power_real:  992, min_power_real:  36.8, avg_voltage: 221.2, avg_current: 1.471, avg_power_factor: 0.87, peak_hour: 13, reading_count: 1440 }, // Sun
    { date: '2026-04-13', total_energy_kwh:  6.5, avg_power_real:  270.8, max_power_real:  948, min_power_real:  35.2, avg_voltage: 221.0, avg_current: 1.407, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-14', total_energy_kwh:  7.0, avg_power_real:  291.7, max_power_real: 1021, min_power_real:  37.9, avg_voltage: 221.5, avg_current: 1.497, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-15', total_energy_kwh:  6.8, avg_power_real:  283.3, max_power_real:  992, min_power_real:  36.8, avg_voltage: 221.2, avg_current: 1.471, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-16', total_energy_kwh:  6.5, avg_power_real:  270.8, max_power_real:  948, min_power_real:  35.2, avg_voltage: 221.0, avg_current: 1.407, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 },
    // Apr 17–21: extrapolated ~6.73/day
    { date: '2026-04-17', total_energy_kwh:  6.8, avg_power_real:  283.3, max_power_real:  992, min_power_real:  36.8, avg_voltage: 221.2, avg_current: 1.471, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-18', total_energy_kwh:  6.5, avg_power_real:  270.8, max_power_real:  948, min_power_real:  35.2, avg_voltage: 221.0, avg_current: 1.407, avg_power_factor: 0.87, peak_hour: 13, reading_count: 1440 }, // Sat
    { date: '2026-04-19', total_energy_kwh:  7.0, avg_power_real:  291.7, max_power_real: 1021, min_power_real:  37.9, avg_voltage: 221.5, avg_current: 1.497, avg_power_factor: 0.88, peak_hour: 14, reading_count: 1440 }, // Sun
    { date: '2026-04-20', total_energy_kwh:  6.7, avg_power_real:  279.2, max_power_real:  977, min_power_real:  36.3, avg_voltage: 221.2, avg_current: 1.448, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-21', total_energy_kwh:  3.4, avg_power_real:  283.3, max_power_real:  992, min_power_real:  36.8, avg_voltage: 221.2, avg_current: 1.471, avg_power_factor: 0.87, peak_hour: 10, reading_count:  720 }, // half day
  ],
};

// Totals for billing (Mar 31 – Apr 17, covers the verified CKS anchor points)
// 001 Reynie:  76.0 (Mar31-Apr9) + 17.3 (Apr10-16) + 2.5 (Apr17) = 95.8 kWh
// 002 Sophie: 187.6 (Mar31-Apr9) + 51.0 (Apr10-16) + 7.3 (Apr17) = 245.9 kWh
// 003 PAD-3:   56.0 (Mar31-Apr9) + 39.0 (Apr10-16) + 5.5 (Apr17) = 100.5 kWh (placeholder)
// 004 Jassy:  358.7 (Mar31-Apr9) + 47.1 (Apr10-16) + 6.8 (Apr17) = 412.6 kWh
const ENERGY_TOTALS: Record<string, number> = {
  'bluewatt-001':   95.8,
  'bluewatt-002':  245.9,
  'bluewatt-003':  100.5,
  'bluewatt-004':  412.6,
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
      `  ✓ Power data seeded: ${p.device_serial}  |  Mar 31 – Apr 21  |  ` +
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
    let stayId: number;
    if ((existingStay as any[]).length > 0) {
      stayId = (existingStay as any[])[0].id;
      console.log(`  ↳ Stay already exists: ${p.tenant_email} @ ${p.name}`);
    } else {
      const [stayResult] = await pool.execute<any>(
        `INSERT INTO stays
           (pad_id, tenant_id, check_in_at, billing_cycle, flat_rate_per_cycle,
            rate_per_kwh, status, notes, created_by)
         VALUES (?, ?, ?, 'monthly', ?, ?, 'active', ?, ?)`,
        [padId, tenantId, CHECK_IN, p.flat_rate, p.rate_per_kwh,
         'Monthly tenant — check-in March 31 2026', adminId]
      );
      stayId = stayResult.insertId;
      console.log(`  ✓ Stay created: ${p.tenant_email} @ ${p.name}  |  ₱${p.flat_rate}/mo + ₱${p.rate_per_kwh}/kWh`);
    }

    // Billing — cycle 1: Mar 31 → Apr 17, two separate bills (electricity + rent)
    const [existingElec] = await pool.execute<any[]>(
      "SELECT id FROM billing_periods WHERE stay_id = ? AND cycle_number = 1 AND bill_type = 'electricity'", [stayId]
    );
    if ((existingElec as any[]).length === 0) {
      const energyKwh    = ENERGY_TOTALS[p.device_serial] ?? 0;
      const energyAmount = parseFloat((energyKwh * p.rate_per_kwh).toFixed(2));
      await pool.execute(
        `INSERT INTO billing_periods
           (pad_id, stay_id, tenant_id, period_start, period_end,
            energy_kwh, rate_per_kwh, amount_due, flat_amount, cycle_number, bill_type, due_date, status)
         VALUES (?, ?, ?, '2026-03-31', '2026-04-17', ?, ?, ?, 0, 1, 'electricity', '2026-04-22', 'unpaid')`,
        [padId, stayId, tenantId, energyKwh, p.rate_per_kwh, energyAmount]
      );
      console.log(`  ✓ Electricity bill: ${p.name}  |  ${energyKwh.toFixed(2)} kWh × ₱${p.rate_per_kwh}  =  ₱${energyAmount.toFixed(2)}`);
    } else {
      console.log(`  ↳ Electricity bill already exists: ${p.name} cycle 1`);
    }

    const [existingRent] = await pool.execute<any[]>(
      "SELECT id FROM billing_periods WHERE stay_id = ? AND cycle_number = 1 AND bill_type = 'rent'", [stayId]
    );
    if ((existingRent as any[]).length === 0) {
      const flatAmount = p.flat_rate;
      await pool.execute(
        `INSERT INTO billing_periods
           (pad_id, stay_id, tenant_id, period_start, period_end,
            energy_kwh, rate_per_kwh, amount_due, flat_amount, cycle_number, bill_type, due_date, status)
         VALUES (?, ?, ?, '2026-03-31', '2026-04-17', 0, 0, ?, ?, 1, 'rent', '2026-04-22', 'unpaid')`,
        [padId, stayId, tenantId, flatAmount, flatAmount]
      );
      console.log(`  ✓ Rent bill:        ${p.name}  |  flat  =  ₱${flatAmount.toFixed(2)}`);
    } else {
      console.log(`  ↳ Rent bill already exists: ${p.name} cycle 1`);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🌱  BlueWatt Seeder — Real Meter Data (Mar 31 – Apr 21 2026)\n');
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

    console.log('\n⚡  Seeding power aggregates (Mar 31 – Apr 21)...');
    await seedPowerAggregates();

    console.log('\n🏨  Seeding stays & billing (cycle 1: Mar 31 – Apr 17)...');
    await seedStaysAndBilling();

    console.log('\n✅  Seed complete.\n');
    console.log('─────────────────────────────────────────────────────────────────────');
    console.log('  Admin:   admin@bluewatt.local  /  Admin@1234');
    console.log('  Reynie:  reynie-proto@test.com  /  Tenant@1234  →  PAD-1 (bluewatt-001)');
    console.log('  Sophie:  sophie-proto@test.com  /  Tenant@1234  →  PAD-2 (bluewatt-002)');
    console.log('  Jassy:   jassy-proto@test.com   /  Tenant@1234  →  PAD-4 (bluewatt-004)');
    console.log('─────────────────────────────────────────────────────────────────────');
    console.log('  Rate: ₱11.40/kWh | Check-in: March 31 2026 | Billing: Mar 31 – Apr 17');
    console.log('─────────────────────────────────────────────────────────────────────');
    console.log(`  Reynie (PAD-1):   95.8 kWh × ₱11.40 =  ₱1,092.12  + ₱2,000  = ₱3,092.12`);
    console.log(`  Sophie (PAD-2):  245.9 kWh × ₱11.40 =  ₱2,803.26  + ₱2,500  = ₱5,303.26`);
    console.log(`  Jassy  (PAD-4):  412.6 kWh × ₱11.40 =  ₱4,703.64  + ₱2,000  = ₱6,703.64`);
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
