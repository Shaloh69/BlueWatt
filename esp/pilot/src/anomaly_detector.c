#include "anomaly_detector.h"
#include "logger.h"
#include "config.h"

// Static detector states
static overcurrent_state_t oc_state = {
    .count = 0,
    .threshold = ANOMALY_CONFIRM_COUNT
};

static fire_detector_state_t fire_state = {
    .index = 0,
    .buffer_full = false,
    .baseline_power = 0.0f
};

esp_err_t anomaly_detector_init(void) {
    LOG_INFO(TAG_ANOMALY, "Anomaly detector initialized");
    LOG_INFO(TAG_ANOMALY, "Thresholds:");
    LOG_INFO(TAG_ANOMALY, "  Short circuit: >%.1fA", CURRENT_SHORT_CIRCUIT);
    LOG_INFO(TAG_ANOMALY, "  Overcurrent: >%.1fA", CURRENT_OVERCURRENT);
    LOG_INFO(TAG_ANOMALY, "  Voltage: %.1f-%.1fV", VOLTAGE_MIN_THRESHOLD, VOLTAGE_MAX_THRESHOLD);
    LOG_INFO(TAG_ANOMALY, "  Max power: %.1fW", POWER_MAX_THRESHOLD);
    return ESP_OK;
}

bool detect_short_circuit(float i_rms) {
    if (i_rms > CURRENT_SHORT_CIRCUIT) {
        LOG_ERROR(TAG_ANOMALY, "SHORT CIRCUIT DETECTED! Current: %.2fA", i_rms);
        return true;
    }
    return false;
}

bool detect_overcurrent(float i_rms, overcurrent_state_t *state) {
    if (i_rms > CURRENT_OVERCURRENT) {
        state->count++;
        if (state->count >= state->threshold) {
            LOG_ERROR(TAG_ANOMALY, "OVERCURRENT DETECTED! Current: %.2fA (sustained)", i_rms);
            return true;
        }
        LOG_WARN(TAG_ANOMALY, "Overcurrent warning: %.2fA (count: %lu/%lu)",
                 i_rms, state->count, state->threshold);
    } else {
        // Reset count if current drops below threshold
        if (state->count > 0) {
            LOG_INFO(TAG_ANOMALY, "Overcurrent condition cleared");
        }
        state->count = 0;
    }
    return false;
}

bool detect_wire_fire(float power, fire_detector_state_t *state) {
    // Store power in circular buffer
    state->power_history[state->index] = power;
    state->index = (state->index + 1) % FIRE_HISTORY_SIZE;

    if (state->index == 0) {
        state->buffer_full = true;
    }

    if (!state->buffer_full) {
        return false;  // Need full buffer before detection
    }

    // Calculate average power over history
    float avg_power = 0.0f;
    for (int i = 0; i < FIRE_HISTORY_SIZE; i++) {
        avg_power += state->power_history[i];
    }
    avg_power /= FIRE_HISTORY_SIZE;

    // Initialize baseline if not set
    if (state->baseline_power < 1.0f) {
        state->baseline_power = avg_power;
        LOG_DEBUG(TAG_ANOMALY, "Fire detector baseline: %.2fW", avg_power);
        return false;
    }

    // Detect abnormal power increase (thermal runaway)
    float power_ratio = avg_power / state->baseline_power;

    if (power_ratio > TEMP_RISE_THRESHOLD && avg_power > FIRE_DETECT_MIN_POWER) {
        LOG_ERROR(TAG_ANOMALY, "WIRE FIRE DETECTED! Power increase: %.1fx (%.2fW -> %.2fW)",
                  power_ratio, state->baseline_power, avg_power);
        return true;
    }

    // Update baseline with slow-moving average (adapts to normal load changes)
    state->baseline_power = state->baseline_power * 0.9f + avg_power * 0.1f;

    return false;
}

bool detect_voltage_anomaly(float v_rms, anomaly_type_t *type) {
    if (v_rms < VOLTAGE_MIN_THRESHOLD) {
        LOG_WARN(TAG_ANOMALY, "UNDERVOLTAGE DETECTED! Voltage: %.2fV", v_rms);
        if (type != NULL) {
            *type = ANOMALY_UNDERVOLTAGE;
        }
        return true;
    }

    if (v_rms > VOLTAGE_MAX_THRESHOLD) {
        LOG_WARN(TAG_ANOMALY, "OVERVOLTAGE DETECTED! Voltage: %.2fV", v_rms);
        if (type != NULL) {
            *type = ANOMALY_OVERVOLTAGE;
        }
        return true;
    }

    return false;
}

bool anomaly_analyze(const power_data_t *power_data, anomaly_event_t *event) {
    if (power_data == NULL || event == NULL) {
        return false;
    }

    bool anomaly_detected = false;

    // Check for short circuit (highest priority)
    if (detect_short_circuit(power_data->i_rms)) {
        event->type = ANOMALY_SHORT_CIRCUIT;
        event->current_value = power_data->i_rms;
        event->voltage_value = power_data->v_rms;
        event->power_value = power_data->power_real;
        event->timestamp = power_data->timestamp;
        event->relay_triggered = false;
        anomaly_detected = true;
    }
    // Check for overcurrent
    else if (detect_overcurrent(power_data->i_rms, &oc_state)) {
        event->type = ANOMALY_OVERCURRENT;
        event->current_value = power_data->i_rms;
        event->voltage_value = power_data->v_rms;
        event->power_value = power_data->power_real;
        event->timestamp = power_data->timestamp;
        event->relay_triggered = false;
        anomaly_detected = true;
    }
    // Check for wire fire
    else if (detect_wire_fire(power_data->power_real, &fire_state)) {
        event->type = ANOMALY_WIRE_FIRE;
        event->current_value = power_data->i_rms;
        event->voltage_value = power_data->v_rms;
        event->power_value = power_data->power_real;
        event->timestamp = power_data->timestamp;
        event->relay_triggered = false;
        anomaly_detected = true;
    }
    // Check for voltage anomalies
    else if (detect_voltage_anomaly(power_data->v_rms, &event->type)) {
        event->current_value = power_data->i_rms;
        event->voltage_value = power_data->v_rms;
        event->power_value = power_data->power_real;
        event->timestamp = power_data->timestamp;
        event->relay_triggered = false;
        // Don't trigger relay for voltage anomalies (could be grid issue)
        // anomaly_detected = true;  // Uncomment to treat as critical
    }

    return anomaly_detected;
}

void anomaly_detector_reset(void) {
    oc_state.count = 0;
    fire_state.index = 0;
    fire_state.buffer_full = false;
    fire_state.baseline_power = 0.0f;
    LOG_INFO(TAG_ANOMALY, "Anomaly detector state reset");
}
