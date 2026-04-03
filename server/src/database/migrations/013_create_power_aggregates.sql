-- Migration 005: Power aggregate tables (hourly / daily / monthly)
-- Pre-computed for fast report and graph queries, populated by cron jobs

CREATE TABLE IF NOT EXISTS power_aggregates_hourly (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  device_id         INT NOT NULL,
  hour_start        DATETIME NOT NULL,
  avg_voltage       FLOAT NOT NULL DEFAULT 0,
  avg_current       FLOAT NOT NULL DEFAULT 0,
  avg_power_real    FLOAT NOT NULL DEFAULT 0,
  max_power_real    FLOAT NOT NULL DEFAULT 0,
  min_power_real    FLOAT NOT NULL DEFAULT 0,
  total_energy_kwh  DECIMAL(10,6) NOT NULL DEFAULT 0,
  avg_power_factor  FLOAT NOT NULL DEFAULT 0,
  reading_count     INT NOT NULL DEFAULT 0,
  created_at        DATETIME NOT NULL DEFAULT NOW(),

  UNIQUE KEY uq_dev_hour (device_id, hour_start),
  CONSTRAINT fk_hagg_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS power_aggregates_daily (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  device_id         INT NOT NULL,
  date              DATE NOT NULL,
  avg_voltage       FLOAT NOT NULL DEFAULT 0,
  avg_current       FLOAT NOT NULL DEFAULT 0,
  avg_power_real    FLOAT NOT NULL DEFAULT 0,
  max_power_real    FLOAT NOT NULL DEFAULT 0,
  min_power_real    FLOAT NOT NULL DEFAULT 0,
  total_energy_kwh  DECIMAL(10,4) NOT NULL DEFAULT 0,
  avg_power_factor  FLOAT NOT NULL DEFAULT 0,
  peak_hour         TINYINT DEFAULT NULL,
  reading_count     INT NOT NULL DEFAULT 0,
  anomaly_count     INT NOT NULL DEFAULT 0,
  created_at        DATETIME NOT NULL DEFAULT NOW(),

  UNIQUE KEY uq_dev_date (device_id, date),
  CONSTRAINT fk_dagg_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS power_aggregates_monthly (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  device_id         INT NOT NULL,
  year_month        CHAR(7) NOT NULL,               -- '2026-03'
  total_energy_kwh  DECIMAL(10,4) NOT NULL DEFAULT 0,
  avg_power_real    FLOAT NOT NULL DEFAULT 0,
  max_power_real    FLOAT NOT NULL DEFAULT 0,
  avg_voltage       FLOAT NOT NULL DEFAULT 0,
  avg_current       FLOAT NOT NULL DEFAULT 0,
  avg_power_factor  FLOAT NOT NULL DEFAULT 0,
  anomaly_count     INT NOT NULL DEFAULT 0,
  created_at        DATETIME NOT NULL DEFAULT NOW(),

  UNIQUE KEY uq_dev_month (device_id, year_month),
  CONSTRAINT fk_magg_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

-- Also add energy_kwh and frequency to power_readings if not already present
ALTER TABLE power_readings
  ADD COLUMN energy_kwh DECIMAL(10,4) DEFAULT NULL AFTER power_factor,
  ADD COLUMN frequency  FLOAT         DEFAULT NULL AFTER energy_kwh;
