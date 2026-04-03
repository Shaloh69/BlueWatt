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

async function runStatements(sql: string): Promise<void> {
  // Strip single-line comments before splitting so semicolons inside
  // comments don't create false statement boundaries
  const stripped = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  const statements = stripped
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // MySQL errno values that mean "already applied" — safe to ignore on retry
  const idempotentErrnos = new Set([
    1050, // ER_TABLE_EXISTS_ERROR     — table already exists
    1060, // ER_DUP_FIELDNAME          — column already exists
    1061, // ER_DUP_KEYNAME            — duplicate key/index name
    1826, // ER_FK_DUP_CONSTRAINT_NAME — duplicate FK constraint name
  ]);

  for (const statement of statements) {
    try {
      await pool.query(statement);
    } catch (err: any) {
      if (idempotentErrnos.has(err.errno)) {
        continue; // already applied — skip silently
      }
      throw err;
    }
  }
}

async function ensureMigrationsTable() {
  // Check if table exists with the correct schema first
  try {
    await pool.query('SELECT version FROM migrations_log LIMIT 1');
    console.log('✓ Migrations log table ensured');
    return;
  } catch {
    // Table missing or wrong schema — (re)create it
  }
  await pool.query('DROP TABLE IF EXISTS migrations_log');
  await pool.query(`
    CREATE TABLE migrations_log (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      version VARCHAR(50) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_version (version)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
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

  await runStatements(sql);
  await pool.query('INSERT IGNORE INTO migrations_log (version, name) VALUES (?, ?)', [
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
