#include "relay_control.h"
#include "logger.h"
#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"

// Relay context
static relay_context_t relay_ctx = {
    .state = RELAY_STATE_OFF,
    .last_toggle_time = 0,
    .auto_reset_enabled = AUTO_RESET_ENABLED,
    .trip_count = 0,
    .last_trip_reason = ANOMALY_NONE
};

// Mutex for thread-safe access
static SemaphoreHandle_t relay_mutex = NULL;

esp_err_t relay_init(void) {
    LOG_INFO(TAG_RELAY, "Initializing relay control...");

    // Create mutex
    relay_mutex = xSemaphoreCreateMutex();
    if (relay_mutex == NULL) {
        LOG_ERROR(TAG_RELAY, "Failed to create relay mutex");
        return ESP_FAIL;
    }

    // Configure GPIO
    gpio_config_t io_conf = {
        .pin_bit_mask = (1ULL << RELAY_GPIO),
        .mode = GPIO_MODE_OUTPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_ENABLE,
        .intr_type = GPIO_INTR_DISABLE
    };

    esp_err_t ret = gpio_config(&io_conf);
    if (ret != ESP_OK) {
        LOG_ERROR(TAG_RELAY, "Failed to configure relay GPIO: %d", ret);
        return ret;
    }

    // Set initial state to OFF (safe state)
    gpio_set_level(RELAY_GPIO, RELAY_OFF_LEVEL);
    relay_ctx.state = RELAY_STATE_OFF;
    relay_ctx.last_toggle_time = xTaskGetTickCount() * portTICK_PERIOD_MS;

    LOG_INFO(TAG_RELAY, "Relay initialized on GPIO%d (Initial state: OFF)", RELAY_GPIO);
    return ESP_OK;
}

static esp_err_t relay_set_gpio(relay_state_t state) {
    int level;

    if (state == RELAY_STATE_ON) {
        level = RELAY_ON_LEVEL;
    } else {
        level = RELAY_OFF_LEVEL;
    }

    return gpio_set_level(RELAY_GPIO, level);
}

bool relay_can_toggle(void) {
    uint32_t current_time = xTaskGetTickCount() * portTICK_PERIOD_MS;
    uint32_t elapsed = current_time - relay_ctx.last_toggle_time;
    return (elapsed >= RELAY_COOLDOWN_MS);
}

esp_err_t relay_set_state(relay_state_t new_state) {
    if (xSemaphoreTake(relay_mutex, pdMS_TO_TICKS(100)) != pdTRUE) {
        return ESP_ERR_TIMEOUT;
    }

    esp_err_t ret = ESP_OK;

    // Check cooldown (unless transitioning from/to TRIPPED state)
    if (relay_ctx.state != RELAY_STATE_TRIPPED && new_state != RELAY_STATE_TRIPPED) {
        if (!relay_can_toggle()) {
            LOG_WARN(TAG_RELAY, "Relay toggle blocked: cooldown not elapsed");
            ret = ESP_ERR_INVALID_STATE;
            goto cleanup;
        }
    }

    // Set GPIO
    ret = relay_set_gpio(new_state);
    if (ret != ESP_OK) {
        LOG_ERROR(TAG_RELAY, "Failed to set relay GPIO");
        goto cleanup;
    }

    // Update state
    relay_ctx.state = new_state;
    relay_ctx.last_toggle_time = xTaskGetTickCount() * portTICK_PERIOD_MS;

    const char *state_str = (new_state == RELAY_STATE_ON) ? "ON" :
                           (new_state == RELAY_STATE_OFF) ? "OFF" : "TRIPPED";
    LOG_INFO(TAG_RELAY, "Relay state changed to: %s", state_str);

cleanup:
    xSemaphoreGive(relay_mutex);
    return ret;
}

esp_err_t relay_emergency_cutoff(anomaly_type_t reason) {
    if (xSemaphoreTake(relay_mutex, pdMS_TO_TICKS(100)) != pdTRUE) {
        return ESP_ERR_TIMEOUT;
    }

    // Emergency cutoff bypasses cooldown timer
    esp_err_t ret = relay_set_gpio(RELAY_STATE_OFF);
    if (ret != ESP_OK) {
        LOG_ERROR(TAG_RELAY, "Failed to perform emergency cutoff");
        goto cleanup;
    }

    relay_ctx.state = RELAY_STATE_TRIPPED;
    relay_ctx.last_toggle_time = xTaskGetTickCount() * portTICK_PERIOD_MS;
    relay_ctx.trip_count++;
    relay_ctx.last_trip_reason = reason;

    LOG_ERROR(TAG_RELAY, "EMERGENCY CUTOFF! Reason: %s (Trip count: %lu)",
              anomaly_type_to_string(reason), relay_ctx.trip_count);

    // TODO: Log to NVS for persistence

cleanup:
    xSemaphoreGive(relay_mutex);
    return ret;
}

relay_state_t relay_get_state(void) {
    relay_state_t state;

    if (xSemaphoreTake(relay_mutex, pdMS_TO_TICKS(100)) == pdTRUE) {
        state = relay_ctx.state;
        xSemaphoreGive(relay_mutex);
    } else {
        // If can't get mutex, return last known state
        state = relay_ctx.state;
    }

    return state;
}

uint32_t relay_get_trip_count(void) {
    return relay_ctx.trip_count;
}

void relay_reset_trip_count(void) {
    if (xSemaphoreTake(relay_mutex, pdMS_TO_TICKS(100)) == pdTRUE) {
        relay_ctx.trip_count = 0;
        LOG_INFO(TAG_RELAY, "Trip count reset");
        xSemaphoreGive(relay_mutex);
    }
}

const char* anomaly_type_to_string(anomaly_type_t type) {
    switch (type) {
        case ANOMALY_NONE:           return "NONE";
        case ANOMALY_OVERCURRENT:    return "OVERCURRENT";
        case ANOMALY_SHORT_CIRCUIT:  return "SHORT_CIRCUIT";
        case ANOMALY_WIRE_FIRE:      return "WIRE_FIRE";
        case ANOMALY_OVERVOLTAGE:    return "OVERVOLTAGE";
        case ANOMALY_UNDERVOLTAGE:   return "UNDERVOLTAGE";
        default:                     return "UNKNOWN";
    }
}
