#include "power_calc.h"
#include "adc_sensor.h"
#include "logger.h"
#include <math.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

esp_err_t power_calc_init(void) {
    LOG_INFO(TAG_POWER, "Power calculation module initialized");
    return ESP_OK;
}

float calc_rms_current(const int *samples, uint32_t count) {
    if (samples == NULL || count == 0) {
        return 0.0f;
    }

    float sum_squares = 0.0f;

    for (uint32_t i = 0; i < count; i++) {
        // Convert ADC value to voltage
        float voltage = adc_raw_to_voltage(samples[i], CURRENT_SENSOR_CH);

        // Convert voltage to current using ACS712 formula
        // Current (A) = (Voltage - ZeroOffset) / Sensitivity
        float current = (voltage - CURRENT_ZERO_OFFSET) / CURRENT_SENSITIVITY;

        sum_squares += current * current;
    }

    float mean_square = sum_squares / count;
    float rms = sqrtf(mean_square);

    return rms;
}

float calc_rms_voltage(const int *samples, uint32_t count) {
    if (samples == NULL || count == 0) {
        return 0.0f;
    }

    float sum_squares = 0.0f;

    for (uint32_t i = 0; i < count; i++) {
        // Convert ADC value to voltage
        float adc_voltage = adc_raw_to_voltage(samples[i], VOLTAGE_SENSOR_CH);

        // Scale to actual AC voltage using ZMPT101B ratio
        float ac_voltage = adc_voltage * VOLTAGE_SCALING_FACTOR * VOLTAGE_CALIBRATION;

        sum_squares += ac_voltage * ac_voltage;
    }

    float mean_square = sum_squares / count;
    float rms = sqrtf(mean_square);

    return rms;
}

float calc_power_factor(const int *v_samples, const int *i_samples, uint32_t count) {
    if (v_samples == NULL || i_samples == NULL || count == 0) {
        return 1.0f;  // Assume unity power factor if no data
    }

    // For simplicity, we'll use a basic approximation
    // A more accurate method would involve FFT or zero-crossing detection
    // For resistive loads, power factor ≈ 1.0
    // For inductive loads, power factor ≈ 0.6-0.9

    // Calculate correlation between voltage and current waveforms
    float v_mean = 0.0f, i_mean = 0.0f;

    for (uint32_t i = 0; i < count; i++) {
        float v = adc_raw_to_voltage(v_samples[i], VOLTAGE_SENSOR_CH);
        float i_val = (adc_raw_to_voltage(i_samples[i], CURRENT_SENSOR_CH) - CURRENT_ZERO_OFFSET) / CURRENT_SENSITIVITY;
        v_mean += v;
        i_mean += i_val;
    }

    v_mean /= count;
    i_mean /= count;

    float numerator = 0.0f;
    float v_variance = 0.0f;
    float i_variance = 0.0f;

    for (uint32_t i = 0; i < count; i++) {
        float v = adc_raw_to_voltage(v_samples[i], VOLTAGE_SENSOR_CH) - v_mean;
        float i_val = ((adc_raw_to_voltage(i_samples[i], CURRENT_SENSOR_CH) - CURRENT_ZERO_OFFSET) / CURRENT_SENSITIVITY) - i_mean;

        numerator += v * i_val;
        v_variance += v * v;
        i_variance += i_val * i_val;
    }

    float denominator = sqrtf(v_variance * i_variance);

    if (denominator < 0.001f) {
        return 1.0f;  // Avoid division by zero
    }

    float correlation = numerator / denominator;

    // Power factor is the absolute value of correlation
    float pf = fabsf(correlation);

    // Clamp to valid range
    if (pf > 1.0f) pf = 1.0f;
    if (pf < 0.0f) pf = 0.0f;

    return pf;
}

esp_err_t power_calc_compute(const int *current_samples,
                              const int *voltage_samples,
                              uint32_t num_samples,
                              power_data_t *result) {
    if (current_samples == NULL || voltage_samples == NULL || result == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    if (num_samples == 0) {
        return ESP_ERR_INVALID_ARG;
    }

    // Calculate RMS values
    result->i_rms = calc_rms_current(current_samples, num_samples);
    result->v_rms = calc_rms_voltage(voltage_samples, num_samples);

    // Calculate power factor
    result->power_factor = calc_power_factor(voltage_samples, current_samples, num_samples);

    // Calculate apparent power: S = V_rms × I_rms
    result->power_apparent = result->v_rms * result->i_rms;

    // Calculate real power: P = S × PF
    result->power_real = result->power_apparent * result->power_factor;

    // Store timestamp
    result->timestamp = xTaskGetTickCount() * portTICK_PERIOD_MS;

    LOG_DEBUG(TAG_POWER, "Computed: V=%.2fV, I=%.3fA, P=%.2fW, PF=%.3f",
              result->v_rms, result->i_rms, result->power_real, result->power_factor);

    return ESP_OK;
}
