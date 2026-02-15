-- Daily power aggregates for long-term statistics
CREATE TABLE power_aggregates_daily (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    device_id INT UNSIGNED NOT NULL,
    date DATE NOT NULL COMMENT 'Date of aggregation',
    avg_voltage DECIMAL(6,2) COMMENT 'Average voltage for the day',
    avg_current DECIMAL(7,3) COMMENT 'Average current for the day',
    avg_power_real DECIMAL(10,2) COMMENT 'Average real power',
    max_power_real DECIMAL(10,2) COMMENT 'Peak power during day',
    min_power_real DECIMAL(10,2) COMMENT 'Minimum power during day',
    total_energy_kwh DECIMAL(10,4) COMMENT 'Total energy consumed in kWh',
    avg_power_factor DECIMAL(4,3) COMMENT 'Average power factor',
    peak_hour TIME COMMENT 'Hour with highest power consumption',
    reading_count INT UNSIGNED COMMENT 'Number of readings in this day',
    anomaly_count INT UNSIGNED DEFAULT 0 COMMENT 'Number of anomalies detected',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    UNIQUE KEY uk_device_date (device_id, date),
    INDEX idx_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
