/**
 * BlueWatt Database Seeder
 * Run: npm run seed
 *
 * Seeds:
 *  - 1 admin account (demo)
 *  - 2 demo tenant accounts
 *  - 1 demo device + 2 demo pads
 *  - Stays + billing for Reynnie & Sophie (check-in Apr 8, monthly cycle)
 *  - Realistic power_aggregates_daily + monthly for Apr 8-14
 */

import { pool } from '../connection';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

// ── Demo seed data ────────────────────────────────────────────────────────────

const ADMIN = {
  email: 'admin@bluewatt.local',
  password: 'Admin@1234',
  full_name: 'BlueWatt Admin',
  role: 'admin' as const,
};

const TENANTS = [
  { email: 'tenant1@bluewatt.local', password: 'Tenant@1234', full_name: 'Juan dela Cruz' },
  { email: 'tenant2@bluewatt.local', password: 'Tenant@1234', full_name: 'Maria Santos' },
];

const DEVICE = {
  device_id: 'bluewatt-001',
  device_name: 'Unit 1 Meter',
  location: 'Building A, Floor 1',
  description: 'ESP32 power meter for Unit 1',
};

const PADS = [
  { name: 'Unit 1A', description: 'Ground floor unit', rate_per_kwh: 11.50 },
  { name: 'Unit 1B', description: 'Ground floor unit', rate_per_kwh: 11.50 },
];

// ── Real tenant stay config ───────────────────────────────────────────────────
// Check-in: April 8 2026 00:00 | Monthly billing | Bill due every 8th

const CHECK_IN = new Date('2026-04-08T00:00:00');

const STAY_SEEDS = [
  {
    tenant_email:        'tapnioreynnie@gmail.com',
    pad_name:            'Pad-003',
    device_serial:       'bluewatt-003',
    billing_cycle:       'monthly' as const,
    flat_rate_per_cycle: 2000.00,   // ₱2,000/month boarding rent
    notes:               'Monthly tenant — check-in April 8',
  },
  {
    tenant_email:        'androjaygarcia@gmail.com',
    pad_name:            'Pad-001',
    device_serial:       'bluewatt-001',
    billing_cycle:       'monthly' as const,
    flat_rate_per_cycle: 2500.00,   // ₱2,500/month boarding rent
    notes:               'Monthly tenant — check-in April 8',
  },
];

// ── Realistic daily power readings Apr 8–14 ───────────────────────────────────
// Pattern: weekdays higher, weekends lower
// Apr 8=Tue, 9=Wed, 10=Thu, 11=Fri, 12=Sat, 13=Sun, 14=Mon

interface DayData {
  date: string;
  total_energy_kwh: number;
  avg_power_real: number;   // watts
  max_power_real: number;
  min_power_real: number;
  avg_voltage: number;
  avg_current: number;
  avg_power_factor: number;
  peak_hour: number;
  reading_count: number;
}

const DAILY_DATA: Record<string, DayData[]> = {
  // Sophie Garcia — Pad-001 — bluewatt-001 (lighter usage)
  'bluewatt-001': [
    { date: '2026-04-08', total_energy_kwh: 3.245, avg_power_real: 135.2, max_power_real: 412.5, min_power_real: 18.3, avg_voltage: 231.5, avg_current: 0.585, avg_power_factor: 0.88, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-09', total_energy_kwh: 4.127, avg_power_real: 172.0, max_power_real: 538.0, min_power_real: 15.1, avg_voltage: 232.1, avg_current: 0.742, avg_power_factor: 0.85, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-10', total_energy_kwh: 3.892, avg_power_real: 162.2, max_power_real: 501.3, min_power_real: 16.8, avg_voltage: 231.8, avg_current: 0.701, avg_power_factor: 0.87, peak_hour: 19, reading_count: 1440 },
    { date: '2026-04-11', total_energy_kwh: 5.216, avg_power_real: 217.3, max_power_real: 625.8, min_power_real: 14.2, avg_voltage: 233.0, avg_current: 0.933, avg_power_factor: 0.89, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-12', total_energy_kwh: 2.834, avg_power_real: 118.1, max_power_real: 380.2, min_power_real: 12.5, avg_voltage: 230.9, avg_current: 0.512, avg_power_factor: 0.86, peak_hour: 14, reading_count: 1440 },
    { date: '2026-04-13', total_energy_kwh: 2.651, avg_power_real: 110.5, max_power_real: 350.1, min_power_real: 11.8, avg_voltage: 231.2, avg_current: 0.478, avg_power_factor: 0.85, peak_hour: 13, reading_count: 1440 },
    { date: '2026-04-14', total_energy_kwh: 4.382, avg_power_real: 182.6, max_power_real: 560.4, min_power_real: 17.2, avg_voltage: 232.4, avg_current: 0.786, avg_power_factor: 0.88, peak_hour: 21, reading_count: 1440 },
  ],
  // Reynnie Tapnio — Pad-003 — bluewatt-003 (heavier usage)
  'bluewatt-003': [
    { date: '2026-04-08', total_energy_kwh: 4.521, avg_power_real: 188.4, max_power_real: 580.2, min_power_real: 22.1, avg_voltage: 234.1, avg_current: 0.805, avg_power_factor: 0.91, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-09', total_energy_kwh: 5.138, avg_power_real: 214.1, max_power_real: 648.5, min_power_real: 20.4, avg_voltage: 233.8, avg_current: 0.916, avg_power_factor: 0.90, peak_hour: 21, reading_count: 1440 },
    { date: '2026-04-10', total_energy_kwh: 4.847, avg_power_real: 201.9, max_power_real: 612.3, min_power_real: 19.8, avg_voltage: 234.3, avg_current: 0.861, avg_power_factor: 0.91, peak_hour: 19, reading_count: 1440 },
    { date: '2026-04-11', total_energy_kwh: 6.231, avg_power_real: 259.6, max_power_real: 785.4, min_power_real: 18.5, avg_voltage: 235.0, avg_current: 1.106, avg_power_factor: 0.92, peak_hour: 20, reading_count: 1440 },
    { date: '2026-04-12', total_energy_kwh: 3.412, avg_power_real: 142.2, max_power_real: 435.6, min_power_real: 15.3, avg_voltage: 233.5, avg_current: 0.607, avg_power_factor: 0.90, peak_hour: 15, reading_count: 1440 },
    { date: '2026-04-13', total_energy_kwh: 3.198, avg_power_real: 133.2, max_power_real: 410.8, min_power_real: 14.9, avg_voltage: 233.7, avg_current: 0.571, avg_power_factor: 0.89, peak_hour: 14, reading_count: 1440 },
    { date: '2026-04-14', total_energy_kwh: 5.294, avg_power_real: 220.6, max_power_real: 668.2, min_power_real: 21.3, avg_voltage: 234.5, avg_current: 0.941, avg_power_factor: 0.91, peak_hour: 21, reading_count: 1440 },
  ],
};

// Pre-computed totals for billing (sum of Apr 8–14)
const ENERGY_TOTALS: Record<string, number> = {
  'bluewatt-001': 26.347,   // Sophie
  'bluewatt-003': 32.641,   // Reynnie
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function userExists(email: string): Promise<boolean> {
  const [rows] = await pool.execute<any[]>('SELECT id FROM users WHERE email = ?', [email]);
  return rows.length > 0;
}

async function getUserId(email: string): Promise<number | null> {
  const [rows] = await pool.execute<any[]>('SELECT id FROM users WHERE email = ?', [email]);
  return rows.length > 0 ? rows[0].id : null;
}

async function getAnyAdminId(): Promise<number | null> {
  const [rows] = await pool.execute<any[]>("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  return rows.length > 0 ? rows[0].id : null;
}

async function deviceExists(deviceId: string): Promise<boolean> {
  const [rows] = await pool.execute<any[]>('SELECT id FROM devices WHERE device_id = ?', [deviceId]);
  return rows.length > 0;
}

async function getDeviceDbId(deviceId: string): Promise<number | null> {
  const [rows] = await pool.execute<any[]>('SELECT id FROM devices WHERE device_id = ?', [deviceId]);
  return rows.length > 0 ? rows[0].id : null;
}

// ── Demo seed functions ────────────────────────────────────────────────────────

async function seedAdmin() {
  if (await userExists(ADMIN.email)) {
    console.log(`  ↳ Admin already exists: ${ADMIN.email}`);
    return;
  }
  const hash = await bcrypt.hash(ADMIN.password, SALT_ROUNDS);
  await pool.execute(
    'INSERT INTO users (email, password_hash, full_name, role) VALUES (?, ?, ?, ?)',
    [ADMIN.email, hash, ADMIN.full_name, ADMIN.role]
  );
  console.log(`  ✓ Admin created: ${ADMIN.email}  /  password: ${ADMIN.password}`);
}

async function seedTenants() {
  for (const t of TENANTS) {
    if (await userExists(t.email)) {
      console.log(`  ↳ Tenant already exists: ${t.email}`);
      continue;
    }
    const hash = await bcrypt.hash(t.password, SALT_ROUNDS);
    await pool.execute(
      'INSERT INTO users (email, password_hash, full_name, role) VALUES (?, ?, ?, ?)',
      [t.email, hash, t.full_name, 'user']
    );
    console.log(`  ✓ Tenant created: ${t.email}  /  password: ${t.password}`);
  }
}

async function seedDevice() {
  const adminId = await getUserId(ADMIN.email);
  if (!adminId) { console.log('  ↳ Demo admin not found, skipping demo device'); return; }
  if (await deviceExists(DEVICE.device_id)) {
    console.log(`  ↳ Device already exists: ${DEVICE.device_id}`);
    return;
  }
  await pool.execute(
    'INSERT INTO devices (owner_id, device_id, device_name, location, description) VALUES (?, ?, ?, ?, ?)',
    [adminId, DEVICE.device_id, DEVICE.device_name, DEVICE.location, DEVICE.description]
  );
  console.log(`  ✓ Device created: ${DEVICE.device_id}`);
}

async function seedPads() {
  const adminId = await getUserId(ADMIN.email);
  if (!adminId) { console.log('  ↳ Demo admin not found, skipping demo pads'); return; }
  const deviceDbId = await getDeviceDbId(DEVICE.device_id);
  if (!deviceDbId) { console.log('  ↳ Demo device not found, skipping demo pads'); return; }

  for (let i = 0; i < PADS.length; i++) {
    const pad = PADS[i];
    const tenant = TENANTS[i];
    const [existing] = await pool.execute<any[]>(
      'SELECT id FROM pads WHERE name = ? AND owner_id = ?', [pad.name, adminId]
    );
    if ((existing as any[]).length > 0) {
      console.log(`  ↳ Pad already exists: ${pad.name}`);
      continue;
    }
    const tenantId = await getUserId(tenant.email);
    if (!tenantId) continue;
    const deviceId = i === 0 ? deviceDbId : null;
    const [result] = await pool.execute<any>(
      'INSERT INTO pads (owner_id, name, description, rate_per_kwh, device_id, tenant_id, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [adminId, pad.name, pad.description, pad.rate_per_kwh, deviceId, tenantId]
    );
    const padId = result.insertId;
    const start = new Date(); start.setDate(1);
    const end = new Date(start); end.setMonth(end.getMonth() + 1); end.setDate(0);
    const due = new Date(end); due.setDate(due.getDate() + 10);
    await pool.execute(
      `INSERT INTO billing_periods (pad_id, tenant_id, period_start, period_end, energy_kwh, rate_per_kwh, amount_due, status, due_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'unpaid', ?)`,
      [padId, tenantId, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10),
       42.5, pad.rate_per_kwh, (42.5 * pad.rate_per_kwh).toFixed(2), due.toISOString().slice(0, 10)]
    );
    console.log(`  ✓ Pad created: ${pad.name}  →  tenant: ${tenant.email}`);
  }
}

// ── Power aggregates (realistic Apr 8–14) ─────────────────────────────────────

async function seedPowerAggregates() {
  for (const seed of STAY_SEEDS) {
    const deviceDbId = await getDeviceDbId(seed.device_serial);
    if (!deviceDbId) {
      console.log(`  ↳ Device not found: ${seed.device_serial} — skipping power data`);
      continue;
    }

    const days = DAILY_DATA[seed.device_serial];
    if (!days) continue;

    let totalEnergy = 0;
    let totalPower  = 0;
    let maxPower    = 0;

    for (const d of days) {
      // Daily aggregate — ON DUPLICATE KEY UPDATE so re-running is safe
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
    const firstDay = days[0];

    // Monthly aggregate for 2026-04
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
       firstDay.avg_voltage.toFixed(1), (totalPower / days.length / firstDay.avg_voltage).toFixed(3),
       firstDay.avg_power_factor.toFixed(2)]
    );

    console.log(
      `  ✓ Power data seeded: ${seed.device_serial}  |  ` +
      `Apr 8–14  |  ${totalEnergy.toFixed(3)} kWh  |  ` +
      `avg ${avgPower.toFixed(1)} W`
    );
  }
}

// ── Real tenant stays + billing ───────────────────────────────────────────────

async function seedStaysAndBilling() {
  const adminId = await getAnyAdminId();
  if (!adminId) {
    console.log('  ↳ No admin found — create an admin account first');
    return;
  }

  for (const seed of STAY_SEEDS) {
    // Look up tenant
    const tenantId = await getUserId(seed.tenant_email);
    if (!tenantId) {
      console.log(`  ↳ Tenant not found: ${seed.tenant_email} — skipping`);
      continue;
    }

    // Look up pad
    const [padRows] = await pool.execute<any[]>(
      'SELECT id, rate_per_kwh FROM pads WHERE name = ? LIMIT 1', [seed.pad_name]
    );
    if ((padRows as any[]).length === 0) {
      console.log(`  ↳ Pad not found: ${seed.pad_name} — skipping`);
      continue;
    }
    const padId      = (padRows as any[])[0].id;
    const ratePerKwh = parseFloat((padRows as any[])[0].rate_per_kwh);

    // ── Stay ──────────────────────────────────────────────────────────────────
    const [existingStay] = await pool.execute<any[]>(
      'SELECT id FROM stays WHERE pad_id = ? AND tenant_id = ? AND check_in_at = ?',
      [padId, tenantId, CHECK_IN]
    );

    let stayId: number;
    if ((existingStay as any[]).length > 0) {
      stayId = (existingStay as any[])[0].id;
      console.log(`  ↳ Stay already exists: ${seed.tenant_email} @ ${seed.pad_name}`);
    } else {
      const [stayResult] = await pool.execute<any>(
        `INSERT INTO stays
           (pad_id, tenant_id, check_in_at, billing_cycle, flat_rate_per_cycle,
            rate_per_kwh, status, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
        [padId, tenantId, CHECK_IN, seed.billing_cycle,
         seed.flat_rate_per_cycle, ratePerKwh, seed.notes, adminId]
      );
      stayId = stayResult.insertId;
      console.log(
        `  ✓ Stay created: ${seed.tenant_email} @ ${seed.pad_name}` +
        `  |  ${seed.billing_cycle}  |  ₱${seed.flat_rate_per_cycle.toFixed(2)}/cycle`
      );
    }

    // ── Billing period — cycle 1: Apr 8 → May 8 ──────────────────────────────
    // Energy = actual seeded data for Apr 8–14 (partial — rest generated by cron)
    const [existingBill] = await pool.execute<any[]>(
      'SELECT id FROM billing_periods WHERE stay_id = ? AND cycle_number = 1', [stayId]
    );
    if ((existingBill as any[]).length > 0) {
      console.log(`  ↳ Billing period already exists: ${seed.pad_name} cycle 1`);
      continue;
    }

    const energyKwh    = ENERGY_TOTALS[seed.device_serial] ?? 0;
    const energyAmount = parseFloat((energyKwh * ratePerKwh).toFixed(2));
    const flatAmount   = seed.flat_rate_per_cycle;
    const amountDue    = parseFloat((energyAmount + flatAmount).toFixed(2));

    await pool.execute(
      `INSERT INTO billing_periods
         (pad_id, stay_id, tenant_id, period_start, period_end,
          energy_kwh, rate_per_kwh, amount_due, flat_amount, cycle_number, due_date, status)
       VALUES (?, ?, ?, '2026-04-08', '2026-05-08', ?, ?, ?, ?, 1, '2026-05-15', 'unpaid')`,
      [padId, stayId, tenantId, energyKwh, ratePerKwh, amountDue, flatAmount]
    );

    console.log(
      `  ✓ Bill created: ${seed.pad_name}  Apr 8 – May 8` +
      `  |  ${energyKwh.toFixed(3)} kWh × ₱${ratePerKwh}` +
      `  +  ₱${flatAmount.toFixed(2)} flat` +
      `  =  ₱${amountDue.toFixed(2)}  (due May 15)`
    );
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🌱  BlueWatt Seeder\n');

  try {
    console.log('👤  Seeding demo users...');
    await seedAdmin();
    await seedTenants();

    console.log('\n📡  Seeding demo device...');
    await seedDevice();

    console.log('\n🏠  Seeding demo pads...');
    await seedPads();

    console.log('\n⚡  Seeding power data (Apr 8–14)...');
    await seedPowerAggregates();

    console.log('\n🏨  Seeding stays & billing (Reynnie + Sophie)...');
    await seedStaysAndBilling();

    console.log('\n✅  Seed complete.\n');
    console.log('─────────────────────────────────────────────────────────────');
    console.log('  Demo admin:    admin@bluewatt.local  /  Admin@1234');
    console.log('  Demo tenant 1: tenant1@bluewatt.local  /  Tenant@1234');
    console.log('  Demo tenant 2: tenant2@bluewatt.local  /  Tenant@1234');
    console.log('─────────────────────────────────────────────────────────────');
    console.log('  Reynnie @ Pad-003 (bluewatt-003)  |  ₱2,000/month + ₱12/kWh');
    console.log('  Sophie  @ Pad-001 (bluewatt-001)  |  ₱2,500/month + ₱12/kWh');
    console.log('  Check-in April 8 2026  |  Energy Apr 8–14 seeded');
    console.log('  Reynnie: 32.641 kWh → ₱391.69 + ₱2,000 = ₱2,391.69 (Apr bill)');
    console.log('  Sophie:  26.347 kWh → ₱316.16 + ₱2,500 = ₱2,816.16 (Apr bill)');
    console.log('─────────────────────────────────────────────────────────────\n');
  } catch (err) {
    console.error('\n❌  Seed failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

main();
