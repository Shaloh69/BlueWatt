-- Remove all rent-type billing periods (replaced by electricity-only billing)
DELETE FROM billing_periods WHERE bill_type = 'rent';
