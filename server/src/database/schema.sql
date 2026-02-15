-- =====================================================
-- BlueWatt Database Schema - Complete Migration Script
-- Version: 1.0.0
-- Description: Complete database schema for BlueWatt electrical monitoring system
-- =====================================================

-- =====================================================
-- VERSION 1: Core Infrastructure (Migration Tracking)
-- =====================================================

-- Migrations log table to track applied migrations
CREATE TABLE IF NOT EXISTS migrations_log (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    migration_name VARCHAR(255) NOT NULL UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_migration_name (migration_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- VERSION 2: User Management
-- =====================================================

-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role ENUM('admin', 'user') DEFAULT 'user',
    is_active BOOLEAN DEFAULT TRUE,
    profile_image_url VARCHAR(500) NULL COMMENT 'Supabase storage URL for profile image',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP NULL,
    INDEX idx_email (email),
    INDEX idx_role (role),
    INDEX idx_created_at (created_at),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- VERSION 3: Device Management
-- =====================================================

-- Devices table for ESP32 registry
CREATE TABLE IF NOT EXISTS devices (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(100) NOT NULL UNIQUE COMMENT 'ESP32 device identifier (e.g., ESP32_001)',
    owner_id INT UNSIGNED NOT NULL COMMENT 'User who owns this device',
    device_name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    relay_status ENUM('on', 'off', 'tripped') DEFAULT 'on',
    device_image_url VARCHAR(500) NULL COMMENT 'Supabase storage URL for device image',
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

-- =====================================================
-- VERSION 4: Device Authentication
-- =====================================================

-- Device API keys table for ESP32 authentication
CREATE TABLE IF NOT EXISTS device_keys (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    device_id INT UNSIGNED NOT NULL,
    key_hash VARCHAR(255) NOT NULL COMMENT 'Bcrypt hash of the API key',
    name VARCHAR(100) COMMENT 'Optional key name for identification',
    is_active BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    INDEX idx_device_id (device_id),
    INDEX idx_active (is_active),
    INDEX idx_last_used (last_used_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- VERSION 5: Time-Series Power Data
-- =====================================================

-- Power readings table (partitioned by month for performance)
CREATE TABLE IF NOT EXISTS power_readings (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    device_id INT UNSIGNED NOT NULL,
    timestamp TIMESTAMP(3) NOT NULL COMMENT 'Reading timestamp with millisecond precision',
    voltage_rms DECIMAL(6,2) NOT NULL COMMENT 'RMS voltage (V)',
    current_rms DECIMAL(7,3) NOT NULL COMMENT 'RMS current (A)',
    power_apparent DECIMAL(10,2) NOT NULL COMMENT 'Apparent power (VA)',
    power_real DECIMAL(10,2) NOT NULL COMMENT 'Real power (W)',
    power_factor DECIMAL(4,3) NOT NULL COMMENT 'Power factor (0-1)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    INDEX idx_device_timestamp (device_id, timestamp),
    INDEX idx_timestamp (timestamp),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- VERSION 6: Anomaly Detection & Safety
-- =====================================================

-- Anomaly events table for electrical safety alerts
CREATE TABLE IF NOT EXISTS anomaly_events (
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

-- =====================================================
-- VERSION 7: Data Aggregation (Hourly)
-- =====================================================

-- Hourly power aggregates for efficient dashboard queries
CREATE TABLE IF NOT EXISTS power_aggregates_hourly (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    device_id INT UNSIGNED NOT NULL,
    hour_start TIMESTAMP NOT NULL COMMENT 'Start of the hour',
    avg_voltage DECIMAL(6,2) NOT NULL,
    avg_current DECIMAL(7,3) NOT NULL,
    avg_power_real DECIMAL(10,2) NOT NULL,
    max_power_real DECIMAL(10,2) NOT NULL,
    min_power_real DECIMAL(10,2) NOT NULL,
    total_energy_kwh DECIMAL(12,4) NOT NULL COMMENT 'Total kWh for the hour',
    avg_power_factor DECIMAL(4,3) NOT NULL,
    reading_count INT UNSIGNED NOT NULL COMMENT 'Number of readings aggregated',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    UNIQUE KEY unique_device_hour (device_id, hour_start),
    INDEX idx_device_hour (device_id, hour_start),
    INDEX idx_hour_start (hour_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- VERSION 8: Data Aggregation (Daily)
-- =====================================================

-- Daily power aggregates for long-term trends
CREATE TABLE IF NOT EXISTS power_aggregates_daily (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    device_id INT UNSIGNED NOT NULL,
    date DATE NOT NULL COMMENT 'Date of aggregation',
    avg_voltage DECIMAL(6,2) NOT NULL,
    avg_current DECIMAL(7,3) NOT NULL,
    avg_power_real DECIMAL(10,2) NOT NULL,
    max_power_real DECIMAL(10,2) NOT NULL,
    min_power_real DECIMAL(10,2) NOT NULL,
    total_energy_kwh DECIMAL(12,4) NOT NULL COMMENT 'Total kWh for the day',
    avg_power_factor DECIMAL(4,3) NOT NULL,
    peak_hour VARCHAR(5) COMMENT 'Hour with peak power (HH:00)',
    reading_count INT UNSIGNED NOT NULL,
    anomaly_count INT UNSIGNED DEFAULT 0 COMMENT 'Number of anomalies detected',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    UNIQUE KEY unique_device_date (device_id, date),
    INDEX idx_device_date (device_id, date),
    INDEX idx_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- Record successful migration
-- =====================================================

INSERT IGNORE INTO migrations_log (migration_name) VALUES
    ('000_create_migrations_log'),
    ('001_create_users_table'),
    ('002_create_devices_table'),
    ('003_create_device_keys_table'),
    ('004_create_power_readings_table'),
    ('005_create_anomaly_events_table'),
    ('006_create_power_aggregates_hourly'),
    ('007_create_power_aggregates_daily'),
    ('008_add_profile_images');

-- =====================================================
-- End of Schema
-- =====================================================
