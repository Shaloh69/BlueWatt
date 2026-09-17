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
// Electrical System (Philippines: 230V AC, 60Hz)
// Compliant with PEC 2017 / IEC 60038 — nominal 230V, ±10% tolerance
// Undervoltage limit: 230V × 0.90 = 207V (PEC Section 230)
// Overvoltage limit:  230V × 1.10 = 253V (PEC Section 230)
// ============================================================
#define NOMINAL_VOLTAGE_V       230.0f
#define NOMINAL_FREQUENCY_HZ    60.0f
#define VOLTAGE_MIN_V           207.0f   // PEC 2017: 230V - 10%
#define VOLTAGE_MAX_V           253.0f   // PEC 2017: 230V + 10%

// ============================================================
// Anomaly Detection Thresholds
// PEC 2017 Section 240: overcurrent protection must not exceed conductor ampacity.
//
// POLICY: the relay is rated 30A (SLA-05VDC-SL-C) and 30A is the hard ceiling
// this device protects.  Anything AT OR BELOW 30A is treated as a legal load and
// must NEVER trip the relay.  Only a load sustained ABOVE 30A trips.
//
//   30A @ 230V = 6900 VA  — the protected ceiling.
//   Reference load (1.5kW heater + 1.5kW air fryer + 1.0HP aircon):
//       P = 4000 W, S = 4176 VA, I = 18.2 A  → 61% of the 30A limit.
//   That combination is expected to run indefinitely without tripping.
//
// NOTE: 30A only protects the RELAY.  The branch conductor sets the real PEC
// ampacity limit — 2.0mm² THHN is 20A and 3.5mm² is 30A.  On a circuit wired
// below 30A the house breaker is the protective device and will open first;
// this threshold is deliberately aligned to the relay, not the wire.
// ============================================================
#define OVERCURRENT_THRESHOLD_A     30.0f  // Trip only ABOVE this — exactly 30.000A does NOT trip
#define OVERCURRENT_CONFIRM_COUNT   9      // 9 consecutive 1s reads => ~9s sustained before trip

// Short circuit: must clear a running aircon's locked-rotor inrush.
// Worst realistic case measured: 1.5HP compressor LRA ~49A + 13A resistive = ~62A
// for ~0.2s.  80A sits above that and below the PZEM-004T 100A ceiling.
#define SHORT_CIRCUIT_THRESHOLD_A   80.0f  // Severe fault detection (PZEM max 100A)
#define SHORT_CIRCUIT_CONFIRM_COUNT 2      // 2 reads — rejects a single-sample inrush spike

// High-load / thermal warning. REPORT-ONLY: this never operates the relay.
// Floor is pinned to the same 30A ceiling (30A x 230V = 6900W) so it can never
// fire on a legal load.  Reported to the server as anomaly_type "WIRE_FIRE".
#define WIRE_FIRE_POWER_RATIO       1.5f    // 1.5x adaptive baseline AND above the watt floor
#define WIRE_FIRE_MIN_POWER_W       6900.0f // 30A x 230V — matches OVERCURRENT_THRESHOLD_A
#define FIRE_HISTORY_SIZE           10      // Rolling 10s window for thermal runaway

// Non-tripping anomalies (wire fire, over/undervoltage) repeat at most this often.
// Without this a brownout below VOLTAGE_MIN_V would POST one event every second.
// Tripping anomalies (short circuit, overcurrent) are never throttled.
#define ANOMALY_REPEAT_REPORT_S     60

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

