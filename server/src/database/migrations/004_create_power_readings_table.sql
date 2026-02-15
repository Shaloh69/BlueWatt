-- Power readings table (time-series data)
CREATE TABLE power_readings (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    device_id INT UNSIGNED NOT NULL,
    timestamp TIMESTAMP(3) NOT NULL COMMENT 'Measurement timestamp with millisecond precision',
    voltage_rms DECIMAL(6,2) NOT NULL COMMENT 'RMS voltage in volts',
    current_rms DECIMAL(7,3) NOT NULL COMMENT 'RMS current in amperes',
    power_apparent DECIMAL(10,2) NOT NULL COMMENT 'Apparent power in VA',
    power_real DECIMAL(10,2) NOT NULL COMMENT 'Real power in watts',
    power_factor DECIMAL(4,3) NOT NULL COMMENT 'Power factor (0-1)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    INDEX idx_device_timestamp (device_id, timestamp),
    INDEX idx_timestamp (timestamp),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Note: Partitioning can be added later for production optimization
-- For development, we'll start without partitions
