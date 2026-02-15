#ifndef POWER_CALC_H
#define POWER_CALC_H

#include "esp_err.h"
#include "config.h"
#include <stdint.h>

// Power calculation result structure
typedef struct {
    float v_rms;           // RMS voltage (V)
    float i_rms;           // RMS current (A)
    float power_apparent;  // Apparent power (VA)
    float power_real;      // Real power (W)
    float power_factor;    // Power factor (0-1)
    uint32_t timestamp;    // Timestamp (milliseconds since boot)
} power_data_t;

/**
 * Initialize power calculation module
 */
esp_err_t power_calc_init(void);

/**
 * Compute power data from raw ADC samples
 * @param current_samples Array of current sensor ADC readings
 * @param voltage_samples Array of voltage sensor ADC readings
 * @param num_samples Number of samples in arrays
 * @param result Pointer to store calculated power data
 * @return ESP_OK on success
 */
esp_err_t power_calc_compute(const int *current_samples,
                              const int *voltage_samples,
                              uint32_t num_samples,
                              power_data_t *result);

/**
 * Calculate RMS current from samples
 * @param samples Array of current sensor ADC readings
 * @param count Number of samples
 * @return RMS current in amperes
 */
float calc_rms_current(const int *samples, uint32_t count);

/**
 * Calculate RMS voltage from samples
 * @param samples Array of voltage sensor ADC readings
 * @param count Number of samples
 * @return RMS voltage in volts
 */
float calc_rms_voltage(const int *samples, uint32_t count);

/**
 * Calculate power factor from voltage and current samples
 * Uses phase shift between waveforms
 * @param v_samples Voltage samples
 * @param i_samples Current samples
 * @param count Number of samples
 * @return Power factor (0-1)
 */
float calc_power_factor(const int *v_samples, const int *i_samples, uint32_t count);

#endif // POWER_CALC_H
