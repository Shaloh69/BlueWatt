#pragma once

#include <stdbool.h>
#include <stdint.h>
#include "esp_err.h"
#include "anomaly_detector.h"

typedef enum {
    RELAY_STATE_OFF = 0,
    RELAY_STATE_ON,
    RELAY_STATE_TRIPPED,   // Emergency cut — requires manual reset
} relay_state_t;

typedef struct {
    relay_state_t  state;
    uint32_t       last_toggle_ms;
    bool           auto_reset;
    uint32_t       trip_count;
    anomaly_type_t last_trip_reason;
} relay_context_t;

/**
 * @brief Configure the relay GPIO and set to safe OFF state.
 */
esp_err_t relay_init(void);

/**
 * @brief Set relay state (cooldown applies only when turning ON).
 *        Cannot override a TRIPPED state — use relay_emergency_cutoff to re-trip
 *        or relay_reset_trip_count + relay_set_state to restore.
 * @return ESP_ERR_INVALID_STATE if ON cooldown not elapsed or state is TRIPPED.
 */
esp_err_t relay_set_state(relay_state_t new_state);

/**
 * @brief Immediately open the relay, bypass cooldown, increment trip counter.
 * @param reason The anomaly type that triggered the cutoff.
 */
void relay_emergency_cutoff(anomaly_type_t reason);

/**
 * @brief Return current relay state (thread-safe).
 */
relay_state_t relay_get_state(void);

/**
 * @brief Check whether the cooldown period has elapsed.
 */
bool relay_can_toggle(void);

/**
 * @brief Return accumulated trip count.
 */
uint32_t relay_get_trip_count(void);

/**
 * @brief Reset trip counter to zero (admin action).
 */
void relay_reset_trip_count(void);

/**
 * @brief Convert anomaly enum to human-readable string.
 */
const char *anomaly_type_to_string(anomaly_type_t type);

/**
 * @brief Return milliseconds remaining in the ON cooldown period.
 *        Returns 0 when the relay can be turned ON immediately.
 */
uint32_t relay_get_cooldown_remaining_ms(void);

/**
 * @brief Return the anomaly type that caused the most recent trip.
 *        Returns ANOMALY_NONE if no trip has occurred.
 */
anomaly_type_t relay_get_last_trip_reason(void);

