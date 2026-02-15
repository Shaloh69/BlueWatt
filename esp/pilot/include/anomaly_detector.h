#ifndef ANOMALY_DETECTOR_H
#define ANOMALY_DETECTOR_H

#include "esp_err.h"
#include "power_calc.h"
#include "relay_control.h"
#include <stdbool.h>

// Overcurrent detector state
typedef struct {
    uint32_t count;
    uint32_t threshold;
} overcurrent_state_t;

// Wire fire detector state
typedef struct {
    float power_history[FIRE_HISTORY_SIZE];
    uint8_t index;
    bool buffer_full;
    float baseline_power;
} fire_detector_state_t;

// Anomaly event structure
typedef struct {
    anomaly_type_t type;
    float current_value;
    float voltage_value;
    float power_value;
    uint32_t timestamp;
    bool relay_triggered;
} anomaly_event_t;

/**
 * Initialize anomaly detector
 */
esp_err_t anomaly_detector_init(void);

/**
 * Detect short circuit (very high instantaneous current)
 * @param i_rms RMS current
 * @return true if short circuit detected
 */
bool detect_short_circuit(float i_rms);

/**
 * Detect overcurrent (sustained high current)
 * @param i_rms RMS current
 * @param state Overcurrent detector state
 * @return true if overcurrent detected
 */
bool detect_overcurrent(float i_rms, overcurrent_state_t *state);

/**
 * Detect wire fire (abnormal power increase indicating thermal runaway)
 * @param power Real power
 * @param state Fire detector state
 * @return true if wire fire condition detected
 */
bool detect_wire_fire(float power, fire_detector_state_t *state);

/**
 * Detect voltage anomalies (over/under voltage)
 * @param v_rms RMS voltage
 * @param type Output parameter for anomaly type
 * @return true if voltage anomaly detected
 */
bool detect_voltage_anomaly(float v_rms, anomaly_type_t *type);

/**
 * Analyze power data for all anomalies
 * @param power_data Power measurement data
 * @param event Output parameter for anomaly event (if detected)
 * @return true if any anomaly detected
 */
bool anomaly_analyze(const power_data_t *power_data, anomaly_event_t *event);

/**
 * Reset anomaly detector state
 */
void anomaly_detector_reset(void);

#endif // ANOMALY_DETECTOR_H
