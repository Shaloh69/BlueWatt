ALTER TABLE billing_periods
  ADD COLUMN stay_id      INT UNSIGNED NULL DEFAULT NULL AFTER pad_id,
  ADD COLUMN flat_amount  DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER amount_due,
  ADD COLUMN cycle_number INT UNSIGNED  NULL DEFAULT NULL AFTER flat_amount;

ALTER TABLE billing_periods
  ADD CONSTRAINT fk_billing_stay FOREIGN KEY (stay_id) REFERENCES stays(id) ON DELETE SET NULL;

ALTER TABLE billing_periods
  ADD UNIQUE KEY uq_stay_cycle (stay_id, cycle_number)
