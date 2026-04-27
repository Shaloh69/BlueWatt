-- Migration 020: Set rate_per_kwh = 11.98 across all pads and active stays
-- Run once to sync the live DB with the updated Meralco-aligned rate.

-- Update column default for future rows
ALTER TABLE pads
  ALTER COLUMN rate_per_kwh SET DEFAULT 11.98;

-- Update all existing pads
UPDATE pads SET rate_per_kwh = 11.98;

-- Update all active stays so billing picks up the new rate going forward
UPDATE stays SET rate_per_kwh = 11.98 WHERE status = 'active';
