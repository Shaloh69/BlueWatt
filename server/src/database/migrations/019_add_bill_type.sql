-- Add bill_type to distinguish electricity vs rent bills
ALTER TABLE billing_periods
  ADD COLUMN bill_type ENUM('electricity', 'rent') NOT NULL DEFAULT 'electricity' AFTER cycle_number;

-- Drop old unique (stay_id, cycle_number) and replace with (stay_id, cycle_number, bill_type)
-- so both electricity and rent bills can exist for the same cycle
ALTER TABLE billing_periods
  DROP INDEX uq_stay_cycle;

ALTER TABLE billing_periods
  ADD UNIQUE KEY uq_stay_cycle_type (stay_id, cycle_number, bill_type);
