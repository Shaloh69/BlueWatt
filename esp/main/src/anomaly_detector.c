#include "anomaly_detector.h"
#include "config.h"
#include "logger.h"

#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include <math.h>
#include <string.h>

static overcurrent_state_t   oc_state;    // sustained overcurrent  (I > 30A)
static overcurrent_state_t   sc_state;    // short circuit          (I > 80A)
static fire_detector_state_t fire_state;  // high-load warning      (report only)

// Rate limiting for non-tripping anomalies (see anomaly_analyze)
static anomaly_type_t s_last_reported  = ANOMALY_NONE;
static uint32_t       s_last_report_ms = 0;

// Monotonic millisecond clock.
// NOTE: pzem_data_t.timestamp is NOT usable for elapsed-time math — it holds
// Unix *seconds* once NTP has synced but uptime *milliseconds* before that.
static inline uint32_t now_ms(void)
{
    return (uint32_t)(xTaskGetTickCount() * portTICK_PERIOD_MS);
}

void anomaly_detector_init(void)
{
    memset(&oc_state,   0, sizeof(oc_state));
    memset(&sc_state,   0, sizeof(sc_state));
    memset(&fire_state, 0, sizeof(fire_state));
    oc_state.threshold = OVERCURRENT_CONFIRM_COUNT;
    sc_state.threshold = SHORT_CIRCUIT_CONFIRM_COUNT;
    s_last_reported    = ANOMALY_NONE;
    s_last_report_ms   = 0;

    ESP_LOGI(TAG_ANOMALY, "Anomaly detector initialized");
    ESP_LOGI(TAG_ANOMALY, "  Short circuit:  I > %.0f A  (x%d reads)          -> TRIP",
             SHORT_CIRCUIT_THRESHOLD_A, SHORT_CIRCUIT_CONFIRM_COUNT);
    ESP_LOGI(TAG_ANOMALY, "  Overcurrent:    I > %.0f A  (x%d reads, ~%lus)    -> TRIP",
             OVERCURRENT_THRESHOLD_A, OVERCURRENT_CONFIRM_COUNT,
             (unsigned long)((OVERCURRENT_CONFIRM_COUNT * PZEM_READ_INTERVAL_MS) / 1000));
    ESP_LOGI(TAG_ANOMALY, "  High load:      P > %.0f W AND > %.1fx baseline -> WARN ONLY",
             WIRE_FIRE_MIN_POWER_W, WIRE_FIRE_POWER_RATIO);
    ESP_LOGI(TAG_ANOMALY, "  Voltage range:  %.0f-%.0f V                      -> WARN ONLY",
             VOLTAGE_MIN_V, VOLTAGE_MAX_V);
    ESP_LOGI(TAG_ANOMALY, "  Policy: loads at or below %.0f A never trip the relay.",
             OVERCURRENT_THRESHOLD_A);
}

/**
 * Advance a consecutive-reading confirm counter.
 *
 * Strictly greater-than: a reading exactly equal to the limit is a legal load
 * and resets the counter — 30.000 A does not trip, 30.001 A does.
 *
 * The counter is cleared when it fires so a stuck over-limit condition
 * re-trips once per confirm window instead of once per reading.
 */
static bool confirm_sustained(overcurrent_state_t *st, float value, float limit)
{
    if (value > limit) {
        if (st->count < UINT8_MAX) st->count++;
        if (st->count >= st->threshold) {
            st->count = 0;
            return true;
        }
        return false;
    }
    st->count = 0;
    return false;
}

/**
 * Rolling-average power warning (thermal runaway indicator).
 *
 * REPORT-ONLY — the caller never lets this operate the relay. The watt floor is
 * pinned to WIRE_FIRE_MIN_POWER_W (30 A x 230 V), so a legal load cannot arm it.
 */
static bool detect_high_load(float power)
{
    fire_state.history[fire_state.head] = power;
    fire_state.head = (uint8_t)((fire_state.head + 1) % FIRE_HISTORY_SIZE);

    if (fire_state.count < FIRE_HISTORY_SIZE) {
        fire_state.count++;
        return false;                       // window still filling
    }

    float sum = 0.0f;
    for (uint8_t i = 0; i < FIRE_HISTORY_SIZE; i++) {
        sum += fire_state.history[i];
    }
    float avg_power = sum / (float)FIRE_HISTORY_SIZE;

    // Latch the baseline exactly once, after the first full window.
    // The old code re-latched whenever the baseline fell below 1 W, which reset
    // the reference every second on an idle circuit and made the trip behaviour
    // depend on whatever happened to be switched on at boot.
    // Floored at 1 W so the ratio test stays valid from a cold, zero-load start.
    if (!fire_state.baseline_set) {
        fire_state.baseline_power = (avg_power > 1.0f) ? avg_power : 1.0f;
        fire_state.baseline_set   = true;
        ESP_LOGI(TAG_ANOMALY, "High-load baseline set: %.1f W", fire_state.baseline_power);
        return false;
    }

    bool warn = (avg_power > WIRE_FIRE_MIN_POWER_W) &&
                (avg_power / fire_state.baseline_power > WIRE_FIRE_POWER_RATIO);

    // Slow baseline adaptation (not while the warning is active)
    if (!warn) {
        fire_state.baseline_power = 0.9f * fire_state.baseline_power + 0.1f * avg_power;
        if (fire_state.baseline_power < 1.0f) fire_state.baseline_power = 1.0f;
    }

    return warn;
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

    // Update every detector on every reading so the rolling history and the
    // confirm counters stay aligned regardless of which anomaly is reported.
    // (The old else-if chain skipped the fire history whenever overcurrent hit.)
    bool           sc_hit   = confirm_sustained(&sc_state, data->i_rms, SHORT_CIRCUIT_THRESHOLD_A);
    bool           oc_hit   = confirm_sustained(&oc_state, data->i_rms, OVERCURRENT_THRESHOLD_A);
    bool           load_hit = detect_high_load(data->power);
    anomaly_type_t volt_hit = detect_voltage_anomaly(data->v_rms);

    anomaly_type_t type;
    if      (sc_hit)   type = ANOMALY_SHORT_CIRCUIT;
    else if (oc_hit)   type = ANOMALY_OVERCURRENT;
    else if (load_hit) type = ANOMALY_WIRE_FIRE;
    else               type = volt_hit;

    if (type == ANOMALY_NONE) {
        s_last_reported = ANOMALY_NONE;     // condition cleared — re-arm reporting
        return false;
    }

    // Only a sustained over-limit CURRENT opens the relay. A high wattage
    // reading on its own is a warning, never a cutoff.
    bool trips = (type == ANOMALY_SHORT_CIRCUIT || type == ANOMALY_OVERCURRENT);

    // Throttle non-tripping anomalies so a persisting brownout or a sustained
    // high load does not POST one event per second. Trips are never throttled.
    if (!trips) {
        uint32_t t = now_ms();
        if (type == s_last_reported &&
            (uint32_t)(t - s_last_report_ms) < (uint32_t)(ANOMALY_REPEAT_REPORT_S * 1000U)) {
            return false;
        }
        s_last_reported  = type;
        s_last_report_ms = t;
    }

    event->type            = type;
    event->i_rms           = data->i_rms;
    event->v_rms           = data->v_rms;
    event->power           = data->power;
    event->timestamp       = data->timestamp;
    event->relay_triggered = trips;

    return true;
}

void anomaly_detector_reset(void)
{
    oc_state.count   = 0;
    sc_state.count   = 0;
    s_last_reported  = ANOMALY_NONE;
    s_last_report_ms = 0;
    memset(&fire_state, 0, sizeof(fire_state));
    ESP_LOGI(TAG_ANOMALY, "Anomaly detector state reset");
}
