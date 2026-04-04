/**
 * BlueWatt Database Seeder
 * Run: npm run seed
 *
 * Seeds:
 *  - 1 admin account
 *  - 2 tenant accounts
 *  - 1 device (owned by admin)
 *  - 2 pads assigned to the tenants
 *  - Sample billing periods
 */

import { pool } from '../connection';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

// ── Seed data ────────────────────────────────────────────────────────────────

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

// ── Helpers ──────────────────────────────────────────────────────────────────

async function userExists(email: string): Promise<boolean> {
  const [rows] = await pool.execute<any[]>(
    'SELECT id FROM users WHERE email = ?', [email]
  );
  return rows.length > 0;
}

async function getUserId(email: string): Promise<number> {
  const [rows] = await pool.execute<any[]>(
    'SELECT id FROM users WHERE email = ?', [email]
  );
  return rows[0].id;
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

// ── Seed functions ────────────────────────────────────────────────────────────

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

    // Only assign device to first pad
    const deviceId = i === 0 ? deviceDbId : null;

    const [result] = await pool.execute<any>(
      'INSERT INTO pads (owner_id, name, description, rate_per_kwh, device_id, tenant_id) VALUES (?, ?, ?, ?, ?, ?)',
      [adminId, pad.name, pad.description, pad.rate_per_kwh, deviceId, tenantId]
    );
    const padId = result.insertId;

    // Seed a sample unpaid bill for each pad
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
        42.5,
        pad.rate_per_kwh,
        (42.5 * pad.rate_per_kwh).toFixed(2),
        due.toISOString().slice(0, 10)]
    );

    console.log(`  ✓ Pad created: ${pad.name}  →  tenant: ${tenant.email}${deviceId ? '  →  device: ' + DEVICE.device_id : ''}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🌱  BlueWatt Seeder\n');

  try {
    console.log('👤  Seeding users...');
    await seedAdmin();
    await seedTenants();

    console.log('\n📡  Seeding device...');
    await seedDevice();

    console.log('\n🏠  Seeding pads & billing...');
    await seedPads();

    console.log('\n✅  Seed complete.\n');
    console.log('─────────────────────────────────────────');
    console.log('  Admin:    admin@bluewatt.local  /  Admin@1234');
    console.log('  Tenant 1: tenant1@bluewatt.local  /  Tenant@1234');
    console.log('  Tenant 2: tenant2@bluewatt.local  /  Tenant@1234');
    console.log('─────────────────────────────────────────\n');
  } catch (err) {
    console.error('\n❌  Seed failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

main();
