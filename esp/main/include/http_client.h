#pragma once

#include "esp_err.h"
#include "pzem_sensor.h"
#include "anomaly_detector.h"

/**
 * @brief Initialize HTTP client module (logs server URL).
 */
void http_client_init(void);

/**
 * @brief POST PZEM power data to /api/power-data.
 *        JSON includes: v_rms, i_rms, power_real, power_apparent, pf,
 *                       energy_kwh, frequency, device_id, timestamp.
 * @param data Pointer to current PZEM readings.
 * @return ESP_OK on HTTP 200/201, ESP_FAIL otherwise.
 */
esp_err_t http_post_power_data(const pzem_data_t *data);

/**
 * @brief POST anomaly event to /api/anomaly-events immediately.
 * @param event Pointer to the detected anomaly event.
 * @return ESP_OK on success.
 */
esp_err_t http_post_anomaly_event(const anomaly_event_t *event);

/**
 * @brief GET /api/health to check if the server is reachable.
 * @return true if server responds HTTP 200.
 */
bool http_server_available(void);
