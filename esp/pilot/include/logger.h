#ifndef LOGGER_H
#define LOGGER_H

#include "esp_log.h"
#include "config.h"

// Tag definitions for different modules
#define TAG_MAIN        "MAIN"
#define TAG_SENSOR      "SENSOR"
#define TAG_POWER       "POWER"
#define TAG_ANOMALY     "ANOMALY"
#define TAG_RELAY       "RELAY"
#define TAG_WIFI        "WIFI"
#define TAG_HTTP        "HTTP"

// Logging macros that respect CURRENT_LOG_LEVEL
#if CURRENT_LOG_LEVEL <= LOG_LEVEL_DEBUG
    #define LOG_DEBUG(tag, format, ...) ESP_LOGD(tag, format, ##__VA_ARGS__)
#else
    #define LOG_DEBUG(tag, format, ...)
#endif

#if CURRENT_LOG_LEVEL <= LOG_LEVEL_INFO
    #define LOG_INFO(tag, format, ...) ESP_LOGI(tag, format, ##__VA_ARGS__)
#else
    #define LOG_INFO(tag, format, ...)
#endif

#if CURRENT_LOG_LEVEL <= LOG_LEVEL_WARNING
    #define LOG_WARN(tag, format, ...) ESP_LOGW(tag, format, ##__VA_ARGS__)
#else
    #define LOG_WARN(tag, format, ...)
#endif

#define LOG_ERROR(tag, format, ...) ESP_LOGE(tag, format, ##__VA_ARGS__)

// Special logging functions for power data and anomalies
void log_power_data(float voltage, float current, float power_real, float power_factor);
void log_anomaly_event(const char *type, float voltage, float current, float power, bool relay_tripped);

#endif // LOGGER_H
