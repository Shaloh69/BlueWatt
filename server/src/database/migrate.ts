import * as fs from 'fs';
import * as path from 'path';
import { pool } from './connection';
import { RowDataPacket } from 'mysql2';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

interface Migration {
  version: string;
  name: string;
  filepath: string;
}

async function ensureMigrationsTable() {
  const migrationLogPath = path.join(MIGRATIONS_DIR, '000_create_migrations_log.sql');
  const sql = fs.readFileSync(migrationLogPath, 'utf-8');
  await pool.query(sql);
  console.log('✓ Migrations log table ensured');
}

async function getAppliedMigrations(): Promise<string[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT version FROM migrations_log ORDER BY version'
  );
  return rows.map((row) => row.version);
}

async function getPendingMigrations(applied: string[]): Promise<Migration[]> {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));

  const migrations: Migration[] = files
    .filter((file) => file !== '000_create_migrations_log.sql')
    .map((file) => {
      const version = file.split('_')[0];
      const name = file.replace('.sql', '').substring(version.length + 1);
      return {
        version,
        name,
        filepath: path.join(MIGRATIONS_DIR, file),
      };
    })
    .filter((m) => !applied.includes(m.version))
    .sort((a, b) => a.version.localeCompare(b.version));

  return migrations;
}

async function applyMigration(migration: Migration) {
  const sql = fs.readFileSync(migration.filepath, 'utf-8');

  await pool.query(sql);
  await pool.query('INSERT INTO migrations_log (version, name) VALUES (?, ?)', [
    migration.version,
    migration.name,
  ]);

  console.log(`✓ Applied migration ${migration.version}: ${migration.name}`);
}

async function runMigrationsUp() {
  console.log('Running migrations...\n');

  await ensureMigrationsTable();

  const applied = await getAppliedMigrations();
  console.log(`Applied migrations: ${applied.length}`);

  const pending = await getPendingMigrations(applied);

  if (pending.length === 0) {
    console.log('\n✓ No pending migrations');
    return;
  }

  console.log(`Pending migrations: ${pending.length}\n`);

  for (const migration of pending) {
    await applyMigration(migration);
  }

  console.log('\n✓ All migrations applied successfully');
}

async function showMigrationStatus() {
  await ensureMigrationsTable();

  const applied = await getAppliedMigrations();
  const pending = await getPendingMigrations(applied);

  console.log('\n=== Migration Status ===\n');
  console.log(`Applied: ${applied.length}`);
  console.log(`Pending: ${pending.length}\n`);

  if (applied.length > 0) {
    console.log('Applied migrations:');
    applied.forEach((v) => console.log(`  ✓ ${v}`));
  }

  if (pending.length > 0) {
    console.log('\nPending migrations:');
    pending.forEach((m) => console.log(`  • ${m.version}: ${m.name}`));
  }

  console.log('');
}

async function main() {
  const command = process.argv[2] || 'up';

  try {
    switch (command) {
      case 'up':
        await runMigrationsUp();
        break;
      case 'status':
        await showMigrationStatus();
        break;
      default:
        console.log('Unknown command. Use: up, status');
        process.exit(1);
    }

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error);
    await pool.end();
    process.exit(1);
  }
}

main();
