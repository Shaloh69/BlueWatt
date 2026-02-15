-- Devices table for ESP32 registry
CREATE TABLE devices (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(100) NOT NULL UNIQUE COMMENT 'ESP32 device identifier (e.g., ESP32_001)',
    owner_id INT UNSIGNED NOT NULL COMMENT 'User who owns this device',
    device_name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    relay_status ENUM('on', 'off', 'tripped') DEFAULT 'on',
    last_seen_at TIMESTAMP NULL COMMENT 'Last time device sent data',
    firmware_version VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_device_id (device_id),
    INDEX idx_owner_id (owner_id),
    INDEX idx_last_seen (last_seen_at),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
