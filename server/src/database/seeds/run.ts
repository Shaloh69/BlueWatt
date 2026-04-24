/**
 * BlueWatt Database Seeder — Real Meter Data
 * Run: npm run seed
 *
 * Seeds:
 *  - Cleanses all data, keeps admin account
 *  - 3 real tenants: Reynie (PAD-1), Sophie (PAD-2), Jassy (PAD-4)
 *  - 4 devices (bluewatt-001/002/003/004); PAD-3 unassigned
 *  - Daily power aggregates Mar 11 – Apr 21 from real CKS meter readings
 *  - CKS meter photo anchors:
 *      Reynie PAD-1 (#2020351142): Mar11=3340.0 → Apr10=3416.0 → Apr17=3433.3 kWh
 *      Sophie PAD-2 (#2020351146): Mar11=4515.4 → Apr10=4703.0 → Apr17=4754.0 kWh
 *      Jassy  PAD-4 (#2020351141): Mar11=184.2  → Apr10=542.9  → Apr17=659.0  kWh
 *  - Rate: ₱11.35/kWh | Billing cycle 1: Apr 10 – Apr 17 (due Apr 24)
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
// Mar 11–Apr 9 (30 days) and Apr 10–17 billing window verified by CKS meter photos.
// Apr 17–21 extrapolated at similar daily rate.
// Apr 21 = partial day (12 h, reading_count=720).
//
// Reynie (001): Mar11–Apr9 = 76.0 kWh (2.53/day), Apr10–16 = 17.3 kWh (2.47/day)
// Sophie (002): Mar11–Apr9 = 187.6 kWh (6.25/day), Apr10–16 = 51.0 kWh (7.29/day)
// Jassy  (004): Mar11–Apr9 = 358.7 kWh (11.96/day), Apr10–16 = 116.1 kWh (16.59/day)

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
  // Mar11–Apr9: 76.0 kWh | Apr10–16: 17.3 kWh | Apr17–21: ~2.7/day
  'bluewatt-001': [
    // Mar 11–31 (avg ~2.53/day)
    { date: '2026-03-11', total_energy_kwh:  2.5, avg_power_real:  104.2, max_power_real:  365, min_power_real: 13.5, avg_voltage: 221.0, avg_current: 0.542, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Wed
    { date: '2026-03-12', total_energy_kwh:  2.4, avg_power_real:  100.0, max_power_real:  350, min_power_real: 13.0, avg_voltage: 220.8, avg_current: 0.521, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 }, // Thu
    { date: '2026-03-13', total_energy_kwh:  2.6, avg_power_real:  108.3, max_power_real:  379, min_power_real: 14.1, avg_voltage: 221.2, avg_current: 0.563, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Fri
    { date: '2026-03-14', total_energy_kwh:  2.7, avg_power_real:  112.5, max_power_real:  394, min_power_real: 14.6, avg_voltage: 221.5, avg_current: 0.582, avg_power_factor: 0.87, peak_hour: 14, reading_count: 1440 }, // Sat
    { date: '2026-03-15', total_energy_kwh:  2.8, avg_power_real:  116.7, max_power_real:  408, min_power_real: 15.2, avg_voltage: 222.0, avg_current: 0.603, avg_power_factor: 0.88, peak_hour: 13, reading_count: 1440 }, // Sun
    { date: '2026-03-16', total_energy_kwh:  2.4, avg_power_real:  100.0, max_power_real:  350, min_power_real: 13.0, avg_voltage: 220.5, avg_current: 0.521, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Mon
    { date: '2026-03-17', total_energy_kwh:  2.5, avg_power_real:  104.2, max_power_real:  365, min_power_real: 13.5, avg_voltage: 221.0, avg_current: 0.542, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 }, // Tue
    { date: '2026-03-18', total_energy_kwh:  2.5, avg_power_real:  104.2, max_power_real:  365, min_power_real: 13.5, avg_voltage: 221.0, avg_current: 0.542, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Wed
    { date: '2026-03-19', total_energy_kwh:  2.4, avg_power_real:  100.0, max_power_real:  350, min_power_real: 13.0, avg_voltage: 220.8, avg_current: 0.521, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Thu
    { date: '2026-03-20', total_energy_kwh:  2.6, avg_power_real:  108.3, max_power_real:  379, min_power_real: 14.1, avg_voltage: 221.2, avg_current: 0.563, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 }, // Fri
    { date: '2026-03-21', total_energy_kwh:  2.7, avg_power_real:  112.5, max_power_real:  394, min_power_real: 14.6, avg_voltage: 221.5, avg_current: 0.582, avg_power_factor: 0.87, peak_hour: 14, reading_count: 1440 }, // Sat
    { date: '2026-03-22', total_energy_kwh:  2.7, avg_power_real:  112.5, max_power_real:  394, min_power_real: 14.6, avg_voltage: 222.0, avg_current: 0.582, avg_power_factor: 0.87, peak_hour: 13, reading_count: 1440 }, // Sun
    { date: '2026-03-23', total_energy_kwh:  2.4, avg_power_real:  100.0, max_power_real:  350, min_power_real: 13.0, avg_voltage: 220.5, avg_current: 0.521, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Mon
    { date: '2026-03-24', total_energy_kwh:  2.5, avg_power_real:  104.2, max_power_real:  365, min_power_real: 13.5, avg_voltage: 221.0, avg_current: 0.542, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 }, // Tue
    { date: '2026-03-25', total_energy_kwh:  2.5, avg_power_real:  104.2, max_power_real:  365, min_power_real: 13.5, avg_voltage: 221.0, avg_current: 0.542, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Wed
    { date: '2026-03-26', total_energy_kwh:  2.4, avg_power_real:  100.0, max_power_real:  350, min_power_real: 13.0, avg_voltage: 220.8, avg_current: 0.521, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Thu
    { date: '2026-03-27', total_energy_kwh:  2.6, avg_power_real:  108.3, max_power_real:  379, min_power_real: 14.1, avg_voltage: 221.2, avg_current: 0.563, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 }, // Fri
    { date: '2026-03-28', total_energy_kwh:  2.7, avg_power_real:  112.5, max_power_real:  394, min_power_real: 14.6, avg_voltage: 221.5, avg_current: 0.582, avg_power_factor: 0.87, peak_hour: 14, reading_count: 1440 }, // Sat
    { date: '2026-03-29', total_energy_kwh:  2.7, avg_power_real:  112.5, max_power_real:  394, min_power_real: 14.6, avg_voltage: 222.0, avg_current: 0.582, avg_power_factor: 0.88, peak_hour: 13, reading_count: 1440 }, // Sun
    { date: '2026-03-30', total_energy_kwh:  2.4, avg_power_real:  100.0, max_power_real:  350, min_power_real: 13.0, avg_voltage: 220.5, avg_current: 0.521, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Mon
    { date: '2026-03-31', total_energy_kwh:  2.5, avg_power_real:  104.2, max_power_real:  365, min_power_real: 13.5, avg_voltage: 221.0, avg_current: 0.542, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 }, // Tue
    // Apr 1–9
    { date: '2026-04-01', total_energy_kwh:  2.5, avg_power_real:  104.2, max_power_real:  365, min_power_real: 13.5, avg_voltage: 221.0, avg_current: 0.542, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Wed
    { date: '2026-04-02', total_energy_kwh:  2.4, avg_power_real:  100.0, max_power_real:  350, min_power_real: 13.0, avg_voltage: 220.8, avg_current: 0.521, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Thu
    { date: '2026-04-03', total_energy_kwh:  2.6, avg_power_real:  108.3, max_power_real:  379, min_power_real: 14.1, avg_voltage: 221.2, avg_current: 0.563, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 }, // Fri
    { date: '2026-04-04', total_energy_kwh:  2.7, avg_power_real:  112.5, max_power_real:  394, min_power_real: 14.6, avg_voltage: 221.5, avg_current: 0.582, avg_power_factor: 0.87, peak_hour: 14, reading_count: 1440 }, // Sat
    { date: '2026-04-05', total_energy_kwh:  2.7, avg_power_real:  112.5, max_power_real:  394, min_power_real: 14.6, avg_voltage: 222.0, avg_current: 0.582, avg_power_factor: 0.88, peak_hour: 13, reading_count: 1440 }, // Sun
    { date: '2026-04-06', total_energy_kwh:  2.5, avg_power_real:  104.2, max_power_real:  365, min_power_real: 13.5, avg_voltage: 221.0, avg_current: 0.542, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 }, // Mon
    { date: '2026-04-07', total_energy_kwh:  2.5, avg_power_real:  104.2, max_power_real:  365, min_power_real: 13.5, avg_voltage: 221.0, avg_current: 0.542, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Tue
    { date: '2026-04-08', total_energy_kwh:  2.5, avg_power_real:  104.2, max_power_real:  365, min_power_real: 13.5, avg_voltage: 221.2, avg_current: 0.542, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 }, // Wed
    { date: '2026-04-09', total_energy_kwh:  2.4, avg_power_real:  100.0, max_power_real:  350, min_power_real: 13.0, avg_voltage: 220.8, avg_current: 0.521, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Thu
    // Apr 10–16: 17.3 kWh billing window verified
    { date: '2026-04-10', total_energy_kwh:  2.5, avg_power_real:  104.2, max_power_real:  365, min_power_real: 13.5, avg_voltage: 220.5, avg_current: 0.542, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Fri
    { date: '2026-04-11', total_energy_kwh:  2.3, avg_power_real:   95.8, max_power_real:  335, min_power_real: 12.5, avg_voltage: 220.0, avg_current: 0.499, avg_power_factor: 0.87, peak_hour: 14, reading_count: 1440 }, // Sat
    { date: '2026-04-12', total_energy_kwh:  2.6, avg_power_real:  108.3, max_power_real:  379, min_power_real: 14.1, avg_voltage: 221.0, avg_current: 0.563, avg_power_factor: 0.87, peak_hour: 13, reading_count: 1440 }, // Sun
    { date: '2026-04-13', total_energy_kwh:  2.4, avg_power_real:  100.0, max_power_real:  350, min_power_real: 13.0, avg_voltage: 220.8, avg_current: 0.521, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 }, // Mon
    { date: '2026-04-14', total_energy_kwh:  2.5, avg_power_real:  104.2, max_power_real:  365, min_power_real: 13.5, avg_voltage: 221.0, avg_current: 0.542, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Tue
    { date: '2026-04-15', total_energy_kwh:  2.5, avg_power_real:  104.2, max_power_real:  365, min_power_real: 13.5, avg_voltage: 221.5, avg_current: 0.542, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 }, // Wed
    { date: '2026-04-16', total_energy_kwh:  2.5, avg_power_real:  104.2, max_power_real:  365, min_power_real: 13.5, avg_voltage: 220.8, avg_current: 0.542, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Thu
    // Apr 17–21: ~2.7/day extrapolated
    { date: '2026-04-17', total_energy_kwh:  2.8, avg_power_real:  116.7, max_power_real:  408, min_power_real: 15.2, avg_voltage: 221.0, avg_current: 0.603, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 }, // Fri
    { date: '2026-04-18', total_energy_kwh:  2.6, avg_power_real:  108.3, max_power_real:  379, min_power_real: 14.1, avg_voltage: 220.5, avg_current: 0.563, avg_power_factor: 0.87, peak_hour: 13, reading_count: 1440 }, // Sat
    { date: '2026-04-19', total_energy_kwh:  3.2, avg_power_real:  133.3, max_power_real:  467, min_power_real: 17.3, avg_voltage: 221.0, avg_current: 0.690, avg_power_factor: 0.87, peak_hour: 14, reading_count: 1440 }, // Sun
    { date: '2026-04-20', total_energy_kwh:  2.8, avg_power_real:  116.7, max_power_real:  408, min_power_real: 15.2, avg_voltage: 220.8, avg_current: 0.603, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 }, // Mon
    { date: '2026-04-21', total_energy_kwh:  1.4, avg_power_real:  116.7, max_power_real:  408, min_power_real: 15.2, avg_voltage: 220.8, avg_current: 0.603, avg_power_factor: 0.88, peak_hour: 10, reading_count:  720 }, // Tue half-day
  ],

  // ── Sophie (PAD-2, bluewatt-002) ──────────────────────────────────────────
  // Mar11–Apr9: 187.6 kWh | Apr10–16: 51.0 kWh | Apr17–21: ~7.1/day
  'bluewatt-002': [
    // Mar 11–31 (avg ~6.25/day)
    { date: '2026-03-11', total_energy_kwh:  6.0, avg_power_real:  250.0, max_power_real:  875, min_power_real: 32.5, avg_voltage: 222.0, avg_current: 1.288, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Wed
    { date: '2026-03-12', total_energy_kwh:  5.8, avg_power_real:  241.7, max_power_real:  846, min_power_real: 31.4, avg_voltage: 221.5, avg_current: 1.245, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 }, // Thu
    { date: '2026-03-13', total_energy_kwh:  6.2, avg_power_real:  258.3, max_power_real:  904, min_power_real: 33.6, avg_voltage: 221.8, avg_current: 1.330, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Fri
    { date: '2026-03-14', total_energy_kwh:  6.8, avg_power_real:  283.3, max_power_real:  992, min_power_real: 36.8, avg_voltage: 222.5, avg_current: 1.449, avg_power_factor: 0.88, peak_hour: 14, reading_count: 1440 }, // Sat
    { date: '2026-03-15', total_energy_kwh:  7.0, avg_power_real:  291.7, max_power_real: 1021, min_power_real: 37.9, avg_voltage: 223.0, avg_current: 1.483, avg_power_factor: 0.88, peak_hour: 13, reading_count: 1440 }, // Sun
    { date: '2026-03-16', total_energy_kwh:  5.8, avg_power_real:  241.7, max_power_real:  846, min_power_real: 31.4, avg_voltage: 221.5, avg_current: 1.245, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Mon
    { date: '2026-03-17', total_energy_kwh:  6.0, avg_power_real:  250.0, max_power_real:  875, min_power_real: 32.5, avg_voltage: 222.0, avg_current: 1.288, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 }, // Tue
    { date: '2026-03-18', total_energy_kwh:  6.2, avg_power_real:  258.3, max_power_real:  904, min_power_real: 33.6, avg_voltage: 222.0, avg_current: 1.330, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Wed
    { date: '2026-03-19', total_energy_kwh:  6.0, avg_power_real:  250.0, max_power_real:  875, min_power_real: 32.5, avg_voltage: 221.8, avg_current: 1.288, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Thu
    { date: '2026-03-20', total_energy_kwh:  6.3, avg_power_real:  262.5, max_power_real:  919, min_power_real: 34.1, avg_voltage: 222.0, avg_current: 1.352, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 }, // Fri
    { date: '2026-03-21', total_energy_kwh:  6.8, avg_power_real:  283.3, max_power_real:  992, min_power_real: 36.8, avg_voltage: 222.5, avg_current: 1.449, avg_power_factor: 0.88, peak_hour: 14, reading_count: 1440 }, // Sat
    { date: '2026-03-22', total_energy_kwh:  7.2, avg_power_real:  300.0, max_power_real: 1050, min_power_real: 39.0, avg_voltage: 223.0, avg_current: 1.530, avg_power_factor: 0.88, peak_hour: 13, reading_count: 1440 }, // Sun
    { date: '2026-03-23', total_energy_kwh:  5.9, avg_power_real:  245.8, max_power_real:  861, min_power_real: 32.0, avg_voltage: 221.5, avg_current: 1.266, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Mon
    { date: '2026-03-24', total_energy_kwh:  6.1, avg_power_real:  254.2, max_power_real:  890, min_power_real: 33.0, avg_voltage: 221.8, avg_current: 1.309, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 }, // Tue
    { date: '2026-03-25', total_energy_kwh:  6.0, avg_power_real:  250.0, max_power_real:  875, min_power_real: 32.5, avg_voltage: 221.8, avg_current: 1.288, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Wed
    { date: '2026-03-26', total_energy_kwh:  5.8, avg_power_real:  241.7, max_power_real:  846, min_power_real: 31.4, avg_voltage: 221.5, avg_current: 1.245, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Thu
    { date: '2026-03-27', total_energy_kwh:  6.2, avg_power_real:  258.3, max_power_real:  904, min_power_real: 33.6, avg_voltage: 221.8, avg_current: 1.330, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 }, // Fri
    { date: '2026-03-28', total_energy_kwh:  6.7, avg_power_real:  279.2, max_power_real:  977, min_power_real: 36.3, avg_voltage: 222.5, avg_current: 1.428, avg_power_factor: 0.88, peak_hour: 14, reading_count: 1440 }, // Sat
    { date: '2026-03-29', total_energy_kwh:  7.0, avg_power_real:  291.7, max_power_real: 1021, min_power_real: 37.9, avg_voltage: 223.0, avg_current: 1.483, avg_power_factor: 0.88, peak_hour: 13, reading_count: 1440 }, // Sun
    { date: '2026-03-30', total_energy_kwh:  5.8, avg_power_real:  241.7, max_power_real:  846, min_power_real: 31.4, avg_voltage: 221.5, avg_current: 1.245, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Mon
    { date: '2026-03-31', total_energy_kwh:  6.0, avg_power_real:  250.0, max_power_real:  875, min_power_real: 32.5, avg_voltage: 222.0, avg_current: 1.288, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 }, // Tue
    // Apr 1–9
    { date: '2026-04-01', total_energy_kwh:  6.2, avg_power_real:  258.3, max_power_real:  904, min_power_real: 33.6, avg_voltage: 222.0, avg_current: 1.330, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Wed
    { date: '2026-04-02', total_energy_kwh:  6.0, avg_power_real:  250.0, max_power_real:  875, min_power_real: 32.5, avg_voltage: 221.8, avg_current: 1.288, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Thu
    { date: '2026-04-03', total_energy_kwh:  6.3, avg_power_real:  262.5, max_power_real:  919, min_power_real: 34.1, avg_voltage: 222.0, avg_current: 1.352, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 }, // Fri
    { date: '2026-04-04', total_energy_kwh:  6.8, avg_power_real:  283.3, max_power_real:  992, min_power_real: 36.8, avg_voltage: 222.5, avg_current: 1.449, avg_power_factor: 0.88, peak_hour: 14, reading_count: 1440 }, // Sat
    { date: '2026-04-05', total_energy_kwh:  7.0, avg_power_real:  291.7, max_power_real: 1021, min_power_real: 37.9, avg_voltage: 223.0, avg_current: 1.483, avg_power_factor: 0.88, peak_hour: 13, reading_count: 1440 }, // Sun
    { date: '2026-04-06', total_energy_kwh:  6.0, avg_power_real:  250.0, max_power_real:  875, min_power_real: 32.5, avg_voltage: 222.0, avg_current: 1.288, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 }, // Mon
    { date: '2026-04-07', total_energy_kwh:  6.2, avg_power_real:  258.3, max_power_real:  904, min_power_real: 33.6, avg_voltage: 221.8, avg_current: 1.330, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Tue
    { date: '2026-04-08', total_energy_kwh:  5.8, avg_power_real:  241.7, max_power_real:  846, min_power_real: 31.4, avg_voltage: 221.5, avg_current: 1.245, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 }, // Wed
    { date: '2026-04-09', total_energy_kwh:  5.8, avg_power_real:  241.7, max_power_real:  846, min_power_real: 31.4, avg_voltage: 221.2, avg_current: 1.245, avg_power_factor: 0.87, peak_hour: 21, reading_count: 1440 }, // Thu
    // Apr 10–16: 51.0 kWh billing window verified
    { date: '2026-04-10', total_energy_kwh:  7.2, avg_power_real:  300.0, max_power_real: 1050, min_power_real: 39.0, avg_voltage: 221.0, avg_current: 1.551, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 }, // Fri
    { date: '2026-04-11', total_energy_kwh:  7.5, avg_power_real:  312.5, max_power_real: 1094, min_power_real: 40.6, avg_voltage: 221.5, avg_current: 1.607, avg_power_factor: 0.88, peak_hour: 14, reading_count: 1440 }, // Sat
    { date: '2026-04-12', total_energy_kwh:  7.0, avg_power_real:  291.7, max_power_real: 1021, min_power_real: 37.9, avg_voltage: 221.0, avg_current: 1.503, avg_power_factor: 0.88, peak_hour: 13, reading_count: 1440 }, // Sun
    { date: '2026-04-13', total_energy_kwh:  7.3, avg_power_real:  304.2, max_power_real: 1065, min_power_real: 39.5, avg_voltage: 221.5, avg_current: 1.566, avg_power_factor: 0.88, peak_hour: 20, reading_count: 1440 }, // Mon
    { date: '2026-04-14', total_energy_kwh:  7.5, avg_power_real:  312.5, max_power_real: 1094, min_power_real: 40.6, avg_voltage: 222.0, avg_current: 1.607, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 }, // Tue
    { date: '2026-04-15', total_energy_kwh:  7.2, avg_power_real:  300.0, max_power_real: 1050, min_power_real: 39.0, avg_voltage: 221.5, avg_current: 1.543, avg_power_factor: 0.88, peak_hour: 20, reading_count: 1440 }, // Wed
    { date: '2026-04-16', total_energy_kwh:  7.3, avg_power_real:  304.2, max_power_real: 1065, min_power_real: 39.5, avg_voltage: 221.0, avg_current: 1.566, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 }, // Thu
    // Apr 17–21: ~7.1/day extrapolated
    { date: '2026-04-17', total_energy_kwh:  6.5, avg_power_real:  270.8, max_power_real:  948, min_power_real: 35.2, avg_voltage: 221.5, avg_current: 1.394, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 }, // Fri
    { date: '2026-04-18', total_energy_kwh:  6.8, avg_power_real:  283.3, max_power_real:  992, min_power_real: 36.8, avg_voltage: 221.0, avg_current: 1.459, avg_power_factor: 0.88, peak_hour: 13, reading_count: 1440 }, // Sat
    { date: '2026-04-19', total_energy_kwh:  7.2, avg_power_real:  300.0, max_power_real: 1050, min_power_real: 39.0, avg_voltage: 221.5, avg_current: 1.543, avg_power_factor: 0.88, peak_hour: 14, reading_count: 1440 }, // Sun
    { date: '2026-04-20', total_energy_kwh:  6.5, avg_power_real:  270.8, max_power_real:  948, min_power_real: 35.2, avg_voltage: 221.0, avg_current: 1.394, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 }, // Mon
    { date: '2026-04-21', total_energy_kwh:  3.0, avg_power_real:  250.0, max_power_real:  875, min_power_real: 32.5, avg_voltage: 221.0, avg_current: 1.288, avg_power_factor: 0.88, peak_hour: 10, reading_count:  720 }, // Tue half-day
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
  // Mar11–Apr9: 358.7 kWh (11.96/day) | Apr10–16: 116.1 kWh (16.59/day)
  // Apr17–21: very low usage (659.0→662.6 = 3.6 kWh verified from meter photo)
  'bluewatt-004': [
    // Mar 11–31 (avg ~11.96/day)
    { date: '2026-03-11', total_energy_kwh: 11.5, avg_power_real:  479.2, max_power_real: 1677, min_power_real: 62.3, avg_voltage: 222.0, avg_current: 2.447, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 }, // Wed
    { date: '2026-03-12', total_energy_kwh: 11.0, avg_power_real:  458.3, max_power_real: 1604, min_power_real: 59.6, avg_voltage: 221.5, avg_current: 2.342, avg_power_factor: 0.88, peak_hour: 20, reading_count: 1440 }, // Thu
    { date: '2026-03-13', total_energy_kwh: 12.0, avg_power_real:  500.0, max_power_real: 1750, min_power_real: 65.0, avg_voltage: 222.0, avg_current: 2.551, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 }, // Fri
    { date: '2026-03-14', total_energy_kwh: 12.5, avg_power_real:  520.8, max_power_real: 1823, min_power_real: 67.7, avg_voltage: 222.5, avg_current: 2.656, avg_power_factor: 0.88, peak_hour: 14, reading_count: 1440 }, // Sat
    { date: '2026-03-15', total_energy_kwh: 13.0, avg_power_real:  541.7, max_power_real: 1896, min_power_real: 70.4, avg_voltage: 223.0, avg_current: 2.756, avg_power_factor: 0.88, peak_hour: 13, reading_count: 1440 }, // Sun
    { date: '2026-03-16', total_energy_kwh: 11.0, avg_power_real:  458.3, max_power_real: 1604, min_power_real: 59.6, avg_voltage: 221.5, avg_current: 2.342, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 }, // Mon
    { date: '2026-03-17', total_energy_kwh: 11.5, avg_power_real:  479.2, max_power_real: 1677, min_power_real: 62.3, avg_voltage: 222.0, avg_current: 2.447, avg_power_factor: 0.88, peak_hour: 20, reading_count: 1440 }, // Tue
    { date: '2026-03-18', total_energy_kwh: 11.8, avg_power_real:  491.7, max_power_real: 1721, min_power_real: 63.9, avg_voltage: 222.0, avg_current: 2.509, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 }, // Wed
    { date: '2026-03-19', total_energy_kwh: 11.5, avg_power_real:  479.2, max_power_real: 1677, min_power_real: 62.3, avg_voltage: 221.8, avg_current: 2.447, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 }, // Thu
    { date: '2026-03-20', total_energy_kwh: 12.0, avg_power_real:  500.0, max_power_real: 1750, min_power_real: 65.0, avg_voltage: 222.0, avg_current: 2.551, avg_power_factor: 0.88, peak_hour: 20, reading_count: 1440 }, // Fri
    { date: '2026-03-21', total_energy_kwh: 12.5, avg_power_real:  520.8, max_power_real: 1823, min_power_real: 67.7, avg_voltage: 222.5, avg_current: 2.656, avg_power_factor: 0.88, peak_hour: 14, reading_count: 1440 }, // Sat
    { date: '2026-03-22', total_energy_kwh: 13.8, avg_power_real:  575.0, max_power_real: 2013, min_power_real: 74.8, avg_voltage: 223.0, avg_current: 2.927, avg_power_factor: 0.88, peak_hour: 13, reading_count: 1440 }, // Sun
    { date: '2026-03-23', total_energy_kwh: 11.0, avg_power_real:  458.3, max_power_real: 1604, min_power_real: 59.6, avg_voltage: 221.5, avg_current: 2.342, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 }, // Mon
    { date: '2026-03-24', total_energy_kwh: 12.0, avg_power_real:  500.0, max_power_real: 1750, min_power_real: 65.0, avg_voltage: 222.0, avg_current: 2.551, avg_power_factor: 0.88, peak_hour: 20, reading_count: 1440 }, // Tue
    { date: '2026-03-25', total_energy_kwh: 11.5, avg_power_real:  479.2, max_power_real: 1677, min_power_real: 62.3, avg_voltage: 221.8, avg_current: 2.447, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 }, // Wed
    { date: '2026-03-26', total_energy_kwh: 11.0, avg_power_real:  458.3, max_power_real: 1604, min_power_real: 59.6, avg_voltage: 221.5, avg_current: 2.342, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 }, // Thu
    { date: '2026-03-27', total_energy_kwh: 12.0, avg_power_real:  500.0, max_power_real: 1750, min_power_real: 65.0, avg_voltage: 222.0, avg_current: 2.551, avg_power_factor: 0.88, peak_hour: 20, reading_count: 1440 }, // Fri
    { date: '2026-03-28', total_energy_kwh: 13.0, avg_power_real:  541.7, max_power_real: 1896, min_power_real: 70.4, avg_voltage: 222.5, avg_current: 2.756, avg_power_factor: 0.88, peak_hour: 14, reading_count: 1440 }, // Sat
    { date: '2026-03-29', total_energy_kwh: 13.8, avg_power_real:  575.0, max_power_real: 2013, min_power_real: 74.8, avg_voltage: 223.0, avg_current: 2.927, avg_power_factor: 0.88, peak_hour: 13, reading_count: 1440 }, // Sun
    { date: '2026-03-30', total_energy_kwh: 11.0, avg_power_real:  458.3, max_power_real: 1604, min_power_real: 59.6, avg_voltage: 221.5, avg_current: 2.342, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 }, // Mon
    { date: '2026-03-31', total_energy_kwh: 11.5, avg_power_real:  479.2, max_power_real: 1677, min_power_real: 62.3, avg_voltage: 222.0, avg_current: 2.447, avg_power_factor: 0.88, peak_hour: 20, reading_count: 1440 }, // Tue
    // Apr 1–9
    { date: '2026-04-01', total_energy_kwh: 12.0, avg_power_real:  500.0, max_power_real: 1750, min_power_real: 65.0, avg_voltage: 222.0, avg_current: 2.551, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 }, // Wed
    { date: '2026-04-02', total_energy_kwh: 11.5, avg_power_real:  479.2, max_power_real: 1677, min_power_real: 62.3, avg_voltage: 221.8, avg_current: 2.447, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 }, // Thu
    { date: '2026-04-03', total_energy_kwh: 12.0, avg_power_real:  500.0, max_power_real: 1750, min_power_real: 65.0, avg_voltage: 222.0, avg_current: 2.551, avg_power_factor: 0.88, peak_hour: 20, reading_count: 1440 }, // Fri
    { date: '2026-04-04', total_energy_kwh: 12.5, avg_power_real:  520.8, max_power_real: 1823, min_power_real: 67.7, avg_voltage: 222.5, avg_current: 2.656, avg_power_factor: 0.88, peak_hour: 14, reading_count: 1440 }, // Sat
    { date: '2026-04-05', total_energy_kwh: 13.3, avg_power_real:  554.2, max_power_real: 1940, min_power_real: 72.0, avg_voltage: 223.0, avg_current: 2.819, avg_power_factor: 0.88, peak_hour: 13, reading_count: 1440 }, // Sun
    { date: '2026-04-06', total_energy_kwh: 11.5, avg_power_real:  479.2, max_power_real: 1677, min_power_real: 62.3, avg_voltage: 222.0, avg_current: 2.447, avg_power_factor: 0.88, peak_hour: 20, reading_count: 1440 }, // Mon
    { date: '2026-04-07', total_energy_kwh: 12.0, avg_power_real:  500.0, max_power_real: 1750, min_power_real: 65.0, avg_voltage: 222.0, avg_current: 2.551, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 }, // Tue
    { date: '2026-04-08', total_energy_kwh: 11.5, avg_power_real:  479.2, max_power_real: 1677, min_power_real: 62.3, avg_voltage: 221.8, avg_current: 2.447, avg_power_factor: 0.88, peak_hour: 20, reading_count: 1440 }, // Wed
    { date: '2026-04-09', total_energy_kwh: 11.5, avg_power_real:  479.2, max_power_real: 1677, min_power_real: 62.3, avg_voltage: 221.5, avg_current: 2.447, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 }, // Thu
    // Apr 10–16: 116.1 kWh billing window verified (542.9→659.0)
    { date: '2026-04-10', total_energy_kwh: 16.0, avg_power_real:  666.7, max_power_real: 2333, min_power_real: 86.7, avg_voltage: 222.0, avg_current: 3.404, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 }, // Fri
    { date: '2026-04-11', total_energy_kwh: 17.5, avg_power_real:  729.2, max_power_real: 2552, min_power_real: 94.8, avg_voltage: 222.5, avg_current: 3.710, avg_power_factor: 0.88, peak_hour: 14, reading_count: 1440 }, // Sat
    { date: '2026-04-12', total_energy_kwh: 18.0, avg_power_real:  750.0, max_power_real: 2625, min_power_real: 97.5, avg_voltage: 222.5, avg_current: 3.814, avg_power_factor: 0.88, peak_hour: 13, reading_count: 1440 }, // Sun
    { date: '2026-04-13', total_energy_kwh: 16.5, avg_power_real:  687.5, max_power_real: 2406, min_power_real: 89.4, avg_voltage: 222.0, avg_current: 3.510, avg_power_factor: 0.88, peak_hour: 20, reading_count: 1440 }, // Mon
    { date: '2026-04-14', total_energy_kwh: 16.5, avg_power_real:  687.5, max_power_real: 2406, min_power_real: 89.4, avg_voltage: 222.0, avg_current: 3.510, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 }, // Tue
    { date: '2026-04-15', total_energy_kwh: 16.0, avg_power_real:  666.7, max_power_real: 2333, min_power_real: 86.7, avg_voltage: 221.8, avg_current: 3.404, avg_power_factor: 0.88, peak_hour: 20, reading_count: 1440 }, // Wed
    { date: '2026-04-16', total_energy_kwh: 15.6, avg_power_real:  650.0, max_power_real: 2275, min_power_real: 84.5, avg_voltage: 221.5, avg_current: 3.322, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 }, // Thu
    // Apr 17–21: very low — tenant away (verified 659.0→662.6 = 3.6 kWh over 4.5 days)
    { date: '2026-04-17', total_energy_kwh:  0.9, avg_power_real:   37.5, max_power_real:  131, min_power_real:  4.9, avg_voltage: 220.5, avg_current: 0.194, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 }, // Fri
    { date: '2026-04-18', total_energy_kwh:  0.8, avg_power_real:   33.3, max_power_real:  117, min_power_real:  4.3, avg_voltage: 220.2, avg_current: 0.172, avg_power_factor: 0.88, peak_hour: 10, reading_count: 1440 }, // Sat
    { date: '2026-04-19', total_energy_kwh:  0.9, avg_power_real:   37.5, max_power_real:  131, min_power_real:  4.9, avg_voltage: 220.5, avg_current: 0.194, avg_power_factor: 0.88, peak_hour: 11, reading_count: 1440 }, // Sun
    { date: '2026-04-20', total_energy_kwh:  0.7, avg_power_real:   29.2, max_power_real:  102, min_power_real:  3.8, avg_voltage: 220.2, avg_current: 0.151, avg_power_factor: 0.88, peak_hour: 20, reading_count: 1440 }, // Mon
    { date: '2026-04-21', total_energy_kwh:  0.3, avg_power_real:   25.0, max_power_real:   88, min_power_real:  3.3, avg_voltage: 220.0, avg_current: 0.129, avg_power_factor: 0.88, peak_hour: 10, reading_count:  720 }, // Tue half-day
  ],
};

// Totals for billing (Apr 10 – Apr 17 only — verified CKS meter delta)
// 001 Reynie:  3416.0 → 3433.3 = 17.3 kWh
// 002 Sophie:  4703.0 → 4754.0 = 51.0 kWh
// 003 PAD-3:   placeholder ~39.8 kWh (unassigned, not billed)
// 004 Jassy:    542.9 →  659.0 = 116.1 kWh
const ENERGY_TOTALS: Record<string, number> = {
  'bluewatt-001':  17.3,
  'bluewatt-002':  51.0,
  'bluewatt-003':  39.8,
  'bluewatt-004': 116.1,
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
      `  ✓ Power data seeded: ${p.device_serial}  |  Mar 11 – Apr 21  |  ` +
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
         'Monthly tenant — check-in March 11 2026', adminId]
      );
      stayId = stayResult.insertId;
      console.log(`  ✓ Stay created: ${p.tenant_email} @ ${p.name}  |  ₱${p.flat_rate}/mo + ₱${p.rate_per_kwh}/kWh`);
    }

    // Billing — cycle 1: Apr 10 → Apr 17, two separate bills (electricity + rent)
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
         VALUES (?, ?, ?, '2026-04-10', '2026-04-17', ?, ?, ?, 0, 1, 'electricity', '2026-04-24', 'unpaid')`,
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
         VALUES (?, ?, ?, '2026-04-10', '2026-04-17', 0, 0, ?, ?, 1, 'rent', '2026-04-24', 'unpaid')`,
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
  console.log('\n🌱  BlueWatt Seeder — Real Meter Data (Mar 11 – Apr 21 2026)\n');
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

    console.log('\n⚡  Seeding power aggregates (Mar 11 – Apr 21)...');
    await seedPowerAggregates();

    console.log('\n🏨  Seeding stays & billing (cycle 1: Apr 10 – Apr 17)...');
    await seedStaysAndBilling();

    console.log('\n✅  Seed complete.\n');
    console.log('─────────────────────────────────────────────────────────────────────');
    console.log('  Admin:   admin@bluewatt.local  /  Admin@1234');
    console.log('  Reynie:  reynie-proto@test.com  /  Tenant@1234  →  PAD-1 (bluewatt-001)');
    console.log('  Sophie:  sophie-proto@test.com  /  Tenant@1234  →  PAD-2 (bluewatt-002)');
    console.log('  Jassy:   jassy-proto@test.com   /  Tenant@1234  →  PAD-4 (bluewatt-004)');
    console.log('─────────────────────────────────────────────────────────────────────');
    console.log('  Rate: ₱11.35/kWh | Check-in: March 11 2026 | Billing: Apr 10 – Apr 17');
    console.log('─────────────────────────────────────────────────────────────────────');
    console.log(`  Reynie (PAD-1):   17.3 kWh × ₱11.35 =  ₱196.36  + ₱2,000  = ₱2,196.36`);
    console.log(`  Sophie (PAD-2):   51.0 kWh × ₱11.35 =  ₱578.85  + ₱2,500  = ₱3,078.85`);
    console.log(`  Jassy  (PAD-4):  116.1 kWh × ₱11.35 = ₱1,317.74  + ₱2,000  = ₱3,317.74`);
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
