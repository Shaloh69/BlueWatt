#include "logger.h"
#include <stdio.h>

void log_power_data(float voltage, float current, float power_real, float power_factor) {
    LOG_INFO(TAG_POWER, "V: %.2fV | I: %.3fA | P: %.2fW | PF: %.3f",
             voltage, current, power_real, power_factor);
}

void log_anomaly_event(const char *type, float voltage, float current, float power, bool relay_tripped) {
    LOG_ERROR(TAG_ANOMALY, "ANOMALY: %s | V: %.2fV | I: %.3fA | P: %.2fW | RELAY: %s",
              type, voltage, current, power, relay_tripped ? "TRIPPED" : "OK");
}
