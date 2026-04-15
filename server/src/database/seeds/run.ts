/**
 * BlueWatt Database Seeder
 * Run: npm run seed
 *
 * Seeds:
 *  - 1 admin account (demo)
 *  - 2 demo tenant accounts
 *  - 1 demo device
 *  - 2 demo pads
 *  - Stays + billing for real tenants Reynnie & Sophie (check-in Apr 8, monthly cycle)
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

// ── Real tenant stays + billing ───────────────────────────────────────────────
// Check-in date: April 8, 2026 (monthly cycle — bill generated every 8th)
// Flat rate varies per owner/unit

const CHECK_IN = new Date('2026-04-08T00:00:00');

const STAY_SEEDS = [
  {
    tenant_email:        'tapnioreynnie@gmail.com',
    pad_name:            'Pad-003',
    billing_cycle:       'monthly' as const,
    flat_rate_per_cycle: 2000.00,   // ₱2,000/month boarding rent
    notes:               'Monthly tenant — check-in April 8',
    // Estimated energy for seeded billing period (Apr 8 → May 8)
    sample_energy_kwh:   45.30,
  },
  {
    tenant_email:        'androjaygarcia@gmail.com',
    pad_name:            'Pad-001',
    billing_cycle:       'monthly' as const,
    flat_rate_per_cycle: 2500.00,   // ₱2,500/month boarding rent
    notes:               'Monthly tenant — check-in April 8',
    sample_energy_kwh:   38.70,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function userExists(email: string): Promise<boolean> {
  const [rows] = await pool.execute<any[]>(
    'SELECT id FROM users WHERE email = ?', [email]
  );
  return rows.length > 0;
}

async function getUserId(email: string): Promise<number | null> {
  const [rows] = await pool.execute<any[]>(
    'SELECT id FROM users WHERE email = ?', [email]
  );
  return rows.length > 0 ? rows[0].id : null;
}

/** Returns the first admin ID in the system — works even in production where ADMIN.email differs */
async function getAnyAdminId(): Promise<number | null> {
  const [rows] = await pool.execute<any[]>(
    "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
  );
  return rows.length > 0 ? rows[0].id : null;
}

async function deviceExists(deviceId: string): Promise<boolean> {
  const [rows] = await pool.execute<any[]>(
    'SELECT id FROM devices WHERE device_id = ?', [deviceId]
  );
  return rows.length > 0;
}

async function getDeviceDbId(deviceId: string): Promise<number> {
  const [rows] = await pool.execute<any[]>(
    'SELECT id FROM devices WHERE device_id = ?', [deviceId]
  );
  return rows[0].id;
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
  if (!adminId) { console.log('  ↳ Admin not found, skipping demo device'); return; }
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
  if (!adminId) { console.log('  ↳ Admin not found, skipping demo pads'); return; }
  const deviceDbId = await getDeviceDbId(DEVICE.device_id);

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

    // Legacy seed bill (no stay linkage)
    const start = new Date();
    start.setDate(1);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    end.setDate(0);
    const due = new Date(end);
    due.setDate(due.getDate() + 10);

    await pool.execute(
      `INSERT INTO billing_periods
         (pad_id, tenant_id, period_start, period_end, energy_kwh, rate_per_kwh, amount_due, status, due_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'unpaid', ?)`,
      [padId, tenantId,
        start.toISOString().slice(0, 10),
        end.toISOString().slice(0, 10),
        42.5, pad.rate_per_kwh,
        (42.5 * pad.rate_per_kwh).toFixed(2),
        due.toISOString().slice(0, 10)]
    );

    console.log(`  ✓ Pad created: ${pad.name}  →  tenant: ${tenant.email}${deviceId ? '  →  device: ' + DEVICE.device_id : ''}`);
  }
}

// ── Real tenant stays + billing ────────────────────────────────────────────────

async function seedStaysAndBilling() {
  const adminId = await getAnyAdminId();
  if (!adminId) {
    console.log('  ↳ No admin found — run seeder after creating an admin account');
    return;
  }

  for (const seed of STAY_SEEDS) {
    // Look up tenant
    const tenantId = await getUserId(seed.tenant_email);
    if (!tenantId) {
      console.log(`  ↳ Tenant not found: ${seed.tenant_email} — skipping`);
      continue;
    }

    // Look up pad by name
    const [padRows] = await pool.execute<any[]>(
      'SELECT id, rate_per_kwh FROM pads WHERE name = ? LIMIT 1', [seed.pad_name]
    );
    if ((padRows as any[]).length === 0) {
      console.log(`  ↳ Pad not found: ${seed.pad_name} — skipping`);
      continue;
    }
    const padId     = (padRows as any[])[0].id;
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
           (pad_id, tenant_id, check_in_at, billing_cycle, flat_rate_per_cycle, rate_per_kwh, status, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
        [padId, tenantId, CHECK_IN, seed.billing_cycle, seed.flat_rate_per_cycle, ratePerKwh, seed.notes, adminId]
      );
      stayId = stayResult.insertId;
      console.log(
        `  ✓ Stay created: ${seed.tenant_email} @ ${seed.pad_name}` +
        `  |  ${seed.billing_cycle}  |  ₱${seed.flat_rate_per_cycle.toFixed(2)}/cycle`
      );
    }

    // ── Billing period (Apr 8 → May 8, cycle 1) ───────────────────────────────
    const [existingBill] = await pool.execute<any[]>(
      'SELECT id FROM billing_periods WHERE stay_id = ? AND cycle_number = 1', [stayId]
    );

    if ((existingBill as any[]).length > 0) {
      console.log(`  ↳ Billing period already exists: ${seed.pad_name} cycle 1`);
      continue;
    }

    const periodStart = '2026-04-08';
    const periodEnd   = '2026-05-08';
    const dueDate     = '2026-05-15';    // 7 days after period end

    const energyAmount = parseFloat((seed.sample_energy_kwh * ratePerKwh).toFixed(2));
    const flatAmount   = seed.flat_rate_per_cycle;
    const amountDue    = parseFloat((energyAmount + flatAmount).toFixed(2));

    await pool.execute(
      `INSERT INTO billing_periods
         (pad_id, stay_id, tenant_id, period_start, period_end,
          energy_kwh, rate_per_kwh, amount_due, flat_amount, cycle_number, due_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'unpaid')`,
      [padId, stayId, tenantId, periodStart, periodEnd,
       seed.sample_energy_kwh, ratePerKwh, amountDue, flatAmount, dueDate]
    );

    console.log(
      `  ✓ Bill created: ${seed.pad_name}  Apr 8 – May 8` +
      `  |  ${seed.sample_energy_kwh} kWh × ₱${ratePerKwh}` +
      `  +  ₱${flatAmount.toFixed(2)} flat` +
      `  =  ₱${amountDue.toFixed(2)}`
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

    console.log('\n🏠  Seeding demo pads & legacy billing...');
    await seedPads();

    console.log('\n🏨  Seeding stays & billing (Reynnie + Sophie)...');
    await seedStaysAndBilling();

    console.log('\n✅  Seed complete.\n');
    console.log('─────────────────────────────────────────────────────');
    console.log('  Demo admin:    admin@bluewatt.local  /  Admin@1234');
    console.log('  Demo tenant 1: tenant1@bluewatt.local  /  Tenant@1234');
    console.log('  Demo tenant 2: tenant2@bluewatt.local  /  Tenant@1234');
    console.log('─────────────────────────────────────────────────────');
    console.log('  Reynnie Tapnio: Pad-003  |  ₱2,000/month + energy');
    console.log('  Sophie Garcia:  Pad-001  |  ₱2,500/month + energy');
    console.log('  Check-in: April 8, 2026  |  Bill due: May 15, 2026');
    console.log('─────────────────────────────────────────────────────\n');
  } catch (err) {
    console.error('\n❌  Seed failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

main();
