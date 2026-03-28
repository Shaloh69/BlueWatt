#pragma once

#include "driver/gpio.h"
#include "driver/uart.h"

// ============================================================
// PZEM-004T v3.0 Configuration
// Physical wiring: PZEM TX -> ESP RX0 (GPIO3), PZEM RX -> ESP TX0 (GPIO1)
// Using natural UART0 IOMUX pins (no software swap needed)
// Console disabled (CONFIG_ESP_CONSOLE_NONE) so GPIO1/GPIO3 are free
// ============================================================
#define PZEM_UART_NUM           UART_NUM_0
#define PZEM_TX_PIN             GPIO_NUM_1   // GPIO1 (TX0) UART0 native TX -> PZEM RX
#define PZEM_RX_PIN             GPIO_NUM_3   // GPIO3 (RX0) UART0 native RX <- PZEM TX
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
#define OVERCURRENT_THRESHOLD_A     15.0f
#define SHORT_CIRCUIT_THRESHOLD_A   50.0f
#define MAX_POWER_W                 3000.0f
#define WIRE_FIRE_POWER_RATIO       1.5f
#define WIRE_FIRE_MIN_POWER_W       2100.0f  // 70% of max before ratio check
#define OVERCURRENT_CONFIRM_COUNT   3        // Consecutive readings to confirm
#define FIRE_HISTORY_SIZE           10       // Rolling window for wire fire

// ============================================================
// WiFi Configuration
// ============================================================
#define WIFI_DEFAULT_SSID       "YourSSID"
#define WIFI_DEFAULT_PASSWORD   "YourPassword"
#define WIFI_MAX_RETRY          5
#define WIFI_RECONNECT_MS       10000

// ============================================================
// HTTP Server
// ============================================================
#define HTTP_SERVER_URL         "http://192.168.1.100:3000"
#define HTTP_TIMEOUT_MS         5000
#define HTTP_API_KEY            "bluewatt-api-key"
#define HTTP_POWER_INTERVAL     10           // POST every N PZEM reads (~10s)
#define HTTP_DEVICE_ID          "bluewatt-001"

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

