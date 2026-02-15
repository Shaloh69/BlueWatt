#ifndef RELAY_CONTROL_H
#define RELAY_CONTROL_H

#include "esp_err.h"
#include "config.h"
#include <stdint.h>
#include <stdbool.h>

// Relay states
typedef enum {
    RELAY_STATE_OFF = 0,
    RELAY_STATE_ON = 1,
    RELAY_STATE_TRIPPED = 2  // Tripped due to anomaly
} relay_state_t;

// Anomaly types (for trip logging)
typedef enum {
    ANOMALY_NONE = 0,
    ANOMALY_OVERCURRENT,
    ANOMALY_SHORT_CIRCUIT,
    ANOMALY_WIRE_FIRE,
    ANOMALY_OVERVOLTAGE,
    ANOMALY_UNDERVOLTAGE
} anomaly_type_t;

// Relay context
typedef struct {
    relay_state_t state;
    uint32_t last_toggle_time;
    bool auto_reset_enabled;
    uint32_t trip_count;
    anomaly_type_t last_trip_reason;
} relay_context_t;

/**
 * Initialize relay control
 * Sets up GPIO and initializes relay to OFF state
 */
esp_err_t relay_init(void);

/**
 * Set relay state (with cooldown protection)
 * @param new_state Desired relay state
 * @return ESP_OK on success, ESP_ERR_INVALID_STATE if cooldown not elapsed
 */
esp_err_t relay_set_state(relay_state_t new_state);

/**
 * Emergency cutoff (bypasses cooldown timer)
 * @param reason Anomaly type that triggered the cutoff
 * @return ESP_OK on success
 */
esp_err_t relay_emergency_cutoff(anomaly_type_t reason);

/**
 * Get current relay state
 * @return Current relay state
 */
relay_state_t relay_get_state(void);

/**
 * Check if relay can be toggled (cooldown elapsed)
 * @return true if cooldown period has elapsed
 */
bool relay_can_toggle(void);

/**
 * Get trip count
 * @return Number of times relay has been tripped
 */
uint32_t relay_get_trip_count(void);

/**
 * Reset trip count (admin function)
 */
void relay_reset_trip_count(void);

/**
 * Convert anomaly type to string
 */
const char* anomaly_type_to_string(anomaly_type_t type);

#endif // RELAY_CONTROL_H
