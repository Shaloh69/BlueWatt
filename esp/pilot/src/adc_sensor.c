#include "adc_sensor.h"
#include "logger.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "esp_adc/adc_cali_scheme.h"
#include <string.h>

// ADC handles
static adc_oneshot_unit_handle_t adc_handle = NULL;
static adc_cali_handle_t adc_cali_current = NULL;
static adc_cali_handle_t adc_cali_voltage = NULL;

// Sample buffer and mutex
static sample_buffer_t sample_buffer = {0};
static SemaphoreHandle_t buffer_mutex = NULL;

// Calibration data
static float current_zero_offset_calibrated = CURRENT_ZERO_OFFSET;

/**
 * Initialize ADC calibration
 */
static esp_err_t adc_calibration_init(adc_unit_t unit, adc_channel_t channel, adc_atten_t atten, adc_cali_handle_t *out_handle) {
    adc_cali_handle_t handle = NULL;
    esp_err_t ret = ESP_FAIL;
    bool calibrated = false;

#if ADC_CALI_SCHEME_CURVE_FITTING_SUPPORTED
    if (!calibrated) {
        LOG_INFO(TAG_SENSOR, "Calibration scheme: Curve Fitting");
        adc_cali_curve_fitting_config_t cali_config = {
            .unit_id = unit,
            .chan = channel,
            .atten = atten,
            .bitwidth = ADC_BIT_WIDTH,
        };
        ret = adc_cali_create_scheme_curve_fitting(&cali_config, &handle);
        if (ret == ESP_OK) {
            calibrated = true;
        }
    }
#endif

#if ADC_CALI_SCHEME_LINE_FITTING_SUPPORTED
    if (!calibrated) {
        LOG_INFO(TAG_SENSOR, "Calibration scheme: Line Fitting");
        adc_cali_line_fitting_config_t cali_config = {
            .unit_id = unit,
            .atten = atten,
            .bitwidth = ADC_BIT_WIDTH,
        };
        ret = adc_cali_create_scheme_line_fitting(&cali_config, &handle);
        if (ret == ESP_OK) {
            calibrated = true;
        }
    }
#endif

    *out_handle = handle;
    if (ret == ESP_OK) {
        LOG_INFO(TAG_SENSOR, "ADC calibration success");
    } else {
        LOG_WARN(TAG_SENSOR, "ADC calibration failed, using raw values");
    }
    return ret;
}

esp_err_t adc_sensor_init(void) {
    esp_err_t ret;

    LOG_INFO(TAG_SENSOR, "Initializing ADC sensor...");

    // Create buffer mutex
    buffer_mutex = xSemaphoreCreateMutex();
    if (buffer_mutex == NULL) {
        LOG_ERROR(TAG_SENSOR, "Failed to create buffer mutex");
        return ESP_FAIL;
    }

    // Configure ADC unit
    adc_oneshot_unit_init_cfg_t init_config = {
        .unit_id = ADC_UNIT,
        .ulp_mode = ADC_ULP_MODE_DISABLE,
    };
    ret = adc_oneshot_new_unit(&init_config, &adc_handle);
    if (ret != ESP_OK) {
        LOG_ERROR(TAG_SENSOR, "Failed to initialize ADC unit: %d", ret);
        return ret;
    }

    // Configure current sensor channel
    adc_oneshot_chan_cfg_t chan_config = {
        .atten = ADC_ATTEN,
        .bitwidth = ADC_BIT_WIDTH,
    };
    ret = adc_oneshot_config_channel(adc_handle, CURRENT_SENSOR_CH, &chan_config);
    if (ret != ESP_OK) {
        LOG_ERROR(TAG_SENSOR, "Failed to config current sensor channel: %d", ret);
        return ret;
    }

    // Configure voltage sensor channel
    ret = adc_oneshot_config_channel(adc_handle, VOLTAGE_SENSOR_CH, &chan_config);
    if (ret != ESP_OK) {
        LOG_ERROR(TAG_SENSOR, "Failed to config voltage sensor channel: %d", ret);
        return ret;
    }

    // Initialize calibration for current sensor
    adc_calibration_init(ADC_UNIT, CURRENT_SENSOR_CH, ADC_ATTEN, &adc_cali_current);

    // Initialize calibration for voltage sensor
    adc_calibration_init(ADC_UNIT, VOLTAGE_SENSOR_CH, ADC_ATTEN, &adc_cali_voltage);

    LOG_INFO(TAG_SENSOR, "ADC sensor initialized successfully");
    LOG_INFO(TAG_SENSOR, "Current sensor: GPIO%d (ADC1_CH%d)", CURRENT_SENSOR_GPIO, CURRENT_SENSOR_CH);
    LOG_INFO(TAG_SENSOR, "Voltage sensor: GPIO%d (ADC1_CH%d)", VOLTAGE_SENSOR_GPIO, VOLTAGE_SENSOR_CH);

    return ESP_OK;
}

float adc_raw_to_voltage(int raw_value, adc_channel_t channel) {
    int voltage_mv = 0;
    adc_cali_handle_t cali_handle = (channel == CURRENT_SENSOR_CH) ? adc_cali_current : adc_cali_voltage;

    if (cali_handle != NULL) {
        // Use calibration
        adc_cali_raw_to_voltage(cali_handle, raw_value, &voltage_mv);
    } else {
        // Fallback to linear conversion
        // For 12-bit ADC with 3.3V reference: voltage_mv = (raw * 3300) / 4095
        voltage_mv = (raw_value * 3300) / 4095;
    }

    return voltage_mv / 1000.0f;  // Convert mV to V
}

esp_err_t adc_sensor_read(sensor_reading_t *reading) {
    if (reading == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    esp_err_t ret;

    // Read current sensor
    ret = adc_oneshot_read(adc_handle, CURRENT_SENSOR_CH, &reading->current_raw);
    if (ret != ESP_OK) {
        LOG_ERROR(TAG_SENSOR, "Failed to read current sensor: %d", ret);
        return ret;
    }

    // Read voltage sensor
    ret = adc_oneshot_read(adc_handle, VOLTAGE_SENSOR_CH, &reading->voltage_raw);
    if (ret != ESP_OK) {
        LOG_ERROR(TAG_SENSOR, "Failed to read voltage sensor: %d", ret);
        return ret;
    }

    // Convert to calibrated voltages
    reading->current_voltage = adc_raw_to_voltage(reading->current_raw, CURRENT_SENSOR_CH);
    reading->voltage_voltage = adc_raw_to_voltage(reading->voltage_raw, VOLTAGE_SENSOR_CH);

    return ESP_OK;
}

esp_err_t sample_buffer_write(int current_raw, int voltage_raw) {
    if (xSemaphoreTake(buffer_mutex, pdMS_TO_TICKS(10)) != pdTRUE) {
        return ESP_ERR_TIMEOUT;
    }

    uint32_t index = sample_buffer.write_index;
    sample_buffer.current_samples[index] = current_raw;
    sample_buffer.voltage_samples[index] = voltage_raw;

    sample_buffer.write_index = (index + 1) % SAMPLE_BUFFER_SIZE;

    if (sample_buffer.count < SAMPLE_BUFFER_SIZE) {
        sample_buffer.count++;
    } else {
        // Buffer full, advance read index
        sample_buffer.read_index = (sample_buffer.read_index + 1) % SAMPLE_BUFFER_SIZE;
    }

    xSemaphoreGive(buffer_mutex);
    return ESP_OK;
}

uint32_t sample_buffer_read(int *current_samples, int *voltage_samples, uint32_t num_samples) {
    if (current_samples == NULL || voltage_samples == NULL) {
        return 0;
    }

    if (xSemaphoreTake(buffer_mutex, pdMS_TO_TICKS(100)) != pdTRUE) {
        return 0;
    }

    uint32_t available = sample_buffer.count;
    uint32_t to_read = (num_samples < available) ? num_samples : available;

    uint32_t read_idx = sample_buffer.read_index;
    for (uint32_t i = 0; i < to_read; i++) {
        current_samples[i] = sample_buffer.current_samples[read_idx];
        voltage_samples[i] = sample_buffer.voltage_samples[read_idx];
        read_idx = (read_idx + 1) % SAMPLE_BUFFER_SIZE;
    }

    // Don't advance read index - allow re-reading the same data
    // This allows multiple consumers (power calc, anomaly detection) to use the same samples

    xSemaphoreGive(buffer_mutex);
    return to_read;
}

float adc_calibrate_current_zero(void) {
    LOG_INFO(TAG_SENSOR, "Calibrating current sensor zero offset...");
    LOG_INFO(TAG_SENSOR, "Ensure NO current is flowing through the sensor!");

    vTaskDelay(pdMS_TO_TICKS(2000));  // Give user time to ensure no current

    const int NUM_READINGS = 100;
    float sum = 0.0f;
    sensor_reading_t reading;

    for (int i = 0; i < NUM_READINGS; i++) {
        if (adc_sensor_read(&reading) == ESP_OK) {
            sum += reading.current_voltage;
        }
        vTaskDelay(pdMS_TO_TICKS(10));
    }

    float zero_offset = sum / NUM_READINGS;
    current_zero_offset_calibrated = zero_offset;

    LOG_INFO(TAG_SENSOR, "Current sensor zero offset calibrated: %.3fV", zero_offset);
    return zero_offset;
}
