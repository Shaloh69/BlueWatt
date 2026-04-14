CREATE TABLE IF NOT EXISTS stays (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pad_id               INT UNSIGNED NOT NULL,
  tenant_id            INT UNSIGNED NOT NULL,
  check_in_at          DATETIME(0)  NOT NULL,
  check_out_at         DATETIME(0)  NULL DEFAULT NULL,
  billing_cycle        ENUM('daily', 'monthly') NOT NULL DEFAULT 'monthly',
  flat_rate_per_cycle  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  rate_per_kwh         DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
  status               ENUM('active', 'ended') NOT NULL DEFAULT 'active',
  notes                TEXT         NULL,
  created_by           INT UNSIGNED NOT NULL,
  created_at           DATETIME(0)  NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  updated_at           DATETIME(0)  NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

  CONSTRAINT fk_stays_pad    FOREIGN KEY (pad_id)     REFERENCES pads(id)  ON DELETE CASCADE,
  CONSTRAINT fk_stays_tenant FOREIGN KEY (tenant_id)  REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_stays_admin  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,

  INDEX idx_stays_pad    (pad_id),
  INDEX idx_stays_tenant (tenant_id),
  INDEX idx_stays_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
