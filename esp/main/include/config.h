#pragma once

#include "driver/gpio.h"
#include "driver/uart.h"

// ============================================================
// PZEM-004T v3.0 Configuration
// Physical wiring (custom PCB — TX-to-TX, RX-to-RX, DO NOT change):
//   PZEM TX -> ESP GPIO1 (TX0)
//   PZEM RX -> ESP GPIO3 (RX0)
// Console disabled (CONFIG_ESP_CONSOLE_NONE) so GPIO1/GPIO3 are free
// ============================================================
#define PZEM_UART_NUM           UART_NUM_0
#define PZEM_TX_PIN             GPIO_NUM_1   // GPIO1 (TX0) -> PZEM TX (TX-to-TX, custom PCB)
#define PZEM_RX_PIN             GPIO_NUM_3   // GPIO3 (RX0) -> PZEM RX (RX-to-RX, custom PCB)
#define PZEM_BAUD_RATE          9600
#define PZEM_DEVICE_ADDR        0xF8         // Common default for many PZEM-004T v3 modules
#define PZEM_READ_TIMEOUT_MS    1000
#define PZEM_READ_INTERVAL_MS   1000         // Read every 1 second
#define PZEM_UART_BUF_SIZE      256

// ============================================================
// Relay — SLA-05VDC-SL-C (optocoupler-isolated module)
// Active LOW: IN=LOW  -> relay energized (ON/closed)
//             IN=HIGH -> relay de-energized (OFF/open)
// ============================================================
#define RELAY_GPIO              GPIO_NUM_14
#define RELAY_ACTIVE_LEVEL      0            // 0 = active LOW
#define RELAY_COOLDOWN_MS       1000
#define RELAY_AUTO_RESET        false

// ============================================================
// Status LED
// ============================================================
#define STATUS_LED_GPIO         GPIO_NUM_2

// ============================================================
// Electrical System (Philippines: 220V AC, 60Hz)
// ============================================================
#define NOMINAL_VOLTAGE_V       220.0f
#define NOMINAL_FREQUENCY_HZ    60.0f
#define VOLTAGE_MIN_V           180.0f
#define VOLTAGE_MAX_V           250.0f

// ============================================================
// Anomaly Detection Thresholds
// ============================================================
#define OVERCURRENT_THRESHOLD_A     28.0f  // Relay rated 30A — 2A safety margin
#define SHORT_CIRCUIT_THRESHOLD_A   50.0f
#define MAX_POWER_W                 3000.0f
#define WIRE_FIRE_POWER_RATIO       1.5f
#define WIRE_FIRE_MIN_POWER_W       2100.0f  // 70% of max before ratio check
#define OVERCURRENT_CONFIRM_COUNT   3        // Consecutive readings to confirm
#define FIRE_HISTORY_SIZE           10       // Rolling window for wire fire

// ============================================================
// WiFi Configuration
// ============================================================
#define WIFI_DEFAULT_SSID       "YourWiFiName"       // ← your WiFi name
#define WIFI_DEFAULT_PASSWORD   "YourWiFiPassword"   // ← your WiFi password
#define WIFI_MAX_RETRY          5
#define WIFI_RECONNECT_MS       10000

// ============================================================
// HTTP Server
// ============================================================
#define HTTP_SERVER_URL         "https://bluewatt-api.onrender.com"
#define HTTP_TIMEOUT_MS         30000                // 30s — Render cold starts can be slow
#define HTTP_API_KEY            "bw_fd0fdbbc6e3f51a520eba4d733df02ac88ffd559f7c4f4837dcc45c06b138a2b"
#define HTTP_POWER_INTERVAL     10
#define HTTP_DEVICE_ID          "bluewatt-004"

// ============================================================
// NVS
// ============================================================
#define NVS_NAMESPACE           "bluewatt"
#define NVS_MAX_TRIP_LOGS       100

// ============================================================
// FreeRTOS Task Priorities (higher = more urgent)
// ============================================================
#define TASK_PRIORITY_PZEM_READ     9
#define TASK_PRIORITY_ANOMALY       9
#define TASK_PRIORITY_RELAY         8
#define TASK_PRIORITY_WIFI          3
#define TASK_PRIORITY_HTTP          2

// Task stack sizes (in words / 4 bytes each)
#define TASK_STACK_PZEM_READ        4096
#define TASK_STACK_ANOMALY          4096
#define TASK_STACK_RELAY            2048
#define TASK_STACK_WIFI             4096
#define TASK_STACK_HTTP             8192

// ============================================================
// Queue Sizes
// ============================================================
#define QUEUE_POWER_DATA_SIZE       5
#define QUEUE_ANOMALY_EVENTS_SIZE   10
#define QUEUE_HTTP_EVENTS_SIZE      20
#define QUEUE_HTTP_POWER_SIZE       5

// ============================================================
// Logging Levels
// ============================================================
#define LOG_LEVEL_DEBUG     0
#define LOG_LEVEL_INFO      1
#define LOG_LEVEL_WARN      2
#define LOG_LEVEL_ERROR     3
#define CURRENT_LOG_LEVEL   LOG_LEVEL_INFO

