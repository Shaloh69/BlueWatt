-- Hourly power aggregates for efficient querying
CREATE TABLE power_aggregates_hourly (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    device_id INT UNSIGNED NOT NULL,
    hour_start TIMESTAMP NOT NULL COMMENT 'Start of the hour',
    avg_voltage DECIMAL(6,2) COMMENT 'Average voltage for the hour',
    avg_current DECIMAL(7,3) COMMENT 'Average current for the hour',
    avg_power_real DECIMAL(10,2) COMMENT 'Average real power',
    max_power_real DECIMAL(10,2) COMMENT 'Maximum power during hour',
    min_power_real DECIMAL(10,2) COMMENT 'Minimum power during hour',
    total_energy_kwh DECIMAL(10,4) COMMENT 'Total energy consumed in kWh',
    avg_power_factor DECIMAL(4,3) COMMENT 'Average power factor',
    reading_count INT UNSIGNED COMMENT 'Number of readings in this hour',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    UNIQUE KEY uk_device_hour (device_id, hour_start),
    INDEX idx_hour_start (hour_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
