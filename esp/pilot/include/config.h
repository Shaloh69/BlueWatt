#ifndef CONFIG_H
#define CONFIG_H

#include <stdint.h>
#include <stdbool.h>
#include "driver/gpio.h"

// ============================================================================
// GPIO PIN DEFINITIONS
// ============================================================================

// ADC Sensor Pins (using ADC1 to avoid WiFi conflicts)
#define CURRENT_SENSOR_GPIO     GPIO_NUM_34    // ADC1_CH6
#define VOLTAGE_SENSOR_GPIO     GPIO_NUM_35    // ADC1_CH7

// Relay Control
#define RELAY_GPIO              GPIO_NUM_25    // Digital output
#define RELAY_ON_LEVEL          1              // Active HIGH
#define RELAY_OFF_LEVEL         0

// Status LED (optional, for future use)
#define STATUS_LED_GPIO         GPIO_NUM_2     // Built-in LED

// ============================================================================
// ADC CONFIGURATION
// ============================================================================

#define ADC_UNIT                ADC_UNIT_1
#define CURRENT_SENSOR_CH       ADC_CHANNEL_6  // GPIO34
#define VOLTAGE_SENSOR_CH       ADC_CHANNEL_7  // GPIO35
#define ADC_ATTEN               ADC_ATTEN_DB_12 // 0-3.3V range
#define ADC_BIT_WIDTH           ADC_BITWIDTH_12 // 12-bit resolution (0-4095)

// Sampling Configuration
#define SAMPLE_RATE_HZ          2000           // 2kHz sampling rate
#define SAMPLES_PER_CYCLE       40             // For 50Hz AC (2000Hz / 50Hz)
#define CALC_CYCLES             10             // Average over 10 AC cycles
#define TOTAL_SAMPLES           (SAMPLES_PER_CYCLE * CALC_CYCLES)  // 400 samples

// Sample timing
#define SAMPLE_PERIOD_US        (1000000 / SAMPLE_RATE_HZ)  // 500 microseconds

// ============================================================================
// SENSOR CALIBRATION CONSTANTS
// ============================================================================

// ACS712 Current Sensor
// Supported models: ACS712-5A, ACS712-20A, ACS712-30A
// Uncomment the one you're using:

// #define ACS712_5A    // 185 mV/A sensitivity
#define ACS712_20A   // 100 mV/A sensitivity (default)
// #define ACS712_30A   // 66 mV/A sensitivity

#ifdef ACS712_5A
    #define CURRENT_SENSITIVITY     0.185f  // V/A
    #define CURRENT_MAX_RATING      5.0f    // Maximum current (A)
#elif defined(ACS712_20A)
    #define CURRENT_SENSITIVITY     0.100f  // V/A
    #define CURRENT_MAX_RATING      20.0f   // Maximum current (A)
#elif defined(ACS712_30A)
    #define CURRENT_SENSITIVITY     0.066f  // V/A
    #define CURRENT_MAX_RATING      30.0f   // Maximum current (A)
#else
    #error "Please define one of: ACS712_5A, ACS712_20A, or ACS712_30A"
#endif

#define CURRENT_ZERO_OFFSET     2.5f    // Zero current voltage (V)

// ZMPT101B Voltage Sensor
// Typical ratio: 1:1000 (220V AC → 220mV output)
#define VOLTAGE_SCALING_FACTOR  1000.0f // Multiply ADC voltage by this
#define VOLTAGE_CALIBRATION     1.0f    // Fine-tune calibration (adjust after testing)

// ============================================================================
// ELECTRICAL SYSTEM SPECIFICATIONS (Philippines 220V AC)
// ============================================================================

#define VOLTAGE_NOMINAL         220.0f    // Nominal voltage (V)
#define FREQUENCY_HZ            60.0f     // AC frequency (Hz) - Philippines uses 60Hz
#define VOLTAGE_MIN_THRESHOLD   180.0f    // Under-voltage threshold
#define VOLTAGE_MAX_THRESHOLD   250.0f    // Over-voltage threshold

// ============================================================================
// ANOMALY DETECTION THRESHOLDS
// ============================================================================

// Current Thresholds
#define CURRENT_NORMAL_MAX      10.0f     // Normal maximum current (A) - adjust per installation
#define CURRENT_OVERCURRENT     15.0f     // Overcurrent threshold (A)
#define CURRENT_SHORT_CIRCUIT   50.0f     // Short circuit threshold (A)

// Power Thresholds
#define POWER_MAX_THRESHOLD     3000.0f   // Maximum power (W)
#define POWER_FACTOR_MIN        0.5f      // Minimum acceptable power factor

// Wire Fire Detection (Thermal Runaway)
#define TEMP_RISE_THRESHOLD     1.5f      // Power increase multiplier for fire detection
#define FIRE_DETECT_MIN_POWER   2100.0f   // Minimum power to trigger fire detection (70% of max)
#define FIRE_HISTORY_SIZE       10        // Number of readings to track

// Debouncing
#define ANOMALY_CONFIRM_COUNT   3         // Consecutive detections before triggering

// ============================================================================
// RELAY CONTROL CONFIGURATION
// ============================================================================

#define RELAY_COOLDOWN_MS       5000      // Minimum time between relay toggles (ms)
#define AUTO_RESET_ENABLED      false     // Auto-reset after trip (future feature)
#define AUTO_RESET_DELAY_MS     60000     // Delay before auto-reset (ms)
#define MAX_RETRY_ATTEMPTS      3         // Maximum auto-reset attempts per hour

// ============================================================================
// WIFI CONFIGURATION
// ============================================================================

// WiFi Credentials (hardcoded for now - TODO: make configurable via captive portal)
#define WIFI_SSID               "YourWiFiSSID"
#define WIFI_PASSWORD           "YourWiFiPassword"
#define WIFI_MAXIMUM_RETRY      5
#define WIFI_RECONNECT_MS       10000     // Retry every 10 seconds

// ============================================================================
// HTTP CLIENT CONFIGURATION
// ============================================================================

// Server Configuration
#define HTTP_SERVER_URL         "http://192.168.1.100:3000"  // Change to your server
#define API_KEY                 "your-api-key-here"          // Device API key
#define DEVICE_ID               "ESP32_001"                  // Unique device ID

// HTTP Settings
#define HTTP_TIMEOUT_MS         5000      // Request timeout
#define HTTP_RETRY_COUNT        3         // Number of retries on failure
#define DATA_SEND_INTERVAL_MS   10000     // Send data every 10 seconds

// Endpoints
#define ENDPOINT_POWER_DATA     "/api/power-data"
#define ENDPOINT_ANOMALY_EVENT  "/api/anomaly-events"

// ============================================================================
// FREERTOS TASK CONFIGURATION
// ============================================================================

// Task Priorities (higher number = higher priority)
#define TASK_PRIORITY_SENSOR    10  // Highest - real-time sampling
#define TASK_PRIORITY_POWER     9   // High - power calculations
#define TASK_PRIORITY_ANOMALY   9   // High - anomaly detection
#define TASK_PRIORITY_RELAY     8   // High - relay control
#define TASK_PRIORITY_WIFI      3   // Low - background connectivity
#define TASK_PRIORITY_HTTP      2   // Low - data transmission

// Stack Sizes (bytes)
#define STACK_SIZE_SENSOR       4096
#define STACK_SIZE_POWER        4096
#define STACK_SIZE_ANOMALY      4096
#define STACK_SIZE_RELAY        2048
#define STACK_SIZE_WIFI         4096
#define STACK_SIZE_HTTP         8192

// Queue Sizes
#define QUEUE_SIZE_POWER_DATA   5
#define QUEUE_SIZE_ANOMALIES    10
#define QUEUE_SIZE_HTTP_EVENTS  20
#define QUEUE_SIZE_HTTP_POWER   5

// ============================================================================
// CIRCULAR BUFFER CONFIGURATION
// ============================================================================

#define SAMPLE_BUFFER_SIZE      (TOTAL_SAMPLES * 2)  // Double buffer for safety

// ============================================================================
// LOGGING CONFIGURATION
// ============================================================================

#define LOG_LEVEL_DEBUG         1
#define LOG_LEVEL_INFO          2
#define LOG_LEVEL_WARNING       3
#define LOG_LEVEL_ERROR         4

#define CURRENT_LOG_LEVEL       LOG_LEVEL_INFO  // Change to DEBUG for verbose logs

// ============================================================================
// WATCHDOG TIMER
// ============================================================================

#define WATCHDOG_TIMEOUT_SEC    30      // Watchdog timeout (seconds)

// ============================================================================
// DATA RETENTION
// ============================================================================

#define NVS_NAMESPACE           "bluewatt"
#define MAX_TRIP_LOG_ENTRIES    100     // Maximum trip events to store

#endif // CONFIG_H
