#pragma once

#include <stdbool.h>
#include <stdint.h>
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

// Internal state for sustained overcurrent detection
typedef struct {
    uint8_t count;       // Consecutive readings above threshold
    uint8_t threshold;   // Required count before triggering
} overcurrent_state_t;

// Internal state for wire fire (thermal runaway) detection
typedef struct {
    float    history[10];    // Rolling power history
    uint8_t  head;           // Next write index
    uint8_t  count;          // How many samples filled
    float    baseline_power; // Adaptive baseline (W)
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
 * @param data   Pointer to latest PZEM data.
 * @param event  Output event (populated only when return is true).
 * @return true if a critical anomaly was detected.
 */
bool anomaly_analyze(const pzem_data_t *data, anomaly_event_t *event);

/**
 * @brief Reset internal detector state (overcurrent count, fire baseline).
 */
void anomaly_detector_reset(void);
