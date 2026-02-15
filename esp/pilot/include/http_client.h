#ifndef HTTP_CLIENT_H
#define HTTP_CLIENT_H

#include "esp_err.h"
#include "power_calc.h"
#include "anomaly_detector.h"

/**
 * Initialize HTTP client
 */
esp_err_t http_client_init(void);

/**
 * Post power data to server
 * @param data Power measurement data
 * @return ESP_OK on success
 */
esp_err_t http_post_power_data(const power_data_t *data);

/**
 * Post anomaly event to server
 * @param event Anomaly event data
 * @return ESP_OK on success
 */
esp_err_t http_post_anomaly_event(const anomaly_event_t *event);

/**
 * Check if server is reachable
 * @return true if server responds to health check
 */
bool http_server_available(void);

#endif // HTTP_CLIENT_H
