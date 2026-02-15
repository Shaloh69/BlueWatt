-- Device API keys for authentication
CREATE TABLE device_keys (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    device_id INT UNSIGNED NOT NULL,
    api_key VARCHAR(255) NOT NULL UNIQUE COMMENT 'API key for device authentication',
    key_hash VARCHAR(255) NOT NULL COMMENT 'Hashed version of API key',
    is_active BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMP NULL,
    expires_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    INDEX idx_api_key (api_key),
    INDEX idx_device_id (device_id),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
