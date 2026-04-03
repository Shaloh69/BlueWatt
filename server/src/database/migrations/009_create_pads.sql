-- Migration 001: Pads table
-- A pad is a physical electrical slot (room/unit) monitored by one ESP32 device

CREATE TABLE IF NOT EXISTS pads (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  description   VARCHAR(255),
  device_id     INT UNIQUE,                          -- FK → devices.id (1 pad : 1 device)
  tenant_id     INT DEFAULT NULL,                    -- FK → users.id (nullable, unoccupied pad)
  owner_id      INT NOT NULL,                        -- FK → users.id (admin/landlord)
  rate_per_kwh  DECIMAL(10,4) NOT NULL DEFAULT 11.0, -- PHP per kWh (Meralco rate approx.)
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT NOW(),
  updated_at    DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),

  CONSTRAINT fk_pad_device   FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL,
  CONSTRAINT fk_pad_tenant   FOREIGN KEY (tenant_id) REFERENCES users(id)   ON DELETE SET NULL,
  CONSTRAINT fk_pad_owner    FOREIGN KEY (owner_id)  REFERENCES users(id)   ON DELETE RESTRICT
);
