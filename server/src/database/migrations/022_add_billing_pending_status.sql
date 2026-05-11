ALTER TABLE billing_periods
  MODIFY COLUMN status ENUM('unpaid','pending','paid','overdue','waived') NOT NULL DEFAULT 'unpaid';
