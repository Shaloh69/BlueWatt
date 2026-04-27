-- Migration 009: Pads table
-- A pad is a physical electrical slot (room/unit) monitored by one ESP32 device

CREATE TABLE IF NOT EXISTS pads (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  description   VARCHAR(255),
  device_id     INT UNSIGNED UNIQUE DEFAULT NULL,
  tenant_id     INT UNSIGNED DEFAULT NULL,
  owner_id      INT UNSIGNED NOT NULL,
  rate_per_kwh  DECIMAL(10,4) NOT NULL DEFAULT 11.98,
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT NOW(),
  updated_at    DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),

  CONSTRAINT fk_pad_device   FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL,
  CONSTRAINT fk_pad_tenant   FOREIGN KEY (tenant_id) REFERENCES users(id)   ON DELETE SET NULL,
  CONSTRAINT fk_pad_owner    FOREIGN KEY (owner_id)  REFERENCES users(id)   ON DELETE RESTRICT
);
