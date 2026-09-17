#pragma once

#include <stdbool.h>
#include <stdint.h>
#include "config.h"       // FIRE_HISTORY_SIZE — keeps history[] sized to the config
#include "pzem_sensor.h"

// Anomaly types in priority order
typedef enum {
    ANOMALY_NONE        = 0,
    ANOMALY_SHORT_CIRCUIT,
    ANOMALY_OVERCURRENT,
    ANOMALY_WIRE_FIRE,
    ANOMALY_OVERVOLTAGE,
    ANOMALY_UNDERVOLTAGE,
} anomaly_type_t;

// Consecutive-reading confirm counter.
// Used for BOTH sustained overcurrent and short-circuit confirmation, so a
// single spurious sample (e.g. aircon locked-rotor inrush) cannot trip the relay.
typedef struct {
    uint8_t count;       // Consecutive readings above threshold
    uint8_t threshold;   // Required count before triggering
} overcurrent_state_t;

// Internal state for the high-load / thermal-runaway warning.
// REPORT-ONLY — this detector never operates the relay.
typedef struct {
    float    history[FIRE_HISTORY_SIZE]; // Rolling power history
    uint8_t  head;           // Next write index
    uint8_t  count;          // How many samples filled
    float    baseline_power; // Adaptive baseline (W)
    bool     baseline_set;   // Latched once after warm-up (prevents re-latching at 0W)
} fire_detector_state_t;

// An anomaly event produced when a problem is detected
typedef struct {
    anomaly_type_t type;
    float          i_rms;
    float          v_rms;
    float          power;
    uint32_t       timestamp;
    bool           relay_triggered;
} anomaly_event_t;

/**
 * @brief Initialize the anomaly detector and log configured thresholds.
 */
void anomaly_detector_init(void);

/**
 * @brief Analyze a PZEM reading for anomalies.
 *
 * Every detector's internal state is updated on every call, so the rolling
 * power history and confirm counters stay aligned even when a higher-priority
 * anomaly is the one reported.
 *
 * Only ANOMALY_SHORT_CIRCUIT and ANOMALY_OVERCURRENT set event->relay_triggered.
 * Non-tripping anomalies are rate-limited to one report per
 * ANOMALY_REPEAT_REPORT_S while the condition persists.
 *
 * @param data   Pointer to latest PZEM data.
 * @param event  Output event (populated only when return is true).
 * @return true if an anomaly should be reported.
 */
bool anomaly_analyze(const pzem_data_t *data, anomaly_event_t *event);

/**
 * @brief Reset internal detector state (overcurrent count, fire baseline).
 */
void anomaly_detector_reset(void);
