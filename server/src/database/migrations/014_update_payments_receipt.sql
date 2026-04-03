-- Migration 014: Replace PayMongo fields with receipt-based payment fields

ALTER TABLE payments DROP COLUMN paymongo_payment_id;
ALTER TABLE payments DROP COLUMN paymongo_source_id;
ALTER TABLE payments DROP COLUMN checkout_url;
ALTER TABLE payments ADD COLUMN reference_number VARCHAR(100) DEFAULT NULL AFTER payment_method;
ALTER TABLE payments ADD COLUMN receipt_url VARCHAR(1000) DEFAULT NULL AFTER reference_number;
ALTER TABLE payments ADD COLUMN rejection_reason VARCHAR(500) DEFAULT NULL AFTER receipt_url;
ALTER TABLE payments ADD COLUMN verified_by INT UNSIGNED DEFAULT NULL AFTER rejection_reason;
ALTER TABLE payments ADD COLUMN verified_at DATETIME DEFAULT NULL AFTER verified_by;
ALTER TABLE payments MODIFY COLUMN status ENUM('pending','pending_verification','paid','failed','refunded') NOT NULL DEFAULT 'pending';
ALTER TABLE payments DROP FOREIGN KEY fk_pay_verified_by;
ALTER TABLE payments ADD CONSTRAINT fk_pay_verified_by FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL;
