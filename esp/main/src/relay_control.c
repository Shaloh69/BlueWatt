#include "relay_control.h"
#include "config.h"
#include "logger.h"

#include "driver/gpio.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"

static relay_context_t relay_ctx;
static SemaphoreHandle_t relay_mutex = NULL;

// SLA-05VDC-SL-C isolated module: active LOW
// RELAY_ACTIVE_LEVEL = 0 -> relay ON when GPIO LOW
static void relay_set_gpio(relay_state_t state)
{
    int level;
    if (state == RELAY_STATE_ON) {
        level = RELAY_ACTIVE_LEVEL;         // 0 -> relay energized
    } else {
        level = 1 - RELAY_ACTIVE_LEVEL;    // 1 -> relay de-energized
    }
    gpio_set_level(RELAY_GPIO, level);
}

esp_err_t relay_init(void)
{
    relay_mutex = xSemaphoreCreateBinary();
    if (!relay_mutex) {
        ESP_LOGE(TAG_RELAY, "Failed to create relay mutex");
        return ESP_ERR_NO_MEM;
    }
    xSemaphoreGive(relay_mutex);

    gpio_config_t io_conf = {
        .pin_bit_mask = (1ULL << RELAY_GPIO),
        .mode         = GPIO_MODE_OUTPUT_OD,  // open-drain: releases to 5V pull-up on OFF
        .pull_up_en   = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type    = GPIO_INTR_DISABLE,
    };
    gpio_config(&io_conf);

    // Safe initial state: relay OFF (de-energized)
    relay_set_gpio(RELAY_STATE_OFF);

    relay_ctx.state            = RELAY_STATE_OFF;
    // Initialise as if the cooldown already elapsed so buttons work immediately.
    // uint32 underflow trick: 0 - (COOLDOWN+1) wraps to a value whose distance
    // from any early 'now' is already >= RELAY_COOLDOWN_MS.
    relay_ctx.last_toggle_ms   = (uint32_t)(-(int32_t)RELAY_COOLDOWN_MS - 1);
    relay_ctx.auto_reset       = RELAY_AUTO_RESET;
    relay_ctx.trip_count       = 0;
    relay_ctx.last_trip_reason = ANOMALY_NONE;

    ESP_LOGI(TAG_RELAY, "Relay initialized: GPIO%d active-LOW (SLA-05VDC-SL-C)",
             RELAY_GPIO);
    return ESP_OK;
}

bool relay_can_toggle(void)
{
    uint32_t now = xTaskGetTickCount() * portTICK_PERIOD_MS;
    return (now - relay_ctx.last_toggle_ms) >= RELAY_COOLDOWN_MS;
}

esp_err_t relay_set_state(relay_state_t new_state)
{
    if (xSemaphoreTake(relay_mutex, pdMS_TO_TICKS(100)) != pdTRUE) {
        return ESP_ERR_TIMEOUT;
    }

    // Cannot override TRIPPED via normal set_state
    if (relay_ctx.state == RELAY_STATE_TRIPPED && new_state != RELAY_STATE_OFF) {
        xSemaphoreGive(relay_mutex);
        ESP_LOGW(TAG_RELAY, "Relay is TRIPPED — reset required before changing state");
        return ESP_ERR_INVALID_STATE;
    }

    if (relay_ctx.state == new_state) {
        xSemaphoreGive(relay_mutex);
        return ESP_OK;
    }

    if (new_state == RELAY_STATE_ON && !relay_can_toggle() && relay_ctx.state != RELAY_STATE_TRIPPED) {
        xSemaphoreGive(relay_mutex);
        ESP_LOGW(TAG_RELAY, "Relay cooldown not elapsed");
        return ESP_ERR_INVALID_STATE;
    }

    relay_set_gpio(new_state);
    relay_ctx.state = new_state;
    // Cooldown protects against rapid OFF→ON cycling.
    // Timer only starts when going OFF so a quick ON→OFF→(wait 1s)→ON works.
    if (new_state == RELAY_STATE_OFF) {
        relay_ctx.last_toggle_ms = xTaskGetTickCount() * portTICK_PERIOD_MS;
    }

    ESP_LOGI(TAG_RELAY, "Relay -> %s",
             new_state == RELAY_STATE_ON  ? "ON"  :
             new_state == RELAY_STATE_OFF ? "OFF" : "TRIPPED");

    xSemaphoreGive(relay_mutex);
    return ESP_OK;
}

void relay_emergency_cutoff(anomaly_type_t reason)
{
    // Bypass cooldown — this is safety-critical
    relay_set_gpio(RELAY_STATE_OFF);

    if (xSemaphoreTake(relay_mutex, pdMS_TO_TICKS(10)) == pdTRUE) {
        relay_ctx.state            = RELAY_STATE_TRIPPED;
        relay_ctx.last_toggle_ms   = xTaskGetTickCount() * portTICK_PERIOD_MS;
        relay_ctx.trip_count++;
        relay_ctx.last_trip_reason = reason;
        xSemaphoreGive(relay_mutex);
    }

    ESP_LOGE(TAG_RELAY, "EMERGENCY CUTOFF! Reason: %s  |  Trip #%lu",
             anomaly_type_to_string(reason), (unsigned long)relay_ctx.trip_count);
}

relay_state_t relay_get_state(void)
{
    relay_state_t s = RELAY_STATE_OFF;
    if (xSemaphoreTake(relay_mutex, pdMS_TO_TICKS(10)) == pdTRUE) {
        s = relay_ctx.state;
        xSemaphoreGive(relay_mutex);
    }
    return s;
}

uint32_t relay_get_trip_count(void)
{
    return relay_ctx.trip_count;
}

void relay_reset_trip_count(void)
{
    relay_ctx.trip_count = 0;
    ESP_LOGI(TAG_RELAY, "Trip count reset");
}

uint32_t relay_get_cooldown_remaining_ms(void)
{
    uint32_t now_ms  = xTaskGetTickCount() * portTICK_PERIOD_MS;
    uint32_t elapsed = now_ms - relay_ctx.last_toggle_ms;
    if (elapsed >= RELAY_COOLDOWN_MS) return 0;
    return RELAY_COOLDOWN_MS - elapsed;
}

anomaly_type_t relay_get_last_trip_reason(void)
{
    return relay_ctx.last_trip_reason;
}

const char *anomaly_type_to_string(anomaly_type_t type)
{
    switch (type) {
        case ANOMALY_SHORT_CIRCUIT: return "SHORT_CIRCUIT";
        case ANOMALY_OVERCURRENT:   return "OVERCURRENT";
        case ANOMALY_WIRE_FIRE:     return "WIRE_FIRE";
        case ANOMALY_OVERVOLTAGE:   return "OVERVOLTAGE";
        case ANOMALY_UNDERVOLTAGE:  return "UNDERVOLTAGE";
        default:                    return "NONE";
    }
}



