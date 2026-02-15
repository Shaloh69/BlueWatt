-- Anomaly events table for electrical safety alerts
CREATE TABLE anomaly_events (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    device_id INT UNSIGNED NOT NULL,
    timestamp TIMESTAMP(3) NOT NULL COMMENT 'When anomaly was detected',
    anomaly_type ENUM('overcurrent', 'short_circuit', 'wire_fire', 'overvoltage', 'undervoltage', 'overpower', 'arc_fault', 'ground_fault') NOT NULL,
    severity ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
    current_value DECIMAL(7,3) COMMENT 'Current at time of anomaly (A)',
    voltage_value DECIMAL(6,2) COMMENT 'Voltage at time of anomaly (V)',
    power_value DECIMAL(10,2) COMMENT 'Power at time of anomaly (W)',
    relay_tripped BOOLEAN DEFAULT FALSE COMMENT 'Whether relay was triggered',
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP NULL,
    resolved_by INT UNSIGNED NULL COMMENT 'User who resolved the anomaly',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_device_timestamp (device_id, timestamp),
    INDEX idx_anomaly_type (anomaly_type),
    INDEX idx_severity (severity),
    INDEX idx_resolved (is_resolved),
    INDEX idx_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
