#include "anomaly_detector.h"
#include "config.h"
#include "logger.h"

#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include <math.h>
#include <string.h>

static overcurrent_state_t  oc_state;
static fire_detector_state_t fire_state;

void anomaly_detector_init(void)
{
    memset(&oc_state,   0, sizeof(oc_state));
    memset(&fire_state, 0, sizeof(fire_state));
    oc_state.threshold = OVERCURRENT_CONFIRM_COUNT;

    ESP_LOGI(TAG_ANOMALY, "Anomaly detector initialized");
    ESP_LOGI(TAG_ANOMALY, "  Short circuit:  I > %.0f A (instant)", SHORT_CIRCUIT_THRESHOLD_A);
    ESP_LOGI(TAG_ANOMALY, "  Overcurrent:    I > %.0f A (x%d sustained)", OVERCURRENT_THRESHOLD_A, OVERCURRENT_CONFIRM_COUNT);
    ESP_LOGI(TAG_ANOMALY, "  Wire fire:      Power > %.1fx baseline AND > %.0f W", WIRE_FIRE_POWER_RATIO, WIRE_FIRE_MIN_POWER_W);
    ESP_LOGI(TAG_ANOMALY, "  Voltage range:  %.0f–%.0f V", VOLTAGE_MIN_V, VOLTAGE_MAX_V);
}

static bool detect_short_circuit(float i_rms)
{
    return i_rms > SHORT_CIRCUIT_THRESHOLD_A;
}

static bool detect_overcurrent(float i_rms)
{
    if (i_rms > OVERCURRENT_THRESHOLD_A) {
        oc_state.count++;
        if (oc_state.count >= oc_state.threshold) {
            return true;
        }
    } else {
        oc_state.count = 0;
    }
    return false;
}

static bool detect_wire_fire(float power)
{
    // Store in circular history
    fire_state.history[fire_state.head] = power;
    fire_state.head = (fire_state.head + 1) % FIRE_HISTORY_SIZE;
    if (fire_state.count < FIRE_HISTORY_SIZE) {
        fire_state.count++;
    }

    // Not enough history yet
    if (fire_state.count < FIRE_HISTORY_SIZE) {
        return false;
    }

    // Rolling average
    float sum = 0.0f;
    for (uint8_t i = 0; i < FIRE_HISTORY_SIZE; i++) {
        sum += fire_state.history[i];
    }
    float avg_power = sum / (float)FIRE_HISTORY_SIZE;

    // Establish baseline on first full window
    if (fire_state.baseline_power < 1.0f) {
        fire_state.baseline_power = avg_power;
        ESP_LOGI(TAG_ANOMALY, "Wire fire baseline set: %.1f W", fire_state.baseline_power);
        return false;
    }

    // Detect sudden power increase
    bool fire_detected = (avg_power > WIRE_FIRE_MIN_POWER_W) &&
                         (fire_state.baseline_power > 1.0f) &&
                         (avg_power / fire_state.baseline_power > WIRE_FIRE_POWER_RATIO);

    // Slow-moving baseline adaptation (not during fire event)
    if (!fire_detected) {
        fire_state.baseline_power = 0.9f * fire_state.baseline_power + 0.1f * avg_power;
    }

    return fire_detected;
}

static anomaly_type_t detect_voltage_anomaly(float v_rms)
{
    if (v_rms > VOLTAGE_MAX_V) return ANOMALY_OVERVOLTAGE;
    if (v_rms < VOLTAGE_MIN_V) return ANOMALY_UNDERVOLTAGE;
    return ANOMALY_NONE;
}

bool anomaly_analyze(const pzem_data_t *data, anomaly_event_t *event)
{
    if (!data || !data->valid || !event) return false;

    anomaly_type_t type = ANOMALY_NONE;

    // Check in priority order
    if (detect_short_circuit(data->i_rms)) {
        type = ANOMALY_SHORT_CIRCUIT;
    } else if (detect_overcurrent(data->i_rms)) {
        type = ANOMALY_OVERCURRENT;
    } else if (detect_wire_fire(data->power)) {
        type = ANOMALY_WIRE_FIRE;
    } else {
        type = detect_voltage_anomaly(data->v_rms);
    }

    if (type == ANOMALY_NONE) {
        return false;
    }

    event->type      = type;
    event->i_rms     = data->i_rms;
    event->v_rms     = data->v_rms;
    event->power     = data->power;
    event->timestamp = data->timestamp;
    event->relay_triggered = (type == ANOMALY_SHORT_CIRCUIT ||
                              type == ANOMALY_OVERCURRENT   ||
                              type == ANOMALY_WIRE_FIRE);

    return true;
}

void anomaly_detector_reset(void)
{
    oc_state.count = 0;
    memset(&fire_state, 0, sizeof(fire_state));
    ESP_LOGI(TAG_ANOMALY, "Anomaly detector state reset");
}
