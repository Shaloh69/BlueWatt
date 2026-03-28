#pragma once

#include <stdbool.h>
#include <stdint.h>
#include "esp_err.h"
#include "freertos/FreeRTOS.h"

// Data from a single PZEM-004T v3.0 Modbus read
typedef struct {
    float    v_rms;          // Voltage RMS (V)
    float    i_rms;          // Current RMS (A)
    float    power;          // Active power (W)
    float    power_apparent; // Apparent power S = V * I (VA)
    float    energy;         // Cumulative energy (Wh)
    float    frequency;      // AC frequency (Hz)
    float    power_factor;   // Power factor (0.00–1.00)
    uint32_t timestamp;      // xTaskGetTickCount * portTICK_PERIOD_MS (ms)
    bool     valid;          // true if last read was successful
} pzem_data_t;

/**
 * @brief Initialize UART2 for PZEM-004T v3.0 communication.
 * @return ESP_OK on success.
 */
esp_err_t pzem_sensor_init(void);

/**
 * @brief Read all measurements from the PZEM-004T via Modbus RTU.
 * @param out Pointer to pzem_data_t to populate.
 * @return ESP_OK on success, ESP_ERR_TIMEOUT or ESP_FAIL on error.
 *         out->valid reflects the result.
 */
esp_err_t pzem_sensor_read(pzem_data_t *out);

/**
 * @brief Reset the energy accumulator register on the PZEM-004T.
 * @return ESP_OK on success.
 */
esp_err_t pzem_reset_energy(void);

/**
 * @brief Return a copy of the most recent successful PZEM reading.
 *        Thread-safe snapshot — populated after the first successful read.
 * @param out Destination struct; out->valid will be false if no read has succeeded yet.
 */
void pzem_sensor_get_last(pzem_data_t *out);
