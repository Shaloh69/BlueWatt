#pragma once

#include "esp_err.h"
#include "pzem_sensor.h"
#include "anomaly_detector.h"

/**
 * @brief Initialize HTTP client module.
 *        Loads server URL and API key from NVS (saved via Settings tab);
 *        falls back to HTTP_SERVER_URL / HTTP_API_KEY from config.h.
 */
void http_client_init(void);

/**
 * @brief POST PZEM power data to /api/v1/power-data.
 *        JSON: device_id, timestamp, voltage_rms, current_rms, power_real,
 *              power_apparent, power_factor, energy_kwh, frequency.
 */
esp_err_t http_post_power_data(const pzem_data_t *data);

/**
 * @brief POST anomaly event to /api/v1/anomaly-events immediately.
 */
esp_err_t http_post_anomaly_event(const anomaly_event_t *event);

/**
 * @brief GET /api/v1/health — check if server is reachable.
 */
bool http_server_available(void);

/**
 * @brief Poll /api/v1/devices/{id}/relay-command for a pending command.
 * @param out_command_id  Set to command ID or -1 if none pending.
 * @param out_command     Set to "on", "off", "reset" or empty string.
 * @param cmd_len         Size of out_command buffer.
 * @return ESP_OK on success (even if no command pending).
 */
esp_err_t http_poll_relay_command(int *out_command_id, char *out_command, size_t cmd_len);

/**
 * @brief ACK a relay command via PUT /api/v1/devices/{id}/relay-command/ack.
 * @param command_id    The command ID from http_poll_relay_command.
 * @param relay_status  "on", "off", or "tripped" — current relay state after execution.
 */
esp_err_t http_ack_relay_command(int command_id, const char *relay_status);
