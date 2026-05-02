/**
 * BlueWatt Database Seeder — Real Meter Data
 * Run: npm run seed
 *
 * Seeds:
 *  - Cleanses all data, keeps admin account
 *  - 3 real tenants: Sophie (PAD-1), Reynie (PAD-3), Jassy (PAD-4)
 *  - 4 devices (bluewatt-001/002/003/004); PAD-2 inactive relay=off no tenant
 *  - Daily power aggregates Mar 11 – May 1 (CKS spreadsheet + Apr 29–May 1 2nd attempt)
 *  - CKS meter readings:
 *      Sophie PAD-1 (#2020351146): Mar11=4515.7 → Apr26≈4829.7 kWh  (048297 display)
 *      PAD-2  inactive (relay off): voltage fluctuates 210–241 V  avg≈3.61/day
 *      Reynie PAD-3 (#2020351142): Mar11=3340.8 → Apr26=3466.5 kWh  (034665 display)
 *      Jassy  PAD-4 (#2020351141): Mar11=6184.2 → Apr26=6679.4 kWh  (066794 display)
 *  - Apr 10–26 daily deltas distributed from Apr 26 meter photos; Apr 27+ from live ESP
 *  - Rate: ₱11.35/kWh | Check-in: March 11 2026
 */

import { pool } from '../connection';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

// ── Credentials ───────────────────────────────────────────────────────────────

const TENANTS = [
  { email: 'reynie-proto@test.com', password: 'Tenant@1234', full_name: 'Reynie Tapnio' },
  { email: 'sophie-proto@test.com', password: 'Tenant@1234', full_name: 'Sophie Garcia' },
  { email: 'jassy-proto@test.com', password: 'Tenant@1234', full_name: 'Jassy Halt' },
];

const DEVICES = [
  {
    device_id: 'bluewatt-001',
    device_name: 'PAD-1 Meter',
    location: 'Unit PAD-1',
    description: 'ESP32 meter — Sophie (CKS #2020351146)',
  },
  {
    device_id: 'bluewatt-002',
    device_name: 'PAD-2 Meter',
    location: 'Unit PAD-2',
    description: 'ESP32 meter — PAD-2 (inactive, relay off)',
  },
  {
    device_id: 'bluewatt-003',
    device_name: 'PAD-3 Meter',
    location: 'Unit PAD-3',
    description: 'ESP32 meter — Reynie (CKS #2020351142)',
  },
  {
    device_id: 'bluewatt-004',
    device_name: 'PAD-4 Meter',
    location: 'Unit PAD-4',
    description: 'ESP32 meter — Jassy  (CKS #2020351141)',
  },
];

const PADS = [
  {
    name: 'PAD-1',
    description: 'Sophie Garcia unit',
    device_serial: 'bluewatt-001',
    tenant_email: 'sophie-proto@test.com',
    rate_per_kwh: 11.98,
    flat_rate: 0,
    is_active: true,
  },
  {
    name: 'PAD-2',
    description: 'Inactive unit',
    device_serial: 'bluewatt-002',
    tenant_email: null,
    rate_per_kwh: 11.98,
    flat_rate: 0,
    is_active: false,
  },
  {
    name: 'PAD-3',
    description: 'Reynie Tapnio unit',
    device_serial: 'bluewatt-003',
    tenant_email: 'reynie-proto@test.com',
    rate_per_kwh: 11.98,
    flat_rate: 0,
    is_active: true,
  },
  {
    name: 'PAD-4',
    description: 'Jassy Halt unit',
    device_serial: 'bluewatt-004',
    tenant_email: 'jassy-proto@test.com',
    rate_per_kwh: 11.98,
    flat_rate: 0,
    is_active: true,
  },
];

const CHECK_IN = new Date('2026-03-11T00:00:00');

const DEVICE_KEYS: { device_serial: string; api_key: string }[] = [];

// ── Daily power data ──────────────────────────────────────────────────────────
// Mar 11–Apr 9 (30 days) — exact per-day deltas from CKS spreadsheet.
// avg_power_real = total_energy_kwh * 1000 / 24
// max_power_real ≈ avg * 3.5  |  min_power_real ≈ avg * 0.13
// avg_current    = avg_power_real / (avg_voltage * avg_power_factor)
//
// Sophie (001): 47-day total = 319.27 kWh  avg = 6.79/day
// PAD-2  (002): 47-day total ≈ 169.8 kWh  avg ≈ 3.61/day  (inactive, relay off, volt 210–241)
// Reynie (003): 47-day total = 128.00 kWh  avg = 2.72/day
// Jassy  (004): 47-day total = 507.10 kWh  avg = 10.79/day

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
  // ── Sophie (PAD-1, bluewatt-001) ──────────────────────────────────────────
  // Exact CKS spreadsheet daily deltas Mar 11–Apr 9; Apr 10–26 from meter photo
  // 47-day total: 319.27 kWh  avg: 6.79/day
  'bluewatt-001': [
    {
      date: '2026-03-11',
      total_energy_kwh: 0.0,
      avg_power_real: 0,
      max_power_real: 0,
      min_power_real: 0,
      avg_voltage: 222.0,
      avg_current: 0,
      avg_power_factor: 0.87,
      peak_hour: 0,
      reading_count: 0,
    }, // starting reading — no prior day to diff from
    {
      date: '2026-03-12',
      total_energy_kwh: 6.22,
      avg_power_real: 259.2,
      max_power_real: 907,
      min_power_real: 33.7,
      avg_voltage: 221.5,
      avg_current: 1.344,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Thu
    {
      date: '2026-03-13',
      total_energy_kwh: 6.13,
      avg_power_real: 255.4,
      max_power_real: 894,
      min_power_real: 33.2,
      avg_voltage: 221.8,
      avg_current: 1.323,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Fri
    {
      date: '2026-03-14',
      total_energy_kwh: 6.7,
      avg_power_real: 279.2,
      max_power_real: 977,
      min_power_real: 36.3,
      avg_voltage: 222.5,
      avg_current: 1.425,
      avg_power_factor: 0.88,
      peak_hour: 14,
      reading_count: 1440,
    }, // Sat
    {
      date: '2026-03-15',
      total_energy_kwh: 6.26,
      avg_power_real: 260.8,
      max_power_real: 913,
      min_power_real: 33.9,
      avg_voltage: 223.0,
      avg_current: 1.33,
      avg_power_factor: 0.88,
      peak_hour: 13,
      reading_count: 1440,
    }, // Sun
    {
      date: '2026-03-16',
      total_energy_kwh: 6.35,
      avg_power_real: 264.6,
      max_power_real: 926,
      min_power_real: 34.4,
      avg_voltage: 221.5,
      avg_current: 1.373,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Mon
    {
      date: '2026-03-17',
      total_energy_kwh: 6.7,
      avg_power_real: 279.2,
      max_power_real: 977,
      min_power_real: 36.3,
      avg_voltage: 222.0,
      avg_current: 1.446,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Tue
    {
      date: '2026-03-18',
      total_energy_kwh: 6.06,
      avg_power_real: 252.5,
      max_power_real: 884,
      min_power_real: 32.8,
      avg_voltage: 222.0,
      avg_current: 1.308,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Wed
    {
      date: '2026-03-19',
      total_energy_kwh: 6.06,
      avg_power_real: 252.5,
      max_power_real: 884,
      min_power_real: 32.8,
      avg_voltage: 221.8,
      avg_current: 1.309,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Thu
    {
      date: '2026-03-20',
      total_energy_kwh: 6.18,
      avg_power_real: 257.5,
      max_power_real: 901,
      min_power_real: 33.5,
      avg_voltage: 222.0,
      avg_current: 1.334,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Fri
    {
      date: '2026-03-21',
      total_energy_kwh: 6.47,
      avg_power_real: 269.6,
      max_power_real: 944,
      min_power_real: 35.0,
      avg_voltage: 222.5,
      avg_current: 1.377,
      avg_power_factor: 0.88,
      peak_hour: 14,
      reading_count: 1440,
    }, // Sat
    {
      date: '2026-03-22',
      total_energy_kwh: 6.13,
      avg_power_real: 255.4,
      max_power_real: 894,
      min_power_real: 33.2,
      avg_voltage: 223.0,
      avg_current: 1.302,
      avg_power_factor: 0.88,
      peak_hour: 13,
      reading_count: 1440,
    }, // Sun
    {
      date: '2026-03-23',
      total_energy_kwh: 6.09,
      avg_power_real: 253.8,
      max_power_real: 888,
      min_power_real: 33.0,
      avg_voltage: 221.5,
      avg_current: 1.317,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Mon
    {
      date: '2026-03-24',
      total_energy_kwh: 6.46,
      avg_power_real: 269.2,
      max_power_real: 942,
      min_power_real: 35.0,
      avg_voltage: 221.8,
      avg_current: 1.395,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Tue
    {
      date: '2026-03-25',
      total_energy_kwh: 6.21,
      avg_power_real: 258.8,
      max_power_real: 906,
      min_power_real: 33.6,
      avg_voltage: 221.8,
      avg_current: 1.341,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Wed
    {
      date: '2026-03-26',
      total_energy_kwh: 6.14,
      avg_power_real: 255.8,
      max_power_real: 895,
      min_power_real: 33.3,
      avg_voltage: 221.5,
      avg_current: 1.328,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Thu
    {
      date: '2026-03-27',
      total_energy_kwh: 6.01,
      avg_power_real: 250.4,
      max_power_real: 876,
      min_power_real: 32.6,
      avg_voltage: 221.8,
      avg_current: 1.298,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Fri
    {
      date: '2026-03-28',
      total_energy_kwh: 6.7,
      avg_power_real: 279.2,
      max_power_real: 977,
      min_power_real: 36.3,
      avg_voltage: 222.5,
      avg_current: 1.425,
      avg_power_factor: 0.88,
      peak_hour: 14,
      reading_count: 1440,
    }, // Sat
    {
      date: '2026-03-29',
      total_energy_kwh: 6.6,
      avg_power_real: 275.0,
      max_power_real: 963,
      min_power_real: 35.8,
      avg_voltage: 223.0,
      avg_current: 1.402,
      avg_power_factor: 0.88,
      peak_hour: 13,
      reading_count: 1440,
    }, // Sun
    {
      date: '2026-03-30',
      total_energy_kwh: 6.42,
      avg_power_real: 267.5,
      max_power_real: 936,
      min_power_real: 34.8,
      avg_voltage: 221.5,
      avg_current: 1.388,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Mon
    {
      date: '2026-03-31',
      total_energy_kwh: 6.71,
      avg_power_real: 279.6,
      max_power_real: 979,
      min_power_real: 36.3,
      avg_voltage: 222.0,
      avg_current: 1.448,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Tue
    {
      date: '2026-04-01',
      total_energy_kwh: 6.04,
      avg_power_real: 251.7,
      max_power_real: 881,
      min_power_real: 32.7,
      avg_voltage: 222.0,
      avg_current: 1.304,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Wed
    {
      date: '2026-04-02',
      total_energy_kwh: 6.55,
      avg_power_real: 272.9,
      max_power_real: 955,
      min_power_real: 35.5,
      avg_voltage: 221.8,
      avg_current: 1.414,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Thu
    {
      date: '2026-04-03',
      total_energy_kwh: 6.25,
      avg_power_real: 260.4,
      max_power_real: 911,
      min_power_real: 33.9,
      avg_voltage: 222.0,
      avg_current: 1.349,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Fri
    {
      date: '2026-04-04',
      total_energy_kwh: 6.73,
      avg_power_real: 280.4,
      max_power_real: 981,
      min_power_real: 36.5,
      avg_voltage: 222.5,
      avg_current: 1.432,
      avg_power_factor: 0.88,
      peak_hour: 14,
      reading_count: 1440,
    }, // Sat
    {
      date: '2026-04-05',
      total_energy_kwh: 6.01,
      avg_power_real: 250.4,
      max_power_real: 876,
      min_power_real: 32.6,
      avg_voltage: 223.0,
      avg_current: 1.277,
      avg_power_factor: 0.88,
      peak_hour: 13,
      reading_count: 1440,
    }, // Sun
    {
      date: '2026-04-06',
      total_energy_kwh: 6.57,
      avg_power_real: 273.8,
      max_power_real: 958,
      min_power_real: 35.6,
      avg_voltage: 222.0,
      avg_current: 1.418,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Mon
    {
      date: '2026-04-07',
      total_energy_kwh: 6.6,
      avg_power_real: 275.0,
      max_power_real: 963,
      min_power_real: 35.8,
      avg_voltage: 221.8,
      avg_current: 1.425,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Tue
    {
      date: '2026-04-08',
      total_energy_kwh: 6.07,
      avg_power_real: 252.9,
      max_power_real: 885,
      min_power_real: 32.9,
      avg_voltage: 221.5,
      avg_current: 1.312,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Wed
    {
      date: '2026-04-09',
      total_energy_kwh: 6.19,
      avg_power_real: 257.9,
      max_power_real: 903,
      min_power_real: 33.5,
      avg_voltage: 221.2,
      avg_current: 1.34,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Thu
    {
      date: '2026-04-10',
      total_energy_kwh: 6.5,
      avg_power_real: 270.8,
      max_power_real: 948,
      min_power_real: 35.2,
      avg_voltage: 221.8,
      avg_current: 1.403,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Fri
    {
      date: '2026-04-11',
      total_energy_kwh: 8.1,
      avg_power_real: 337.5,
      max_power_real: 1181,
      min_power_real: 43.9,
      avg_voltage: 222.5,
      avg_current: 1.724,
      avg_power_factor: 0.88,
      peak_hour: 14,
      reading_count: 1440,
    }, // Sat
    {
      date: '2026-04-12',
      total_energy_kwh: 7.8,
      avg_power_real: 325.0,
      max_power_real: 1138,
      min_power_real: 42.3,
      avg_voltage: 223.0,
      avg_current: 1.657,
      avg_power_factor: 0.88,
      peak_hour: 13,
      reading_count: 1440,
    }, // Sun
    {
      date: '2026-04-13',
      total_energy_kwh: 7.6,
      avg_power_real: 316.7,
      max_power_real: 1108,
      min_power_real: 41.2,
      avg_voltage: 221.5,
      avg_current: 1.643,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Mon
    {
      date: '2026-04-14',
      total_energy_kwh: 7.65,
      avg_power_real: 318.8,
      max_power_real: 1116,
      min_power_real: 41.4,
      avg_voltage: 221.8,
      avg_current: 1.652,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Tue
    {
      date: '2026-04-15',
      total_energy_kwh: 7.5,
      avg_power_real: 312.5,
      max_power_real: 1094,
      min_power_real: 40.6,
      avg_voltage: 221.5,
      avg_current: 1.622,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Wed
    {
      date: '2026-04-16',
      total_energy_kwh: 7.6,
      avg_power_real: 316.7,
      max_power_real: 1108,
      min_power_real: 41.2,
      avg_voltage: 221.2,
      avg_current: 1.645,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Thu
    {
      date: '2026-04-17',
      total_energy_kwh: 7.37,
      avg_power_real: 307.1,
      max_power_real: 1075,
      min_power_real: 39.9,
      avg_voltage: 221.5,
      avg_current: 1.594,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Fri
    {
      date: '2026-04-18',
      total_energy_kwh: 8.05,
      avg_power_real: 335.4,
      max_power_real: 1174,
      min_power_real: 43.6,
      avg_voltage: 222.5,
      avg_current: 1.713,
      avg_power_factor: 0.88,
      peak_hour: 14,
      reading_count: 1440,
    }, // Sat
    {
      date: '2026-04-19',
      total_energy_kwh: 7.75,
      avg_power_real: 322.9,
      max_power_real: 1130,
      min_power_real: 42.0,
      avg_voltage: 223.0,
      avg_current: 1.646,
      avg_power_factor: 0.88,
      peak_hour: 13,
      reading_count: 1440,
    }, // Sun
    {
      date: '2026-04-20',
      total_energy_kwh: 7.65,
      avg_power_real: 318.8,
      max_power_real: 1116,
      min_power_real: 41.4,
      avg_voltage: 221.5,
      avg_current: 1.655,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Mon
    {
      date: '2026-04-21',
      total_energy_kwh: 7.58,
      avg_power_real: 315.8,
      max_power_real: 1105,
      min_power_real: 41.1,
      avg_voltage: 222.0,
      avg_current: 1.635,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Tue
    {
      date: '2026-04-22',
      total_energy_kwh: 7.47,
      avg_power_real: 311.3,
      max_power_real: 1090,
      min_power_real: 40.5,
      avg_voltage: 221.8,
      avg_current: 1.614,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Wed
    {
      date: '2026-04-23',
      total_energy_kwh: 7.58,
      avg_power_real: 315.8,
      max_power_real: 1105,
      min_power_real: 41.1,
      avg_voltage: 221.5,
      avg_current: 1.639,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Thu
    {
      date: '2026-04-24',
      total_energy_kwh: 7.45,
      avg_power_real: 310.4,
      max_power_real: 1087,
      min_power_real: 40.4,
      avg_voltage: 221.2,
      avg_current: 1.613,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Fri
    {
      date: '2026-04-25',
      total_energy_kwh: 8.05,
      avg_power_real: 335.4,
      max_power_real: 1174,
      min_power_real: 43.6,
      avg_voltage: 222.5,
      avg_current: 1.713,
      avg_power_factor: 0.88,
      peak_hour: 14,
      reading_count: 1440,
    }, // Sat
    {
      date: '2026-04-26',
      total_energy_kwh: 7.74,
      avg_power_real: 322.5,
      max_power_real: 1129,
      min_power_real: 41.9,
      avg_voltage: 223.0,
      avg_current: 1.644,
      avg_power_factor: 0.88,
      peak_hour: 13,
      reading_count: 1440,
    }, // Sun
    {
      date: '2026-04-27',
      total_energy_kwh: 7.70,
      avg_power_real: 320.8,
      max_power_real: 1123,
      min_power_real: 41.7,
      avg_voltage: 222.5,
      avg_current: 1.635,
      avg_power_factor: 0.88,
      peak_hour: 20,
      reading_count: 1440,
    }, // Mon est (−0.52% vs Apr 26)
    {
      date: '2026-04-28',
      total_energy_kwh: 7.69,
      avg_power_real: 320.4,
      max_power_real: 1122,
      min_power_real: 41.6,
      avg_voltage: 222.5,
      avg_current: 1.633,
      avg_power_factor: 0.88,
      peak_hour: 20,
      reading_count: 1440,
    }, // Tue est (−0.65% vs Apr 26)
    {
      date: '2026-04-29',
      total_energy_kwh: 0.0,
      avg_power_real: 0,
      max_power_real: 0,
      min_power_real: 0,
      avg_voltage: 222.0,
      avg_current: 0,
      avg_power_factor: 0.88,
      peak_hour: 0,
      reading_count: 0,
    }, // Wed — new measurement baseline
    {
      date: '2026-04-30',
      total_energy_kwh: 10.29,
      avg_power_real: 428.8,
      max_power_real: 1501,
      min_power_real: 55.7,
      avg_voltage: 222.0,
      avg_current: 2.194,
      avg_power_factor: 0.88,
      peak_hour: 20,
      reading_count: 1440,
    }, // Thu — CKS 2nd attempt 11:36am
    {
      date: '2026-05-01',
      total_energy_kwh: 6.76,
      avg_power_real: 281.7,
      max_power_real: 986,
      min_power_real: 36.6,
      avg_voltage: 222.0,
      avg_current: 1.441,
      avg_power_factor: 0.88,
      peak_hour: 19,
      reading_count: 1440,
    }, // Fri — CKS 2nd attempt 11:36am
  ],

  // ── PAD-2 (bluewatt-002) — inactive, relay off, voltage fluctuates 210–241 V ─
  // No tenant. Relay is off. Meter still records line voltage + residual draw.
  // 47-day total ≈ 169.8 kWh  avg: 3.61/day
  'bluewatt-002': [
    {
      date: '2026-03-11',
      total_energy_kwh: 0.0,
      avg_power_real: 0,
      max_power_real: 0,
      min_power_real: 0,
      avg_voltage: 220.5,
      avg_current: 0,
      avg_power_factor: 0.87,
      peak_hour: 0,
      reading_count: 0,
    }, // starting reading — no prior day to diff from
    {
      date: '2026-03-12',
      total_energy_kwh: 3.81,
      avg_power_real: 158.8,
      max_power_real: 556,
      min_power_real: 20.6,
      avg_voltage: 212.0,
      avg_current: 0.861,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Thu
    {
      date: '2026-03-13',
      total_energy_kwh: 3.24,
      avg_power_real: 135.0,
      max_power_real: 473,
      min_power_real: 17.6,
      avg_voltage: 235.0,
      avg_current: 0.66,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Fri
    {
      date: '2026-03-14',
      total_energy_kwh: 3.98,
      avg_power_real: 165.8,
      max_power_real: 580,
      min_power_real: 21.6,
      avg_voltage: 218.5,
      avg_current: 0.862,
      avg_power_factor: 0.88,
      peak_hour: 14,
      reading_count: 1440,
    }, // Sat
    {
      date: '2026-03-15',
      total_energy_kwh: 4.11,
      avg_power_real: 171.3,
      max_power_real: 599,
      min_power_real: 22.3,
      avg_voltage: 241.0,
      avg_current: 0.808,
      avg_power_factor: 0.88,
      peak_hour: 13,
      reading_count: 1440,
    }, // Sun
    {
      date: '2026-03-16',
      total_energy_kwh: 3.37,
      avg_power_real: 140.4,
      max_power_real: 491,
      min_power_real: 18.3,
      avg_voltage: 215.0,
      avg_current: 0.75,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Mon
    {
      date: '2026-03-17',
      total_energy_kwh: 3.68,
      avg_power_real: 153.3,
      max_power_real: 537,
      min_power_real: 19.9,
      avg_voltage: 230.5,
      avg_current: 0.765,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Tue
    {
      date: '2026-03-18',
      total_energy_kwh: 3.53,
      avg_power_real: 147.1,
      max_power_real: 515,
      min_power_real: 19.1,
      avg_voltage: 213.5,
      avg_current: 0.793,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Wed
    {
      date: '2026-03-19',
      total_energy_kwh: 3.87,
      avg_power_real: 161.3,
      max_power_real: 564,
      min_power_real: 21.0,
      avg_voltage: 238.0,
      avg_current: 0.779,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Thu
    {
      date: '2026-03-20',
      total_energy_kwh: 3.31,
      avg_power_real: 137.9,
      max_power_real: 483,
      min_power_real: 17.9,
      avg_voltage: 220.0,
      avg_current: 0.72,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Fri
    {
      date: '2026-03-21',
      total_energy_kwh: 4.06,
      avg_power_real: 169.2,
      max_power_real: 592,
      min_power_real: 22.0,
      avg_voltage: 211.0,
      avg_current: 0.911,
      avg_power_factor: 0.88,
      peak_hour: 14,
      reading_count: 1440,
    }, // Sat
    {
      date: '2026-03-22',
      total_energy_kwh: 3.74,
      avg_power_real: 155.8,
      max_power_real: 545,
      min_power_real: 20.3,
      avg_voltage: 232.5,
      avg_current: 0.762,
      avg_power_factor: 0.88,
      peak_hour: 13,
      reading_count: 1440,
    }, // Sun
    {
      date: '2026-03-23',
      total_energy_kwh: 3.42,
      avg_power_real: 142.5,
      max_power_real: 499,
      min_power_real: 18.5,
      avg_voltage: 216.0,
      avg_current: 0.758,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Mon
    {
      date: '2026-03-24',
      total_energy_kwh: 3.89,
      avg_power_real: 162.1,
      max_power_real: 567,
      min_power_real: 21.1,
      avg_voltage: 239.0,
      avg_current: 0.78,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Tue
    {
      date: '2026-03-25',
      total_energy_kwh: 3.51,
      avg_power_real: 146.3,
      max_power_real: 512,
      min_power_real: 19.0,
      avg_voltage: 214.5,
      avg_current: 0.784,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Wed
    {
      date: '2026-03-26',
      total_energy_kwh: 3.76,
      avg_power_real: 156.7,
      max_power_real: 548,
      min_power_real: 20.4,
      avg_voltage: 228.0,
      avg_current: 0.79,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Thu
    {
      date: '2026-03-27',
      total_energy_kwh: 3.33,
      avg_power_real: 138.8,
      max_power_real: 486,
      min_power_real: 18.0,
      avg_voltage: 221.0,
      avg_current: 0.722,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Fri
    {
      date: '2026-03-28',
      total_energy_kwh: 4.09,
      avg_power_real: 170.4,
      max_power_real: 596,
      min_power_real: 22.2,
      avg_voltage: 212.0,
      avg_current: 0.913,
      avg_power_factor: 0.88,
      peak_hour: 14,
      reading_count: 1440,
    }, // Sat
    {
      date: '2026-03-29',
      total_energy_kwh: 3.66,
      avg_power_real: 152.5,
      max_power_real: 534,
      min_power_real: 19.8,
      avg_voltage: 236.0,
      avg_current: 0.734,
      avg_power_factor: 0.88,
      peak_hour: 13,
      reading_count: 1440,
    }, // Sun
    {
      date: '2026-03-30',
      total_energy_kwh: 3.45,
      avg_power_real: 143.8,
      max_power_real: 503,
      min_power_real: 18.7,
      avg_voltage: 218.5,
      avg_current: 0.757,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Mon
    {
      date: '2026-03-31',
      total_energy_kwh: 3.82,
      avg_power_real: 159.2,
      max_power_real: 557,
      min_power_real: 20.7,
      avg_voltage: 210.5,
      avg_current: 0.869,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Tue
    {
      date: '2026-04-01',
      total_energy_kwh: 3.29,
      avg_power_real: 137.1,
      max_power_real: 480,
      min_power_real: 17.8,
      avg_voltage: 234.0,
      avg_current: 0.673,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Wed
    {
      date: '2026-04-02',
      total_energy_kwh: 3.93,
      avg_power_real: 163.8,
      max_power_real: 573,
      min_power_real: 21.3,
      avg_voltage: 215.5,
      avg_current: 0.873,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Thu
    {
      date: '2026-04-03',
      total_energy_kwh: 3.54,
      avg_power_real: 147.5,
      max_power_real: 516,
      min_power_real: 19.2,
      avg_voltage: 240.0,
      avg_current: 0.707,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Fri
    {
      date: '2026-04-04',
      total_energy_kwh: 4.16,
      avg_power_real: 173.3,
      max_power_real: 607,
      min_power_real: 22.5,
      avg_voltage: 213.0,
      avg_current: 0.924,
      avg_power_factor: 0.88,
      peak_hour: 14,
      reading_count: 1440,
    }, // Sat
    {
      date: '2026-04-05',
      total_energy_kwh: 3.61,
      avg_power_real: 150.4,
      max_power_real: 526,
      min_power_real: 19.6,
      avg_voltage: 226.0,
      avg_current: 0.756,
      avg_power_factor: 0.88,
      peak_hour: 13,
      reading_count: 1440,
    }, // Sun
    {
      date: '2026-04-06',
      total_energy_kwh: 3.38,
      avg_power_real: 140.8,
      max_power_real: 493,
      min_power_real: 18.3,
      avg_voltage: 211.5,
      avg_current: 0.765,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Mon
    {
      date: '2026-04-07',
      total_energy_kwh: 3.83,
      avg_power_real: 159.6,
      max_power_real: 559,
      min_power_real: 20.7,
      avg_voltage: 238.5,
      avg_current: 0.769,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Tue
    {
      date: '2026-04-08',
      total_energy_kwh: 3.28,
      avg_power_real: 136.7,
      max_power_real: 478,
      min_power_real: 17.8,
      avg_voltage: 222.0,
      avg_current: 0.708,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Wed
    {
      date: '2026-04-09',
      total_energy_kwh: 3.71,
      avg_power_real: 154.6,
      max_power_real: 541,
      min_power_real: 20.1,
      avg_voltage: 214.0,
      avg_current: 0.83,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Thu
    {
      date: '2026-04-10',
      total_energy_kwh: 3.47,
      avg_power_real: 144.6,
      max_power_real: 506,
      min_power_real: 18.8,
      avg_voltage: 218.0,
      avg_current: 0.762,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Fri
    {
      date: '2026-04-11',
      total_energy_kwh: 4.02,
      avg_power_real: 167.5,
      max_power_real: 586,
      min_power_real: 21.8,
      avg_voltage: 213.0,
      avg_current: 0.894,
      avg_power_factor: 0.88,
      peak_hour: 14,
      reading_count: 1440,
    }, // Sat
    {
      date: '2026-04-12',
      total_energy_kwh: 3.68,
      avg_power_real: 153.3,
      max_power_real: 537,
      min_power_real: 19.9,
      avg_voltage: 235.0,
      avg_current: 0.741,
      avg_power_factor: 0.88,
      peak_hour: 13,
      reading_count: 1440,
    }, // Sun
    {
      date: '2026-04-13',
      total_energy_kwh: 3.31,
      avg_power_real: 137.9,
      max_power_real: 483,
      min_power_real: 17.9,
      avg_voltage: 219.0,
      avg_current: 0.724,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Mon
    {
      date: '2026-04-14',
      total_energy_kwh: 3.85,
      avg_power_real: 160.4,
      max_power_real: 561,
      min_power_real: 20.9,
      avg_voltage: 240.5,
      avg_current: 0.766,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Tue
    {
      date: '2026-04-15',
      total_energy_kwh: 3.54,
      avg_power_real: 147.5,
      max_power_real: 516,
      min_power_real: 19.2,
      avg_voltage: 215.5,
      avg_current: 0.787,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Wed
    {
      date: '2026-04-16',
      total_energy_kwh: 3.76,
      avg_power_real: 156.7,
      max_power_real: 548,
      min_power_real: 20.4,
      avg_voltage: 228.5,
      avg_current: 0.788,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Thu
    {
      date: '2026-04-17',
      total_energy_kwh: 3.33,
      avg_power_real: 138.8,
      max_power_real: 486,
      min_power_real: 18.0,
      avg_voltage: 221.5,
      avg_current: 0.72,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Fri
    {
      date: '2026-04-18',
      total_energy_kwh: 4.08,
      avg_power_real: 170.0,
      max_power_real: 595,
      min_power_real: 22.1,
      avg_voltage: 212.5,
      avg_current: 0.909,
      avg_power_factor: 0.88,
      peak_hour: 14,
      reading_count: 1440,
    }, // Sat
    {
      date: '2026-04-19',
      total_energy_kwh: 3.62,
      avg_power_real: 150.8,
      max_power_real: 528,
      min_power_real: 19.6,
      avg_voltage: 237.0,
      avg_current: 0.723,
      avg_power_factor: 0.88,
      peak_hour: 13,
      reading_count: 1440,
    }, // Sun
    {
      date: '2026-04-20',
      total_energy_kwh: 3.44,
      avg_power_real: 143.3,
      max_power_real: 502,
      min_power_real: 18.6,
      avg_voltage: 217.0,
      avg_current: 0.759,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Mon
    {
      date: '2026-04-21',
      total_energy_kwh: 3.87,
      avg_power_real: 161.3,
      max_power_real: 565,
      min_power_real: 21.0,
      avg_voltage: 239.5,
      avg_current: 0.774,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Tue
    {
      date: '2026-04-22',
      total_energy_kwh: 3.25,
      avg_power_real: 135.4,
      max_power_real: 474,
      min_power_real: 17.6,
      avg_voltage: 234.0,
      avg_current: 0.665,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Wed
    {
      date: '2026-04-23',
      total_energy_kwh: 3.91,
      avg_power_real: 162.9,
      max_power_real: 570,
      min_power_real: 21.2,
      avg_voltage: 210.5,
      avg_current: 0.889,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Thu
    {
      date: '2026-04-24',
      total_energy_kwh: 3.51,
      avg_power_real: 146.3,
      max_power_real: 512,
      min_power_real: 19.0,
      avg_voltage: 226.0,
      avg_current: 0.744,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Fri
    {
      date: '2026-04-25',
      total_energy_kwh: 4.05,
      avg_power_real: 168.8,
      max_power_real: 591,
      min_power_real: 21.9,
      avg_voltage: 213.5,
      avg_current: 0.899,
      avg_power_factor: 0.88,
      peak_hour: 14,
      reading_count: 1440,
    }, // Sat
    {
      date: '2026-04-26',
      total_energy_kwh: 3.73,
      avg_power_real: 155.4,
      max_power_real: 544,
      min_power_real: 20.2,
      avg_voltage: 238.0,
      avg_current: 0.742,
      avg_power_factor: 0.88,
      peak_hour: 13,
      reading_count: 1440,
    }, // Sun
    {
      date: '2026-04-27',
      total_energy_kwh: 3.71,
      avg_power_real: 154.6,
      max_power_real: 541,
      min_power_real: 20.1,
      avg_voltage: 228.0,
      avg_current: 0.738,
      avg_power_factor: 0.88,
      peak_hour: 20,
      reading_count: 1440,
    }, // Mon est (−0.54% vs Apr 26)
    {
      date: '2026-04-28',
      total_energy_kwh: 3.71,
      avg_power_real: 154.6,
      max_power_real: 541,
      min_power_real: 20.1,
      avg_voltage: 228.0,
      avg_current: 0.738,
      avg_power_factor: 0.88,
      peak_hour: 20,
      reading_count: 1440,
    }, // Tue est (−0.54% vs Apr 26)
    {
      date: '2026-04-29',
      total_energy_kwh: 0.0,
      avg_power_real: 0,
      max_power_real: 0,
      min_power_real: 0,
      avg_voltage: 224.0,
      avg_current: 0,
      avg_power_factor: 0.88,
      peak_hour: 0,
      reading_count: 0,
    }, // Wed — new measurement baseline
    {
      date: '2026-04-30',
      total_energy_kwh: 3.68,
      avg_power_real: 153.3,
      max_power_real: 537,
      min_power_real: 19.9,
      avg_voltage: 224.0,
      avg_current: 0.754,
      avg_power_factor: 0.88,
      peak_hour: 20,
      reading_count: 1440,
    }, // Thu — CKS 2nd attempt 11:36am
    {
      date: '2026-05-01',
      total_energy_kwh: 3.54,
      avg_power_real: 147.5,
      max_power_real: 516,
      min_power_real: 19.1,
      avg_voltage: 224.0,
      avg_current: 0.726,
      avg_power_factor: 0.88,
      peak_hour: 19,
      reading_count: 1440,
    }, // Fri — CKS 2nd attempt 11:36am
  ],

  // ── Reynie (PAD-3, bluewatt-003) ──────────────────────────────────────────
  // Exact CKS spreadsheet daily deltas Mar 11–Apr 9; Apr 10–26 from meter photo
  // 47-day total: 128.00 kWh  avg: 2.72/day
  'bluewatt-003': [
    {
      date: '2026-03-11',
      total_energy_kwh: 0.0,
      avg_power_real: 0,
      max_power_real: 0,
      min_power_real: 0,
      avg_voltage: 221.0,
      avg_current: 0,
      avg_power_factor: 0.87,
      peak_hour: 0,
      reading_count: 0,
    }, // starting reading — no prior day to diff from
    {
      date: '2026-03-12',
      total_energy_kwh: 2.3,
      avg_power_real: 95.8,
      max_power_real: 335,
      min_power_real: 12.5,
      avg_voltage: 220.8,
      avg_current: 0.499,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Thu
    {
      date: '2026-03-13',
      total_energy_kwh: 2.45,
      avg_power_real: 102.1,
      max_power_real: 357,
      min_power_real: 13.3,
      avg_voltage: 221.2,
      avg_current: 0.53,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Fri
    {
      date: '2026-03-14',
      total_energy_kwh: 2.65,
      avg_power_real: 110.4,
      max_power_real: 386,
      min_power_real: 14.4,
      avg_voltage: 221.5,
      avg_current: 0.566,
      avg_power_factor: 0.88,
      peak_hour: 14,
      reading_count: 1440,
    }, // Sat
    {
      date: '2026-03-15',
      total_energy_kwh: 2.3,
      avg_power_real: 95.8,
      max_power_real: 335,
      min_power_real: 12.5,
      avg_voltage: 222.0,
      avg_current: 0.49,
      avg_power_factor: 0.88,
      peak_hour: 13,
      reading_count: 1440,
    }, // Sun
    {
      date: '2026-03-16',
      total_energy_kwh: 2.6,
      avg_power_real: 108.3,
      max_power_real: 379,
      min_power_real: 14.1,
      avg_voltage: 220.5,
      avg_current: 0.565,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Mon
    {
      date: '2026-03-17',
      total_energy_kwh: 2.3,
      avg_power_real: 95.8,
      max_power_real: 335,
      min_power_real: 12.5,
      avg_voltage: 221.0,
      avg_current: 0.498,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Tue
    {
      date: '2026-03-18',
      total_energy_kwh: 2.6,
      avg_power_real: 108.3,
      max_power_real: 379,
      min_power_real: 14.1,
      avg_voltage: 221.0,
      avg_current: 0.563,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Wed
    {
      date: '2026-03-19',
      total_energy_kwh: 2.55,
      avg_power_real: 106.3,
      max_power_real: 372,
      min_power_real: 13.8,
      avg_voltage: 220.8,
      avg_current: 0.553,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Thu
    {
      date: '2026-03-20',
      total_energy_kwh: 2.4,
      avg_power_real: 100.0,
      max_power_real: 350,
      min_power_real: 13.0,
      avg_voltage: 221.2,
      avg_current: 0.52,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Fri
    {
      date: '2026-03-21',
      total_energy_kwh: 2.45,
      avg_power_real: 102.1,
      max_power_real: 357,
      min_power_real: 13.3,
      avg_voltage: 221.5,
      avg_current: 0.524,
      avg_power_factor: 0.88,
      peak_hour: 14,
      reading_count: 1440,
    }, // Sat
    {
      date: '2026-03-22',
      total_energy_kwh: 2.7,
      avg_power_real: 112.5,
      max_power_real: 394,
      min_power_real: 14.6,
      avg_voltage: 222.0,
      avg_current: 0.576,
      avg_power_factor: 0.88,
      peak_hour: 13,
      reading_count: 1440,
    }, // Sun
    {
      date: '2026-03-23',
      total_energy_kwh: 2.5,
      avg_power_real: 104.2,
      max_power_real: 365,
      min_power_real: 13.5,
      avg_voltage: 220.5,
      avg_current: 0.543,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Mon
    {
      date: '2026-03-24',
      total_energy_kwh: 2.6,
      avg_power_real: 108.3,
      max_power_real: 379,
      min_power_real: 14.1,
      avg_voltage: 221.0,
      avg_current: 0.563,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Tue
    {
      date: '2026-03-25',
      total_energy_kwh: 2.35,
      avg_power_real: 97.9,
      max_power_real: 343,
      min_power_real: 12.7,
      avg_voltage: 221.0,
      avg_current: 0.509,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Wed
    {
      date: '2026-03-26',
      total_energy_kwh: 2.55,
      avg_power_real: 106.3,
      max_power_real: 372,
      min_power_real: 13.8,
      avg_voltage: 220.8,
      avg_current: 0.553,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Thu
    {
      date: '2026-03-27',
      total_energy_kwh: 2.7,
      avg_power_real: 112.5,
      max_power_real: 394,
      min_power_real: 14.6,
      avg_voltage: 221.2,
      avg_current: 0.584,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Fri
    {
      date: '2026-03-28',
      total_energy_kwh: 2.4,
      avg_power_real: 100.0,
      max_power_real: 350,
      min_power_real: 13.0,
      avg_voltage: 221.5,
      avg_current: 0.513,
      avg_power_factor: 0.88,
      peak_hour: 14,
      reading_count: 1440,
    }, // Sat
    {
      date: '2026-03-29',
      total_energy_kwh: 2.55,
      avg_power_real: 106.3,
      max_power_real: 372,
      min_power_real: 13.8,
      avg_voltage: 222.0,
      avg_current: 0.544,
      avg_power_factor: 0.88,
      peak_hour: 13,
      reading_count: 1440,
    }, // Sun
    {
      date: '2026-03-30',
      total_energy_kwh: 2.55,
      avg_power_real: 106.3,
      max_power_real: 372,
      min_power_real: 13.8,
      avg_voltage: 220.5,
      avg_current: 0.554,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Mon
    {
      date: '2026-03-31',
      total_energy_kwh: 2.6,
      avg_power_real: 108.3,
      max_power_real: 379,
      min_power_real: 14.1,
      avg_voltage: 221.0,
      avg_current: 0.563,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Tue
    {
      date: '2026-04-01',
      total_energy_kwh: 2.45,
      avg_power_real: 102.1,
      max_power_real: 357,
      min_power_real: 13.3,
      avg_voltage: 221.0,
      avg_current: 0.531,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Wed
    {
      date: '2026-04-02',
      total_energy_kwh: 2.65,
      avg_power_real: 110.4,
      max_power_real: 386,
      min_power_real: 14.4,
      avg_voltage: 220.8,
      avg_current: 0.574,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Thu
    {
      date: '2026-04-03',
      total_energy_kwh: 2.6,
      avg_power_real: 108.3,
      max_power_real: 379,
      min_power_real: 14.1,
      avg_voltage: 221.2,
      avg_current: 0.563,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Fri
    {
      date: '2026-04-04',
      total_energy_kwh: 2.5,
      avg_power_real: 104.2,
      max_power_real: 365,
      min_power_real: 13.5,
      avg_voltage: 221.5,
      avg_current: 0.535,
      avg_power_factor: 0.88,
      peak_hour: 14,
      reading_count: 1440,
    }, // Sat
    {
      date: '2026-04-05',
      total_energy_kwh: 2.75,
      avg_power_real: 114.6,
      max_power_real: 401,
      min_power_real: 14.9,
      avg_voltage: 222.0,
      avg_current: 0.586,
      avg_power_factor: 0.88,
      peak_hour: 13,
      reading_count: 1440,
    }, // Sun
    {
      date: '2026-04-06',
      total_energy_kwh: 2.55,
      avg_power_real: 106.3,
      max_power_real: 372,
      min_power_real: 13.8,
      avg_voltage: 221.0,
      avg_current: 0.553,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Mon
    {
      date: '2026-04-07',
      total_energy_kwh: 2.55,
      avg_power_real: 106.3,
      max_power_real: 372,
      min_power_real: 13.8,
      avg_voltage: 221.0,
      avg_current: 0.553,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Tue
    {
      date: '2026-04-08',
      total_energy_kwh: 2.55,
      avg_power_real: 106.3,
      max_power_real: 372,
      min_power_real: 13.8,
      avg_voltage: 221.2,
      avg_current: 0.553,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Wed
    {
      date: '2026-04-09',
      total_energy_kwh: 2.7,
      avg_power_real: 112.5,
      max_power_real: 394,
      min_power_real: 14.6,
      avg_voltage: 220.8,
      avg_current: 0.585,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Thu
    {
      date: '2026-04-10',
      total_energy_kwh: 2.6,
      avg_power_real: 108.3,
      max_power_real: 379,
      min_power_real: 14.0,
      avg_voltage: 221.0,
      avg_current: 0.563,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Fri
    {
      date: '2026-04-11',
      total_energy_kwh: 3.2,
      avg_power_real: 133.3,
      max_power_real: 467,
      min_power_real: 17.3,
      avg_voltage: 221.5,
      avg_current: 0.684,
      avg_power_factor: 0.88,
      peak_hour: 14,
      reading_count: 1440,
    }, // Sat
    {
      date: '2026-04-12',
      total_energy_kwh: 3.1,
      avg_power_real: 129.2,
      max_power_real: 452,
      min_power_real: 16.8,
      avg_voltage: 222.0,
      avg_current: 0.661,
      avg_power_factor: 0.88,
      peak_hour: 13,
      reading_count: 1440,
    }, // Sun
    {
      date: '2026-04-13',
      total_energy_kwh: 3.05,
      avg_power_real: 127.1,
      max_power_real: 445,
      min_power_real: 16.5,
      avg_voltage: 221.0,
      avg_current: 0.661,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Mon
    {
      date: '2026-04-14',
      total_energy_kwh: 3.0,
      avg_power_real: 125.0,
      max_power_real: 438,
      min_power_real: 16.3,
      avg_voltage: 221.2,
      avg_current: 0.65,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Tue
    {
      date: '2026-04-15',
      total_energy_kwh: 3.15,
      avg_power_real: 131.3,
      max_power_real: 459,
      min_power_real: 17.1,
      avg_voltage: 221.0,
      avg_current: 0.683,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Wed
    {
      date: '2026-04-16',
      total_energy_kwh: 3.0,
      avg_power_real: 125.0,
      max_power_real: 438,
      min_power_real: 16.3,
      avg_voltage: 220.8,
      avg_current: 0.651,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Thu
    {
      date: '2026-04-17',
      total_energy_kwh: 2.85,
      avg_power_real: 118.8,
      max_power_real: 416,
      min_power_real: 15.4,
      avg_voltage: 221.0,
      avg_current: 0.618,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Fri
    {
      date: '2026-04-18',
      total_energy_kwh: 3.3,
      avg_power_real: 137.5,
      max_power_real: 481,
      min_power_real: 17.9,
      avg_voltage: 221.5,
      avg_current: 0.706,
      avg_power_factor: 0.88,
      peak_hour: 14,
      reading_count: 1440,
    }, // Sat
    {
      date: '2026-04-19',
      total_energy_kwh: 3.1,
      avg_power_real: 129.2,
      max_power_real: 452,
      min_power_real: 16.8,
      avg_voltage: 222.0,
      avg_current: 0.661,
      avg_power_factor: 0.88,
      peak_hour: 13,
      reading_count: 1440,
    }, // Sun
    {
      date: '2026-04-20',
      total_energy_kwh: 3.05,
      avg_power_real: 127.1,
      max_power_real: 445,
      min_power_real: 16.5,
      avg_voltage: 221.0,
      avg_current: 0.661,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Mon
    {
      date: '2026-04-21',
      total_energy_kwh: 3.15,
      avg_power_real: 131.3,
      max_power_real: 459,
      min_power_real: 17.1,
      avg_voltage: 221.2,
      avg_current: 0.682,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Tue
    {
      date: '2026-04-22',
      total_energy_kwh: 3.1,
      avg_power_real: 129.2,
      max_power_real: 452,
      min_power_real: 16.8,
      avg_voltage: 221.0,
      avg_current: 0.672,
      avg_power_factor: 0.87,
      peak_hour: 21,
      reading_count: 1440,
    }, // Wed
    {
      date: '2026-04-23',
      total_energy_kwh: 3.05,
      avg_power_real: 127.1,
      max_power_real: 445,
      min_power_real: 16.5,
      avg_voltage: 220.8,
      avg_current: 0.662,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Thu
    {
      date: '2026-04-24',
      total_energy_kwh: 2.8,
      avg_power_real: 116.7,
      max_power_real: 408,
      min_power_real: 15.2,
      avg_voltage: 221.2,
      avg_current: 0.606,
      avg_power_factor: 0.87,
      peak_hour: 20,
      reading_count: 1440,
    }, // Fri
    {
      date: '2026-04-25',
      total_energy_kwh: 3.2,
      avg_power_real: 133.3,
      max_power_real: 467,
      min_power_real: 17.3,
      avg_voltage: 221.5,
      avg_current: 0.684,
      avg_power_factor: 0.88,
      peak_hour: 14,
      reading_count: 1440,
    }, // Sat
    {
      date: '2026-04-26',
      total_energy_kwh: 3.1,
      avg_power_real: 129.2,
      max_power_real: 452,
      min_power_real: 16.8,
      avg_voltage: 222.0,
      avg_current: 0.661,
      avg_power_factor: 0.88,
      peak_hour: 13,
      reading_count: 1440,
    }, // Sun
    {
      date: '2026-04-27',
      total_energy_kwh: 3.09,
      avg_power_real: 128.8,
      max_power_real: 451,
      min_power_real: 16.7,
      avg_voltage: 221.5,
      avg_current: 0.659,
      avg_power_factor: 0.88,
      peak_hour: 20,
      reading_count: 1440,
    }, // Mon est (−0.32% vs Apr 26)
    {
      date: '2026-04-28',
      total_energy_kwh: 3.08,
      avg_power_real: 128.4,
      max_power_real: 449,
      min_power_real: 16.7,
      avg_voltage: 221.5,
      avg_current: 0.657,
      avg_power_factor: 0.88,
      peak_hour: 20,
      reading_count: 1440,
    }, // Tue est (−0.65% vs Apr 26)
    {
      date: '2026-04-29',
      total_energy_kwh: 0.0,
      avg_power_real: 0,
      max_power_real: 0,
      min_power_real: 0,
      avg_voltage: 221.0,
      avg_current: 0,
      avg_power_factor: 0.88,
      peak_hour: 0,
      reading_count: 0,
    }, // Wed — new measurement baseline
    {
      date: '2026-04-30',
      total_energy_kwh: 1.81,
      avg_power_real: 75.4,
      max_power_real: 264,
      min_power_real: 9.7,
      avg_voltage: 221.0,
      avg_current: 0.386,
      avg_power_factor: 0.88,
      peak_hour: 20,
      reading_count: 1440,
    }, // Thu — CKS 2nd attempt 11:36am
    {
      date: '2026-05-01',
      total_energy_kwh: 2.28,
      avg_power_real: 95.0,
      max_power_real: 332,
      min_power_real: 12.3,
      avg_voltage: 221.0,
      avg_current: 0.487,
      avg_power_factor: 0.88,
      peak_hour: 19,
      reading_count: 1440,
    }, // Fri — CKS 2nd attempt 11:36am
  ],

  // ── Jassy (PAD-4, bluewatt-004) ───────────────────────────────────────────
  // Exact CKS spreadsheet daily deltas Mar 11–Apr 9; Apr 10–26 from meter photo
  // 47-day total: 507.10 kWh  avg: 10.79/day
  'bluewatt-004': [
    {
      date: '2026-03-11',
      total_energy_kwh: 0.0,
      avg_power_real: 0,
      max_power_real: 0,
      min_power_real: 0,
      avg_voltage: 222.0,
      avg_current: 0,
      avg_power_factor: 0.88,
      peak_hour: 0,
      reading_count: 0,
    }, // starting reading — no prior day to diff from
    {
      date: '2026-03-12',
      total_energy_kwh: 11.9,
      avg_power_real: 495.8,
      max_power_real: 1735,
      min_power_real: 64.5,
      avg_voltage: 221.5,
      avg_current: 2.544,
      avg_power_factor: 0.88,
      peak_hour: 20,
      reading_count: 1440,
    }, // Thu
    {
      date: '2026-03-13',
      total_energy_kwh: 11.75,
      avg_power_real: 489.6,
      max_power_real: 1714,
      min_power_real: 63.6,
      avg_voltage: 221.8,
      avg_current: 2.509,
      avg_power_factor: 0.88,
      peak_hour: 21,
      reading_count: 1440,
    }, // Fri
    {
      date: '2026-03-14',
      total_energy_kwh: 12.1,
      avg_power_real: 504.2,
      max_power_real: 1765,
      min_power_real: 65.5,
      avg_voltage: 222.5,
      avg_current: 2.575,
      avg_power_factor: 0.88,
      peak_hour: 14,
      reading_count: 1440,
    }, // Sat
    {
      date: '2026-03-15',
      total_energy_kwh: 11.75,
      avg_power_real: 489.6,
      max_power_real: 1714,
      min_power_real: 63.6,
      avg_voltage: 223.0,
      avg_current: 2.495,
      avg_power_factor: 0.88,
      peak_hour: 13,
      reading_count: 1440,
    }, // Sun
    {
      date: '2026-03-16',
      total_energy_kwh: 12.15,
      avg_power_real: 506.3,
      max_power_real: 1772,
      min_power_real: 65.8,
      avg_voltage: 221.5,
      avg_current: 2.597,
      avg_power_factor: 0.88,
      peak_hour: 21,
      reading_count: 1440,
    }, // Mon
    {
      date: '2026-03-17',
      total_energy_kwh: 11.7,
      avg_power_real: 487.5,
      max_power_real: 1706,
      min_power_real: 63.4,
      avg_voltage: 222.0,
      avg_current: 2.495,
      avg_power_factor: 0.88,
      peak_hour: 20,
      reading_count: 1440,
    }, // Tue
    {
      date: '2026-03-18',
      total_energy_kwh: 12.15,
      avg_power_real: 506.3,
      max_power_real: 1772,
      min_power_real: 65.8,
      avg_voltage: 222.0,
      avg_current: 2.592,
      avg_power_factor: 0.88,
      peak_hour: 21,
      reading_count: 1440,
    }, // Wed
    {
      date: '2026-03-19',
      total_energy_kwh: 11.75,
      avg_power_real: 489.6,
      max_power_real: 1714,
      min_power_real: 63.6,
      avg_voltage: 221.8,
      avg_current: 2.509,
      avg_power_factor: 0.88,
      peak_hour: 21,
      reading_count: 1440,
    }, // Thu
    {
      date: '2026-03-20',
      total_energy_kwh: 12.15,
      avg_power_real: 506.3,
      max_power_real: 1772,
      min_power_real: 65.8,
      avg_voltage: 222.0,
      avg_current: 2.592,
      avg_power_factor: 0.88,
      peak_hour: 20,
      reading_count: 1440,
    }, // Fri
    {
      date: '2026-03-21',
      total_energy_kwh: 11.7,
      avg_power_real: 487.5,
      max_power_real: 1706,
      min_power_real: 63.4,
      avg_voltage: 222.5,
      avg_current: 2.49,
      avg_power_factor: 0.88,
      peak_hour: 14,
      reading_count: 1440,
    }, // Sat
    {
      date: '2026-03-22',
      total_energy_kwh: 12.25,
      avg_power_real: 510.4,
      max_power_real: 1786,
      min_power_real: 66.4,
      avg_voltage: 223.0,
      avg_current: 2.601,
      avg_power_factor: 0.88,
      peak_hour: 13,
      reading_count: 1440,
    }, // Sun
    {
      date: '2026-03-23',
      total_energy_kwh: 11.8,
      avg_power_real: 491.7,
      max_power_real: 1721,
      min_power_real: 63.9,
      avg_voltage: 221.5,
      avg_current: 2.523,
      avg_power_factor: 0.88,
      peak_hour: 21,
      reading_count: 1440,
    }, // Mon
    {
      date: '2026-03-24',
      total_energy_kwh: 11.8,
      avg_power_real: 491.7,
      max_power_real: 1721,
      min_power_real: 63.9,
      avg_voltage: 222.0,
      avg_current: 2.517,
      avg_power_factor: 0.88,
      peak_hour: 20,
      reading_count: 1440,
    }, // Tue
    {
      date: '2026-03-25',
      total_energy_kwh: 12.3,
      avg_power_real: 512.5,
      max_power_real: 1794,
      min_power_real: 66.6,
      avg_voltage: 221.8,
      avg_current: 2.626,
      avg_power_factor: 0.88,
      peak_hour: 21,
      reading_count: 1440,
    }, // Wed
    {
      date: '2026-03-26',
      total_energy_kwh: 11.6,
      avg_power_real: 483.3,
      max_power_real: 1692,
      min_power_real: 62.8,
      avg_voltage: 221.5,
      avg_current: 2.48,
      avg_power_factor: 0.88,
      peak_hour: 21,
      reading_count: 1440,
    }, // Thu
    {
      date: '2026-03-27',
      total_energy_kwh: 12.25,
      avg_power_real: 510.4,
      max_power_real: 1786,
      min_power_real: 66.4,
      avg_voltage: 222.0,
      avg_current: 2.613,
      avg_power_factor: 0.88,
      peak_hour: 20,
      reading_count: 1440,
    }, // Fri
    {
      date: '2026-03-28',
      total_energy_kwh: 11.85,
      avg_power_real: 493.8,
      max_power_real: 1728,
      min_power_real: 64.2,
      avg_voltage: 222.5,
      avg_current: 2.522,
      avg_power_factor: 0.88,
      peak_hour: 14,
      reading_count: 1440,
    }, // Sat
    {
      date: '2026-03-29',
      total_energy_kwh: 12.2,
      avg_power_real: 508.3,
      max_power_real: 1779,
      min_power_real: 66.1,
      avg_voltage: 223.0,
      avg_current: 2.59,
      avg_power_factor: 0.88,
      peak_hour: 13,
      reading_count: 1440,
    }, // Sun
    {
      date: '2026-03-30',
      total_energy_kwh: 11.8,
      avg_power_real: 491.7,
      max_power_real: 1721,
      min_power_real: 63.9,
      avg_voltage: 221.5,
      avg_current: 2.523,
      avg_power_factor: 0.88,
      peak_hour: 21,
      reading_count: 1440,
    }, // Mon
    {
      date: '2026-03-31',
      total_energy_kwh: 12.3,
      avg_power_real: 512.5,
      max_power_real: 1794,
      min_power_real: 66.6,
      avg_voltage: 222.0,
      avg_current: 2.624,
      avg_power_factor: 0.88,
      peak_hour: 20,
      reading_count: 1440,
    }, // Tue
    {
      date: '2026-04-01',
      total_energy_kwh: 11.7,
      avg_power_real: 487.5,
      max_power_real: 1706,
      min_power_real: 63.4,
      avg_voltage: 222.0,
      avg_current: 2.495,
      avg_power_factor: 0.88,
      peak_hour: 21,
      reading_count: 1440,
    }, // Wed
    {
      date: '2026-04-02',
      total_energy_kwh: 12.2,
      avg_power_real: 508.3,
      max_power_real: 1779,
      min_power_real: 66.1,
      avg_voltage: 221.8,
      avg_current: 2.604,
      avg_power_factor: 0.88,
      peak_hour: 21,
      reading_count: 1440,
    }, // Thu
    {
      date: '2026-04-03',
      total_energy_kwh: 11.7,
      avg_power_real: 487.5,
      max_power_real: 1706,
      min_power_real: 63.4,
      avg_voltage: 222.0,
      avg_current: 2.495,
      avg_power_factor: 0.88,
      peak_hour: 20,
      reading_count: 1440,
    }, // Fri
    {
      date: '2026-04-04',
      total_energy_kwh: 12.3,
      avg_power_real: 512.5,
      max_power_real: 1794,
      min_power_real: 66.6,
      avg_voltage: 222.5,
      avg_current: 2.617,
      avg_power_factor: 0.88,
      peak_hour: 14,
      reading_count: 1440,
    }, // Sat
    {
      date: '2026-04-05',
      total_energy_kwh: 11.7,
      avg_power_real: 487.5,
      max_power_real: 1706,
      min_power_real: 63.4,
      avg_voltage: 223.0,
      avg_current: 2.484,
      avg_power_factor: 0.88,
      peak_hour: 13,
      reading_count: 1440,
    }, // Sun
    {
      date: '2026-04-06',
      total_energy_kwh: 12.2,
      avg_power_real: 508.3,
      max_power_real: 1779,
      min_power_real: 66.1,
      avg_voltage: 222.0,
      avg_current: 2.602,
      avg_power_factor: 0.88,
      peak_hour: 20,
      reading_count: 1440,
    }, // Mon
    {
      date: '2026-04-07',
      total_energy_kwh: 11.8,
      avg_power_real: 491.7,
      max_power_real: 1721,
      min_power_real: 63.9,
      avg_voltage: 221.8,
      avg_current: 2.519,
      avg_power_factor: 0.88,
      peak_hour: 21,
      reading_count: 1440,
    }, // Tue
    {
      date: '2026-04-08',
      total_energy_kwh: 12.2,
      avg_power_real: 508.3,
      max_power_real: 1779,
      min_power_real: 66.1,
      avg_voltage: 221.5,
      avg_current: 2.608,
      avg_power_factor: 0.88,
      peak_hour: 20,
      reading_count: 1440,
    }, // Wed
    {
      date: '2026-04-09',
      total_energy_kwh: 11.8,
      avg_power_real: 491.7,
      max_power_real: 1721,
      min_power_real: 63.9,
      avg_voltage: 221.2,
      avg_current: 2.526,
      avg_power_factor: 0.88,
      peak_hour: 21,
      reading_count: 1440,
    }, // Thu
    {
      date: '2026-04-10',
      total_energy_kwh: 11.25,
      avg_power_real: 468.8,
      max_power_real: 1641,
      min_power_real: 60.8,
      avg_voltage: 221.8,
      avg_current: 2.400,
      avg_power_factor: 0.88,
      peak_hour: 21,
      reading_count: 1440,
    }, // Fri
    {
      date: '2026-04-11',
      total_energy_kwh: 8.7,
      avg_power_real: 362.5,
      max_power_real: 1269,
      min_power_real: 47.1,
      avg_voltage: 222.5,
      avg_current: 1.851,
      avg_power_factor: 0.88,
      peak_hour: 14,
      reading_count: 1440,
    }, // Sat
    {
      date: '2026-04-12',
      total_energy_kwh: 9.0,
      avg_power_real: 375.0,
      max_power_real: 1313,
      min_power_real: 48.8,
      avg_voltage: 223.0,
      avg_current: 1.911,
      avg_power_factor: 0.88,
      peak_hour: 13,
      reading_count: 1440,
    }, // Sun
    {
      date: '2026-04-13',
      total_energy_kwh: 8.8,
      avg_power_real: 366.7,
      max_power_real: 1283,
      min_power_real: 47.7,
      avg_voltage: 221.5,
      avg_current: 1.881,
      avg_power_factor: 0.88,
      peak_hour: 21,
      reading_count: 1440,
    }, // Mon
    {
      date: '2026-04-14',
      total_energy_kwh: 8.6,
      avg_power_real: 358.3,
      max_power_real: 1254,
      min_power_real: 46.6,
      avg_voltage: 222.0,
      avg_current: 1.834,
      avg_power_factor: 0.88,
      peak_hour: 21,
      reading_count: 1440,
    }, // Tue
    {
      date: '2026-04-15',
      total_energy_kwh: 8.7,
      avg_power_real: 362.5,
      max_power_real: 1269,
      min_power_real: 47.1,
      avg_voltage: 221.8,
      avg_current: 1.857,
      avg_power_factor: 0.88,
      peak_hour: 21,
      reading_count: 1440,
    }, // Wed
    {
      date: '2026-04-16',
      total_energy_kwh: 8.65,
      avg_power_real: 360.4,
      max_power_real: 1261,
      min_power_real: 46.9,
      avg_voltage: 221.5,
      avg_current: 1.849,
      avg_power_factor: 0.88,
      peak_hour: 20,
      reading_count: 1440,
    }, // Thu
    {
      date: '2026-04-17',
      total_energy_kwh: 8.5,
      avg_power_real: 354.2,
      max_power_real: 1240,
      min_power_real: 46.0,
      avg_voltage: 221.2,
      avg_current: 1.82,
      avg_power_factor: 0.88,
      peak_hour: 20,
      reading_count: 1440,
    }, // Fri
    {
      date: '2026-04-18',
      total_energy_kwh: 8.65,
      avg_power_real: 360.4,
      max_power_real: 1261,
      min_power_real: 46.9,
      avg_voltage: 222.5,
      avg_current: 1.84,
      avg_power_factor: 0.88,
      peak_hour: 14,
      reading_count: 1440,
    }, // Sat
    {
      date: '2026-04-19',
      total_energy_kwh: 8.9,
      avg_power_real: 370.8,
      max_power_real: 1298,
      min_power_real: 48.2,
      avg_voltage: 223.0,
      avg_current: 1.89,
      avg_power_factor: 0.88,
      peak_hour: 13,
      reading_count: 1440,
    }, // Sun
    {
      date: '2026-04-20',
      total_energy_kwh: 8.75,
      avg_power_real: 364.6,
      max_power_real: 1276,
      min_power_real: 47.4,
      avg_voltage: 221.5,
      avg_current: 1.87,
      avg_power_factor: 0.88,
      peak_hour: 21,
      reading_count: 1440,
    }, // Mon
    {
      date: '2026-04-21',
      total_energy_kwh: 8.85,
      avg_power_real: 368.8,
      max_power_real: 1291,
      min_power_real: 47.9,
      avg_voltage: 222.0,
      avg_current: 1.888,
      avg_power_factor: 0.88,
      peak_hour: 21,
      reading_count: 1440,
    }, // Tue
    {
      date: '2026-04-22',
      total_energy_kwh: 8.7,
      avg_power_real: 362.5,
      max_power_real: 1269,
      min_power_real: 47.1,
      avg_voltage: 221.8,
      avg_current: 1.857,
      avg_power_factor: 0.88,
      peak_hour: 21,
      reading_count: 1440,
    }, // Wed
    {
      date: '2026-04-23',
      total_energy_kwh: 8.65,
      avg_power_real: 360.4,
      max_power_real: 1261,
      min_power_real: 46.9,
      avg_voltage: 221.5,
      avg_current: 1.849,
      avg_power_factor: 0.88,
      peak_hour: 20,
      reading_count: 1440,
    }, // Thu
    {
      date: '2026-04-24',
      total_energy_kwh: 8.5,
      avg_power_real: 354.2,
      max_power_real: 1240,
      min_power_real: 46.0,
      avg_voltage: 221.2,
      avg_current: 1.82,
      avg_power_factor: 0.88,
      peak_hour: 20,
      reading_count: 1440,
    }, // Fri
    {
      date: '2026-04-25',
      total_energy_kwh: 9.1,
      avg_power_real: 379.2,
      max_power_real: 1327,
      min_power_real: 49.3,
      avg_voltage: 222.5,
      avg_current: 1.936,
      avg_power_factor: 0.88,
      peak_hour: 14,
      reading_count: 1440,
    }, // Sat
    {
      date: '2026-04-26',
      total_energy_kwh: 8.8,
      avg_power_real: 366.7,
      max_power_real: 1283,
      min_power_real: 47.7,
      avg_voltage: 223.0,
      avg_current: 1.869,
      avg_power_factor: 0.88,
      peak_hour: 13,
      reading_count: 1440,
    }, // Sun
    {
      date: '2026-04-27',
      total_energy_kwh: 8.75,
      avg_power_real: 364.6,
      max_power_real: 1276,
      min_power_real: 47.4,
      avg_voltage: 222.5,
      avg_current: 1.863,
      avg_power_factor: 0.88,
      peak_hour: 20,
      reading_count: 1440,
    }, // Mon est
    {
      date: '2026-04-28',
      total_energy_kwh: 8.75,
      avg_power_real: 364.6,
      max_power_real: 1276,
      min_power_real: 47.4,
      avg_voltage: 222.5,
      avg_current: 1.858,
      avg_power_factor: 0.88,
      peak_hour: 20,
      reading_count: 1440,
    }, // Tue est (−0.57% vs Apr 26)
    {
      date: '2026-04-29',
      total_energy_kwh: 0.0,
      avg_power_real: 0,
      max_power_real: 0,
      min_power_real: 0,
      avg_voltage: 222.0,
      avg_current: 0,
      avg_power_factor: 0.88,
      peak_hour: 0,
      reading_count: 0,
    }, // Wed — new measurement baseline
    {
      date: '2026-04-30',
      total_energy_kwh: 6.23,
      avg_power_real: 259.6,
      max_power_real: 909,
      min_power_real: 33.8,
      avg_voltage: 222.0,
      avg_current: 1.327,
      avg_power_factor: 0.88,
      peak_hour: 20,
      reading_count: 1440,
    }, // Thu — CKS 2nd attempt 11:36am
    {
      date: '2026-05-01',
      total_energy_kwh: 2.29,
      avg_power_real: 95.4,
      max_power_real: 334,
      min_power_real: 12.4,
      avg_voltage: 222.0,
      avg_current: 0.488,
      avg_power_factor: 0.88,
      peak_hour: 19,
      reading_count: 1440,
    }, // Fri — CKS 2nd attempt 11:36am
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
  const [rows] = await pool.execute<any[]>('SELECT id FROM devices WHERE device_id = ?', [
    deviceId,
  ]);
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
    'payments',
    'billing_periods',
    'stays',
    'relay_commands',
    'anomaly_events',
    'power_aggregates_hourly',
    'power_aggregates_daily',
    'power_aggregates_monthly',
    'power_readings',
    'device_keys',
    'payment_qr_codes',
    'pads',
    'devices',
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
    if (existing) {
      console.log(`  ↳ Tenant already exists: ${t.email}`);
      continue;
    }
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
    if (existing) {
      console.log(`  ↳ Device already exists: ${d.device_id}`);
      continue;
    }
    await pool.execute(
      'INSERT INTO devices (owner_id, device_id, device_name, location, description) VALUES (?, ?, ?, ?, ?)',
      [adminId, d.device_id, d.device_name, d.location, d.description]
    );
    console.log(`  ✓ Device created: ${d.device_id}  (${d.device_name})`);
  }
}

// ── Step 3a: Relay overrides ──────────────────────────────────────────────────

async function seedRelayOverrides() {
  // PAD-2 device is inactive — set relay to off so the app reflects this
  await pool.execute(`UPDATE devices SET relay_status = 'off' WHERE device_id = 'bluewatt-002'`);
  console.log('  ✓ bluewatt-002 relay set to off (inactive pad)');
}

// ── Step 3b: Device keys ──────────────────────────────────────────────────────

async function seedDeviceKeys() {
  for (const k of DEVICE_KEYS) {
    const deviceDbId = await getDeviceDbId(k.device_serial);
    if (!deviceDbId) {
      console.log(`  ↳ Device not found: ${k.device_serial} — skipping key`);
      continue;
    }
    await pool.execute(
      'INSERT INTO device_keys (device_id, key_hash, name) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE key_hash = VALUES(key_hash)',
      [deviceDbId, k.api_key, 'Default Key']
    );
    console.log(`  ✓ Device key seeded: ${k.device_serial}`);
  }
  if (DEVICE_KEYS.length === 0) {
    console.log(
      '  ↳ No device keys configured — ESPs will auto-register on first connection (TOFU)'
    );
  }
}

// ── Step 4: Pads ──────────────────────────────────────────────────────────────

async function seedPads() {
  const adminId = await getAdminId();
  if (!adminId) throw new Error('Admin not found');
  for (const p of PADS) {
    const existing = await getPadId(p.name);
    if (existing) {
      console.log(`  ↳ Pad already exists: ${p.name}`);
      continue;
    }
    const deviceDbId = await getDeviceDbId(p.device_serial);
    const tenantId = p.tenant_email ? await getUserId(p.tenant_email) : null;
    if (!deviceDbId) throw new Error(`Device not found: ${p.device_serial}`);
    if (p.tenant_email && !tenantId) throw new Error(`Tenant not found: ${p.tenant_email}`);
    await pool.execute(
      'INSERT INTO pads (owner_id, name, description, rate_per_kwh, device_id, tenant_id, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        adminId,
        p.name,
        p.description,
        p.rate_per_kwh,
        deviceDbId,
        tenantId ?? null,
        p.is_active ? 1 : 0,
      ]
    );
    console.log(
      `  ✓ Pad created: ${p.name}  →  ${p.tenant_email ?? 'unassigned'}  (${p.device_serial}  @  ₱${p.rate_per_kwh}/kWh${p.is_active ? '' : '  [INACTIVE]'})`
    );
  }
}

// ── Step 5: Power aggregates ──────────────────────────────────────────────────

async function seedPowerAggregates() {
  for (const p of PADS) {
    const deviceDbId = await getDeviceDbId(p.device_serial);
    if (!deviceDbId) {
      console.log(`  ↳ Device not found: ${p.device_serial} — skipping`);
      continue;
    }
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
        [
          deviceDbId,
          d.date,
          d.avg_voltage,
          d.avg_current,
          d.avg_power_real,
          d.max_power_real,
          d.min_power_real,
          d.total_energy_kwh,
          d.avg_power_factor,
          d.peak_hour,
          d.reading_count,
        ]
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
      const avgPower = mDays.reduce((s, d) => s + d.avg_power_real, 0) / mDays.length;
      const maxPower = Math.max(...mDays.map((d) => d.max_power_real));
      const avgVolt = mDays.reduce((s, d) => s + d.avg_voltage, 0) / mDays.length;
      const avgPF = mDays.reduce((s, d) => s + d.avg_power_factor, 0) / mDays.length;
      const avgCurr = avgPower / (avgVolt * avgPF);

      await pool.execute(
        `INSERT INTO power_aggregates_monthly
           (device_id, period_month, total_energy_kwh, avg_power_real, max_power_real,
            avg_voltage, avg_current, avg_power_factor, anomaly_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON DUPLICATE KEY UPDATE
           total_energy_kwh = VALUES(total_energy_kwh), avg_power_real = VALUES(avg_power_real),
           max_power_real   = VALUES(max_power_real),   avg_voltage    = VALUES(avg_voltage),
           avg_current      = VALUES(avg_current),      avg_power_factor = VALUES(avg_power_factor)`,
        [
          deviceDbId,
          month,
          totalEnergy.toFixed(3),
          avgPower.toFixed(2),
          maxPower.toFixed(2),
          avgVolt.toFixed(1),
          avgCurr.toFixed(3),
          avgPF.toFixed(2),
        ]
      );
    }

    const totalAll = days.reduce((s, d) => s + d.total_energy_kwh, 0);
    console.log(
      `  ✓ Power data seeded: ${p.device_serial}  |  Mar 11 – May 1  |  ` +
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
    const padId = await getPadId(p.name);
    if (!tenantId) throw new Error(`Tenant not found: ${p.tenant_email}`);
    if (!padId) throw new Error(`Pad not found: ${p.name}`);

    // Stay
    const [existingStay] = await pool.execute<any[]>(
      'SELECT id FROM stays WHERE pad_id = ? AND tenant_id = ?',
      [padId, tenantId]
    );
    if ((existingStay as any[]).length > 0) {
      console.log(`  ↳ Stay already exists: ${p.tenant_email} @ ${p.name}`);
    } else {
      await pool.execute(
        `INSERT INTO stays
           (pad_id, tenant_id, check_in_at, billing_cycle, flat_rate_per_cycle,
            rate_per_kwh, status, notes, created_by)
         VALUES (?, ?, ?, 'monthly', ?, ?, 'active', ?, ?)`,
        [
          padId,
          tenantId,
          CHECK_IN,
          p.flat_rate,
          p.rate_per_kwh,
          'Monthly tenant — check-in March 11 2026',
          adminId,
        ]
      );
      console.log(
        `  ✓ Stay created: ${p.tenant_email} @ ${p.name}  |  ₱${p.flat_rate}/mo + ₱${p.rate_per_kwh}/kWh`
      );
    }
  }
}

// ── Step 7: Billing periods ───────────────────────────────────────────────────

async function seedBillingPeriods() {
  // Cycle 1: 2026-03-11 → 2026-04-11 (complete)
  const cycleStart = new Date('2026-03-11T00:00:00');
  const cycleEnd = new Date('2026-04-10T00:00:00');
  const dueDate = new Date('2026-04-18T00:00:00');

  for (const p of PADS) {
    if (!p.tenant_email) continue;

    const padId = await getPadId(p.name);
    const tenantId = await getUserId(p.tenant_email);
    if (!padId || !tenantId) continue;

    // Get stay id
    const [stayRows] = await pool.execute<any[]>(
      'SELECT id FROM stays WHERE pad_id = ? AND tenant_id = ?',
      [padId, tenantId]
    );
    if (!(stayRows as any[]).length) continue;
    const stayId = (stayRows as any[])[0].id;

    // Get device db id
    const [devRows] = await pool.execute<any[]>(
      'SELECT d.id FROM devices d JOIN pads p ON p.device_id = d.id WHERE p.id = ?',
      [padId]
    );
    const deviceDbId: number | null = (devRows as any[]).length ? (devRows as any[])[0].id : null;

    // Sum energy from aggregates (Mar 11 – Apr 10 inclusive)
    let energyKwh = 0;
    if (deviceDbId) {
      const [eRows] = await pool.execute<any[]>(
        `SELECT COALESCE(SUM(total_energy_kwh), 0) AS total
         FROM power_aggregates_daily
         WHERE device_id = ? AND date BETWEEN '2026-03-11' AND '2026-04-10'`,
        [deviceDbId]
      );
      energyKwh = parseFloat((eRows as any[])[0].total) || 0;
    }

    const energyAmount = parseFloat((energyKwh * p.rate_per_kwh).toFixed(2));

    // Electricity bill (cycle 1) — insert or fix if previously generated as 0.00
    const [exElec] = await pool.execute<any[]>(
      'SELECT id, amount_due FROM billing_periods WHERE stay_id = ? AND cycle_number = 1 AND bill_type = ?',
      [stayId, 'electricity']
    );
    if (!(exElec as any[]).length) {
      await pool.execute(
        `INSERT INTO billing_periods
           (pad_id, stay_id, tenant_id, period_start, period_end,
            energy_kwh, rate_per_kwh, amount_due, flat_amount, cycle_number, bill_type, due_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 'electricity', ?)`,
        [padId, stayId, tenantId, cycleStart, cycleEnd, energyKwh, p.rate_per_kwh, energyAmount, dueDate]
      );
      console.log(
        `  ✓ Electricity bill: ${p.tenant_email}  |  ${energyKwh.toFixed(2)} kWh  |  ₱${energyAmount}`
      );
    } else if (parseFloat((exElec as any[])[0].amount_due) === 0 && energyAmount > 0) {
      await pool.execute(
        `UPDATE billing_periods SET energy_kwh = ?, rate_per_kwh = ?, amount_due = ? WHERE id = ?`,
        [energyKwh, p.rate_per_kwh, energyAmount, (exElec as any[])[0].id]
      );
      console.log(
        `  ↻ Fixed 0.00 elec:  ${p.tenant_email}  |  ${energyKwh.toFixed(2)} kWh  |  ₱${energyAmount}`
      );
    }

  }
}

// ── Step 8: Anomaly events ────────────────────────────────────────────────────

async function seedAnomalyEvents() {
  const adminId = await getAdminId();
  const deviceDbId = await getDeviceDbId('bluewatt-004');
  if (!deviceDbId || !adminId) throw new Error('PAD-4 device or admin not found');

  await pool.execute(
    `INSERT INTO anomaly_events
       (device_id, timestamp, anomaly_type, severity,
        current_value, voltage_value, power_value,
        relay_tripped, is_resolved, resolved_at, resolved_by)
     VALUES (?, '2026-04-28 02:06:00', 'short_circuit', 'critical', 52.4, 198.5, 10405.4, 1, 1, '2026-04-28 02:36:00', ?)`,
    [deviceDbId, adminId]
  );
  console.log('  ✓ Anomaly seeded: PAD-4 short_circuit  |  2026-04-28 10:06 PHT  →  resolved 10:36');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🌱  BlueWatt Seeder — Real Meter Data (Mar 11 – May 1 2026)\n');
  try {
    console.log('🗑️   Cleansing database (keeping admin)...');
    await cleanseDatabase();

    console.log('\n👤  Seeding tenants...');
    await seedTenants();

    console.log('\n📡  Seeding devices...');
    await seedDevices();

    console.log('\n🔌  Setting relay overrides...');
    await seedRelayOverrides();

    console.log('\n🔑  Seeding device keys...');
    await seedDeviceKeys();

    console.log('\n🏠  Seeding pads...');
    await seedPads();

    console.log('\n⚡  Seeding power aggregates (Mar 11 – May 1)...');
    await seedPowerAggregates();

    console.log('\n🏨  Seeding stays...');
    await seedStaysAndBilling();

    console.log('\n💰  Seeding billing periods (cycle 1: Mar 11 – Apr 10)...');
    await seedBillingPeriods();

    console.log('\n⚠️   Seeding anomaly events...');
    await seedAnomalyEvents();

    console.log('\n✅  Seed complete.\n');
    console.log('─────────────────────────────────────────────────────────────────────');
    console.log('  Admin:   admin@bluewatt.local  /  Admin@1234');
    console.log('  Sophie:  sophie-proto@test.com  /  Tenant@1234  →  PAD-1 (bluewatt-001)');
    console.log('  PAD-2:   [no tenant]  bluewatt-002  inactive, relay=off');
    console.log('  Reynie:  reynie-proto@test.com  /  Tenant@1234  →  PAD-3 (bluewatt-003)');
    console.log('  Jassy:   jassy-proto@test.com   /  Tenant@1234  →  PAD-4 (bluewatt-004)');
    console.log('─────────────────────────────────────────────────────────────────────');
    console.log('  Rate: ₱11.98/kWh | Check-in: March 11 2026 | Data: Mar 11 – May 1');
    console.log('  Billing cycle 1 (Mar 11 – Apr 10): electricity only. No rent billing.');
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
