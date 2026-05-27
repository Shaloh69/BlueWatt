CREATE TABLE IF NOT EXISTS billing_schedules (
  id                   INT UNSIGNED    NOT NULL AUTO_INCREMENT PRIMARY KEY,
  pad_id               INT UNSIGNED    NOT NULL,
  bill_type            ENUM('electricity','rent') NOT NULL DEFAULT 'electricity',
  frequency            ENUM('daily','weekly','monthly') NOT NULL,
  due_date_offset_days INT             NOT NULL DEFAULT 7,
  flat_amount          DECIMAL(10,2)   NULL,
  next_period_start    DATE            NOT NULL,
  status               ENUM('active','stopped') NOT NULL DEFAULT 'active',
  created_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pad_id) REFERENCES pads(id) ON DELETE CASCADE
);
