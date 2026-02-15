#ifndef ADC_SENSOR_H
#define ADC_SENSOR_H

#include "esp_err.h"
#include "esp_adc/adc_oneshot.h"
#include "esp_adc/adc_cali.h"
#include "config.h"

// Sensor reading structure
typedef struct {
    int current_raw;
    int voltage_raw;
    float current_voltage;  // Calibrated voltage from current sensor
    float voltage_voltage;  // Calibrated voltage from voltage sensor
} sensor_reading_t;

// Circular buffer for samples
typedef struct {
    int current_samples[SAMPLE_BUFFER_SIZE];
    int voltage_samples[SAMPLE_BUFFER_SIZE];
    uint32_t write_index;
    uint32_t read_index;
    uint32_t count;
} sample_buffer_t;

/**
 * Initialize ADC sensor subsystem
 * Sets up ADC unit, channels, and calibration
 */
esp_err_t adc_sensor_init(void);

/**
 * Read raw ADC values from both sensors
 * @param reading Pointer to store the reading
 * @return ESP_OK on success
 */
esp_err_t adc_sensor_read(sensor_reading_t *reading);

/**
 * Write samples to circular buffer (thread-safe)
 * @param current_raw Raw current sensor ADC value
 * @param voltage_raw Raw voltage sensor ADC value
 * @return ESP_OK on success
 */
esp_err_t sample_buffer_write(int current_raw, int voltage_raw);

/**
 * Read samples from circular buffer
 * @param current_samples Array to store current samples
 * @param voltage_samples Array to store voltage samples
 * @param num_samples Number of samples to read
 * @return Number of samples actually read
 */
uint32_t sample_buffer_read(int *current_samples, int *voltage_samples, uint32_t num_samples);

/**
 * Convert raw ADC value to calibrated voltage
 * @param raw_value Raw ADC reading (0-4095)
 * @param channel Which ADC channel
 * @return Calibrated voltage in volts
 */
float adc_raw_to_voltage(int raw_value, adc_channel_t channel);

/**
 * Get current sensor zero offset (averaged over several readings)
 * Call this during initialization when no current is flowing
 * @return Average zero offset voltage
 */
float adc_calibrate_current_zero(void);

#endif // ADC_SENSOR_H
