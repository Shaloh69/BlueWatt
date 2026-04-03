-- Migration 006: Replace PayMongo fields with receipt-based payment fields
-- Payment flow: tenant uploads GCash/Maya receipt image + reference number
--               admin verifies and approves or rejects

ALTER TABLE payments
  -- Remove PayMongo-specific columns (safe to drop, table is new)
  DROP COLUMN IF EXISTS paymongo_payment_id,
  DROP COLUMN IF EXISTS paymongo_source_id,
  DROP COLUMN IF EXISTS checkout_url,

  -- Add receipt-based columns
  ADD COLUMN IF NOT EXISTS reference_number  VARCHAR(100)  DEFAULT NULL AFTER payment_method,
  ADD COLUMN IF NOT EXISTS receipt_url       VARCHAR(1000) DEFAULT NULL AFTER reference_number,
  ADD COLUMN IF NOT EXISTS rejection_reason  VARCHAR(500)  DEFAULT NULL AFTER receipt_url,
  ADD COLUMN IF NOT EXISTS verified_by       INT           DEFAULT NULL AFTER rejection_reason,
  ADD COLUMN IF NOT EXISTS verified_at       DATETIME      DEFAULT NULL AFTER verified_by,

  -- Extend status enum to include pending_verification
  MODIFY COLUMN status ENUM('pending','pending_verification','paid','failed','refunded') NOT NULL DEFAULT 'pending';

-- FK for verified_by → users.id (drop first to make this idempotent on retry)
ALTER TABLE payments DROP FOREIGN KEY IF EXISTS fk_pay_verified_by;
ALTER TABLE payments
  ADD CONSTRAINT fk_pay_verified_by FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL;
