#pragma once

#include "esp_log.h"
#include "config.h"
#include "pzem_sensor.h"
#include "anomaly_detector.h"

// Log tags per module
#define TAG_MAIN    "MAIN"
#define TAG_PZEM    "PZEM"
#define TAG_ANOMALY "ANOMALY"
#define TAG_RELAY   "RELAY"
#define TAG_WIFI    "WIFI"
#define TAG_HTTP    "HTTP"
#define TAG_PROV    "PROV"

// Level-gated log macros
#define LOG_DEBUG(tag, fmt, ...) \
    do { if (CURRENT_LOG_LEVEL <= LOG_LEVEL_DEBUG) ESP_LOGD(tag, fmt, ##__VA_ARGS__); } while(0)

#define LOG_INFO(tag, fmt, ...) \
    do { if (CURRENT_LOG_LEVEL <= LOG_LEVEL_INFO)  ESP_LOGI(tag, fmt, ##__VA_ARGS__); } while(0)

#define LOG_WARN(tag, fmt, ...) \
    do { if (CURRENT_LOG_LEVEL <= LOG_LEVEL_WARN)  ESP_LOGW(tag, fmt, ##__VA_ARGS__); } while(0)

#define LOG_ERROR(tag, fmt, ...) \
    do { if (CURRENT_LOG_LEVEL <= LOG_LEVEL_ERROR) ESP_LOGE(tag, fmt, ##__VA_ARGS__); } while(0)

/**
 * @brief Log a formatted PZEM power data reading.
 */
void log_power_data(const pzem_data_t *data);

/**
 * @brief Log a formatted anomaly event.
 */
void log_anomaly_event(const anomaly_event_t *event);
