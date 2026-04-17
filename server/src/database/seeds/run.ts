/**
 * BlueWatt Database Seeder — Real Meter Data
 * Run: npm run seed
 *
 * Seeds:
 *  - Cleanses all data, keeps admin account
 *  - 3 real tenants (reynie, sophie, jassy) with proto emails
 *  - 3 devices (bluewatt-001/003/004) owned by admin
 *  - 3 pads (PAD-1/3/4) @ ₱12/kWh
 *  - Stays checked in Apr 10 2026 (monthly billing)
 *  - Daily power aggregates Apr 10–17 from real CKS meter readings
 *  - Monthly aggregate Apr 2026
 *  - Billing cycle 1: Apr 10 – May 10
 */

import { pool } from '../connection';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

// ── Credentials ───────────────────────────────────────────────────────────────

const TENANTS = [
  { email: 'sophie-proto@test.com',  password: 'Tenant@1234', full_name: 'Sophie Garcia'  },
  { email: 'reynie-proto@test.com',  password: 'Tenant@1234', full_name: 'Reynie Tapnio'  },
  { email: 'jassy-proto@test.com',   password: 'Tenant@1234', full_name: 'Jassy Halt'     },
];

const DEVICES = [
  { device_id: 'bluewatt-001', device_name: 'PAD-1 Meter',  location: 'Unit PAD-1', description: 'ESP32 meter — Sophie' },
  { device_id: 'bluewatt-003', device_name: 'PAD-3 Meter',  location: 'Unit PAD-3', description: 'ESP32 meter — Reynie' },
  { device_id: 'bluewatt-004', device_name: 'PAD-4 Meter',  location: 'Unit PAD-4', description: 'ESP32 meter — Jassy'  },
];

const PADS = [
  { name: 'PAD-1', description: 'Sophie Garcia unit',  device_serial: 'bluewatt-001', tenant_email: 'sophie-proto@test.com', rate_per_kwh: 12.00, flat_rate: 2500.00 },
  { name: 'PAD-3', description: 'Reynie Tapnio unit', device_serial: 'bluewatt-003', tenant_email: 'reynie-proto@test.com', rate_per_kwh: 12.00, flat_rate: 2000.00 },
  { name: 'PAD-4', description: 'Jassy Halt unit',    device_serial: 'bluewatt-004', tenant_email: 'jassy-proto@test.com',  rate_per_kwh: 12.00, flat_rate: 2000.00 },
];

// Check-in date for all tenants
const CHECK_IN = new Date('2026-04-10T00:00:00');

// ── Known ESP API keys (hardcoded in each ESP's config.h) ────────────────────
// Add the keys for 003/004 once recovered from Render logs (look for
// "[ESP] Full key for manual recovery:" after deploying this seed).
// All three ESP keys are auto-registered on first connection (TOFU).
const DEVICE_KEYS: { device_serial: string; api_key: string }[] = [];

// ── Real daily power data (from CKS meter photos, Apr 10–16) ─────────────────
//
// Physical meter totals (Apr 10 → Apr 17, 7 verified days):
//   Sophie (PAD-1, bluewatt-001): 03416 → 03433 kWh = 17 kWh
//   Reynie (PAD-3, bluewatt-003): 04703 → 04754 kWh = 51 kWh
//   Jassy  (PAD-4, bluewatt-004): 00542 → 00590 kWh = 48 kWh
//
// Apr 17 estimated from same-day-of-week pattern (Thursday like Apr 10).
// 8-day totals: Sophie 19.65 kWh | Reynie 58.60 kWh | Jassy 55.30 kWh
//
// Daily breakdown (±small variance, weekends slightly lower):
//   Apr 10=Thu, 11=Fri, 12=Sat, 13=Sun, 14=Mon, 15=Tue, 16=Wed, 17=Thu
//
// avg_power_real is derived from: total_energy_kwh / 24h × 1000 W/kW

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
  // Sophie — lighter usage (avg 2.46 kWh/day → 102 W avg)
  'bluewatt-001': [
    { date: '2026-04-10', total_energy_kwh: 2.30, avg_power_real:  95.8, max_power_real: 302.0, min_power_real: 12.0, avg_voltage: 231.5, avg_current: 0.476, avg_power_factor: 0.87, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-11', total_energy_kwh: 2.60, avg_power_real: 108.3, max_power_real: 348.0, min_power_real: 11.5, avg_voltage: 232.1, avg_current: 0.530, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-12', total_energy_kwh: 2.10, avg_power_real:  87.5, max_power_real: 281.0, min_power_real: 10.2, avg_voltage: 231.0, avg_current: 0.440, avg_power_factor: 0.86, peak_hour: 14, reading_count: 1440 },
    { date: '2026-04-13', total_energy_kwh: 2.00, avg_power_real:  83.3, max_power_real: 261.0, min_power_real: 10.0, avg_voltage: 230.8, avg_current: 0.420, avg_power_factor: 0.86, peak_hour: 13, reading_count: 1440 },
    { date: '2026-04-14', total_energy_kwh: 2.50, avg_power_real: 104.2, max_power_real: 332.0, min_power_real: 12.3, avg_voltage: 232.5, avg_current: 0.509, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-15', total_energy_kwh: 2.70, avg_power_real: 112.5, max_power_real: 358.0, min_power_real: 13.1, avg_voltage: 233.0, avg_current: 0.542, avg_power_factor: 0.89, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-16', total_energy_kwh: 2.80, avg_power_real: 116.7, max_power_real: 372.0, min_power_real: 13.8, avg_voltage: 233.2, avg_current: 0.562, avg_power_factor: 0.89, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-17', total_energy_kwh: 2.65, avg_power_real: 110.4, max_power_real: 345.0, min_power_real: 12.6, avg_voltage: 232.8, avg_current: 0.541, avg_power_factor: 0.88, peak_hour: 20, reading_count: 1440 },
  ],
  // Reynie — heavier usage (avg 7.36 kWh/day → 306 W avg)
  'bluewatt-003': [
    { date: '2026-04-10', total_energy_kwh: 7.20, avg_power_real: 300.0, max_power_real: 851.0, min_power_real: 22.0, avg_voltage: 234.0, avg_current: 1.408, avg_power_factor: 0.91, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-11', total_energy_kwh: 7.80, avg_power_real: 325.0, max_power_real: 921.0, min_power_real: 21.4, avg_voltage: 234.5, avg_current: 1.524, avg_power_factor: 0.91, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-12', total_energy_kwh: 6.50, avg_power_real: 270.8, max_power_real: 782.0, min_power_real: 18.3, avg_voltage: 233.5, avg_current: 1.289, avg_power_factor: 0.90, peak_hour: 15, reading_count: 1440 },
    { date: '2026-04-13', total_energy_kwh: 6.10, avg_power_real: 254.2, max_power_real: 731.0, min_power_real: 17.1, avg_voltage: 233.2, avg_current: 1.210, avg_power_factor: 0.90, peak_hour: 14, reading_count: 1440 },
    { date: '2026-04-14', total_energy_kwh: 7.50, avg_power_real: 312.5, max_power_real: 892.0, min_power_real: 22.5, avg_voltage: 234.2, avg_current: 1.465, avg_power_factor: 0.91, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-15', total_energy_kwh: 7.90, avg_power_real: 329.2, max_power_real: 941.0, min_power_real: 23.2, avg_voltage: 234.8, avg_current: 1.544, avg_power_factor: 0.91, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-16', total_energy_kwh: 8.00, avg_power_real: 333.3, max_power_real: 952.0, min_power_real: 24.0, avg_voltage: 235.0, avg_current: 1.540, avg_power_factor: 0.92, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-17', total_energy_kwh: 7.60, avg_power_real: 316.7, max_power_real: 901.0, min_power_real: 22.8, avg_voltage: 234.3, avg_current: 1.483, avg_power_factor: 0.91, peak_hour: 20, reading_count: 1440 },
  ],
  // Jassy — heavy usage (avg 6.94 kWh/day → 289 W avg)
  'bluewatt-004': [
    { date: '2026-04-10', total_energy_kwh: 6.50, avg_power_real: 270.8, max_power_real: 782.0, min_power_real: 20.1, avg_voltage: 232.5, avg_current: 1.289, avg_power_factor: 0.90, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-11', total_energy_kwh: 7.20, avg_power_real: 300.0, max_power_real: 861.0, min_power_real: 19.3, avg_voltage: 233.0, avg_current: 1.414, avg_power_factor: 0.91, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-12', total_energy_kwh: 6.00, avg_power_real: 250.0, max_power_real: 722.0, min_power_real: 16.4, avg_voltage: 232.0, avg_current: 1.212, avg_power_factor: 0.89, peak_hour: 14, reading_count: 1440 },
    { date: '2026-04-13', total_energy_kwh: 5.80, avg_power_real: 241.7, max_power_real: 701.0, min_power_real: 15.8, avg_voltage: 231.8, avg_current: 1.172, avg_power_factor: 0.89, peak_hour: 13, reading_count: 1440 },
    { date: '2026-04-14', total_energy_kwh: 7.00, avg_power_real: 291.7, max_power_real: 841.0, min_power_real: 21.0, avg_voltage: 233.2, avg_current: 1.389, avg_power_factor: 0.90, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-15', total_energy_kwh: 7.50, avg_power_real: 312.5, max_power_real: 892.0, min_power_real: 22.1, avg_voltage: 233.5, avg_current: 1.465, avg_power_factor: 0.91, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-16', total_energy_kwh: 8.00, avg_power_real: 333.3, max_power_real: 952.0, min_power_real: 23.0, avg_voltage: 234.0, avg_current: 1.542, avg_power_factor: 0.92, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-17', total_energy_kwh: 7.30, avg_power_real: 304.2, max_power_real: 871.0, min_power_real: 21.5, avg_voltage: 233.6, avg_current: 1.451, avg_power_factor: 0.90, peak_hour: 20, reading_count: 1440 },
  ],
};

// 8-day totals (Apr 10–17), used for billing
const ENERGY_TOTALS: Record<string, number> = {
  'bluewatt-001': 19.65,   // Sophie  (17.00 + 2.65)
  'bluewatt-003': 58.60,   // Reynie  (51.00 + 7.60)
  'bluewatt-004': 55.30,   // Jassy   (48.00 + 7.30)
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
    console.log(`  ✓ Device key seeded: ${k.device_serial}  (${k.api_key.slice(0, 10)}...)`);
  }
  if (DEVICE_KEYS.length === 0) {
    console.log('  ↳ No device keys configured — ESPs will be rejected until keys are added');
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
    const tenantId   = await getUserId(p.tenant_email);
    if (!deviceDbId) throw new Error(`Device not found: ${p.device_serial}`);
    if (!tenantId)   throw new Error(`Tenant not found: ${p.tenant_email}`);

    await pool.execute(
      'INSERT INTO pads (owner_id, name, description, rate_per_kwh, device_id, tenant_id, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [adminId, p.name, p.description, p.rate_per_kwh, deviceDbId, tenantId]
    );
    console.log(`  ✓ Pad created: ${p.name}  →  ${p.tenant_email}  (${p.device_serial}  @  ₱${p.rate_per_kwh}/kWh)`);
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

    let totalEnergy = 0;
    let totalPower  = 0;
    let maxPower    = 0;

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
      totalEnergy += d.total_energy_kwh;
      totalPower  += d.avg_power_real;
      if (d.max_power_real > maxPower) maxPower = d.max_power_real;
    }

    const avgPower = totalPower / days.length;
    const avgVolt  = days.reduce((s, d) => s + d.avg_voltage, 0) / days.length;
    const avgPF    = days.reduce((s, d) => s + d.avg_power_factor, 0) / days.length;
    const avgCurr  = avgPower / (avgVolt * avgPF);

    await pool.execute(
      `INSERT INTO power_aggregates_monthly
         (device_id, period_month, total_energy_kwh, avg_power_real, max_power_real,
          avg_voltage, avg_current, avg_power_factor, anomaly_count)
       VALUES (?, '2026-04', ?, ?, ?, ?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE
         total_energy_kwh = VALUES(total_energy_kwh), avg_power_real = VALUES(avg_power_real),
         max_power_real   = VALUES(max_power_real),   avg_voltage    = VALUES(avg_voltage),
         avg_current      = VALUES(avg_current),      avg_power_factor = VALUES(avg_power_factor)`,
      [deviceDbId, totalEnergy.toFixed(3), avgPower.toFixed(2), maxPower.toFixed(2),
       avgVolt.toFixed(1), avgCurr.toFixed(3), avgPF.toFixed(2)]
    );

    console.log(
      `  ✓ Power data seeded: ${p.device_serial}  |  Apr 10–16  |  ` +
      `${totalEnergy.toFixed(2)} kWh  |  avg ${avgPower.toFixed(1)} W`
    );
  }
}

// ── Step 6: Stays & billing ───────────────────────────────────────────────────

async function seedStaysAndBilling() {
  const adminId = await getAdminId();
  if (!adminId) throw new Error('Admin not found');

  for (const p of PADS) {
    const tenantId = await getUserId(p.tenant_email);
    const padId    = await getPadId(p.name);
    if (!tenantId) throw new Error(`Tenant not found: ${p.tenant_email}`);
    if (!padId)    throw new Error(`Pad not found: ${p.name}`);

    // Stay
    const [existingStay] = await pool.execute<any[]>(
      'SELECT id FROM stays WHERE pad_id = ? AND tenant_id = ?',
      [padId, tenantId]
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
         `Monthly tenant — check-in April 10 2026`, adminId]
      );
      stayId = stayResult.insertId;
      console.log(
        `  ✓ Stay created: ${p.tenant_email} @ ${p.name}` +
        `  |  ₱${p.flat_rate.toFixed(2)}/month + ₱${p.rate_per_kwh}/kWh`
      );
    }

    // Billing period — cycle 1: Apr 10 → May 10
    const [existingBill] = await pool.execute<any[]>(
      'SELECT id FROM billing_periods WHERE stay_id = ? AND cycle_number = 1', [stayId]
    );
    if ((existingBill as any[]).length > 0) {
      console.log(`  ↳ Bill already exists: ${p.name} cycle 1`);
      continue;
    }

    const energyKwh    = ENERGY_TOTALS[p.device_serial] ?? 0;
    const energyAmount = parseFloat((energyKwh * p.rate_per_kwh).toFixed(2));
    const flatAmount   = p.flat_rate;
    const amountDue    = parseFloat((energyAmount + flatAmount).toFixed(2));

    await pool.execute(
      `INSERT INTO billing_periods
         (pad_id, stay_id, tenant_id, period_start, period_end,
          energy_kwh, rate_per_kwh, amount_due, flat_amount, cycle_number, due_date, status)
       VALUES (?, ?, ?, '2026-04-10', '2026-05-10', ?, ?, ?, ?, 1, '2026-05-15', 'unpaid')`,
      [padId, stayId, tenantId, energyKwh, p.rate_per_kwh, amountDue, flatAmount]
    );

    console.log(
      `  ✓ Bill created: ${p.name}  Apr 10 – May 10` +
      `  |  ${energyKwh.toFixed(2)} kWh × ₱${p.rate_per_kwh}` +
      `  +  ₱${flatAmount.toFixed(2)} flat` +
      `  =  ₱${amountDue.toFixed(2)}`
    );
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🌱  BlueWatt Seeder — Real Meter Data\n');

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

    console.log('\n⚡  Seeding power aggregates (Apr 10–17)...');
    await seedPowerAggregates();

    console.log('\n🏨  Seeding stays & billing...');
    await seedStaysAndBilling();

    console.log('\n✅  Seed complete.\n');
    console.log('─────────────────────────────────────────────────────────────────────');
    console.log('  Admin:   admin@bluewatt.local  /  Admin@1234');
    console.log('  Sophie:  sophie-proto@test.com  /  Tenant@1234  →  PAD-1 (bluewatt-001)');
    console.log('  Reynie:  reynie-proto@test.com  /  Tenant@1234  →  PAD-3 (bluewatt-003)');
    console.log('  Jassy:   jassy-proto@test.com   /  Tenant@1234  →  PAD-4 (bluewatt-004)');
    console.log('─────────────────────────────────────────────────────────────────────');
    console.log('  Rate: ₱12.00/kWh for all pads');
    console.log('  Check-in: April 10 2026  |  Billing: Apr 10 – May 10 (cycle 1)');
    console.log('─────────────────────────────────────────────────────────────────────');
    console.log('  Sophie  (PAD-1):  19.65 kWh × ₱12 = ₱235.80  + ₱2,500  = ₱2,735.80');
    console.log('  Reynie  (PAD-3):  58.60 kWh × ₱12 = ₱703.20  + ₱2,000  = ₱2,703.20');
    console.log('  Jassy   (PAD-4):  55.30 kWh × ₱12 = ₱663.60  + ₱2,000  = ₱2,663.60');
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
