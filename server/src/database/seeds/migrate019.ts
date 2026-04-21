import { pool } from '../connection';

async function main() {
  // 1. Add bill_type column
  try {
    await pool.execute(
      "ALTER TABLE billing_periods ADD COLUMN bill_type ENUM('electricity', 'rent') NOT NULL DEFAULT 'electricity' AFTER cycle_number"
    );
    console.log('✓ Added bill_type column');
  } catch (e: any) { console.log('bill_type note:', e.message); }

  // 2. Drop FK, drop uq_pad_period, re-add FK (MySQL needs FK dropped to remove index)
  try {
    await pool.execute('ALTER TABLE billing_periods DROP FOREIGN KEY fk_bill_pad');
    console.log('✓ Dropped fk_bill_pad');
  } catch (e: any) { console.log('fk_bill_pad note:', e.message); }

  try {
    await pool.execute('ALTER TABLE billing_periods DROP INDEX uq_pad_period');
    console.log('✓ Dropped uq_pad_period');
  } catch (e: any) { console.log('uq_pad_period note:', e.message); }

  try {
    await pool.execute(
      'ALTER TABLE billing_periods ADD CONSTRAINT fk_bill_pad FOREIGN KEY (pad_id) REFERENCES pads(id) ON DELETE CASCADE'
    );
    console.log('✓ Re-added fk_bill_pad');
  } catch (e: any) { console.log('re-add fk note:', e.message); }

  // 3. Add new uq_pad_period_type (pad_id, period_start, bill_type)
  try {
    await pool.execute(
      'ALTER TABLE billing_periods ADD UNIQUE KEY uq_pad_period_type (pad_id, period_start, bill_type)'
    );
    console.log('✓ Added uq_pad_period_type');
  } catch (e: any) { console.log('uq_pad_period_type note:', e.message); }

  // 4. Drop old uq_stay_cycle (stay_id, cycle_number) — blocks 2 bills per cycle
  try {
    await pool.execute('ALTER TABLE billing_periods DROP INDEX uq_stay_cycle');
    console.log('✓ Dropped uq_stay_cycle');
  } catch (e: any) { console.log('uq_stay_cycle note:', e.message); }

  // 5. Add new uq_stay_cycle_type (stay_id, cycle_number, bill_type)
  try {
    await pool.execute(
      'ALTER TABLE billing_periods ADD UNIQUE KEY uq_stay_cycle_type (stay_id, cycle_number, bill_type)'
    );
    console.log('✓ Added uq_stay_cycle_type');
  } catch (e: any) { console.log('uq_stay_cycle_type note:', e.message); }

  // Verify
  const [cols] = await pool.execute("SHOW COLUMNS FROM billing_periods LIKE 'bill_type'") as any[];
  const [idx1] = await pool.execute("SHOW INDEX FROM billing_periods WHERE Key_name = 'uq_pad_period_type'") as any[];
  const [idx2] = await pool.execute("SHOW INDEX FROM billing_periods WHERE Key_name = 'uq_stay_cycle_type'") as any[];
  console.log('bill_type column:', cols.length > 0 ? 'OK' : 'MISSING');
  console.log('uq_pad_period_type:', idx1.length > 0 ? 'OK' : 'MISSING');
  console.log('uq_stay_cycle_type:', idx2.length > 0 ? 'OK' : 'MISSING');

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
