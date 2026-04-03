#pragma once

#include <stdbool.h>
#include "esp_err.h"

// Provisioning AP settings
#define PROV_AP_SSID        "BlueWatt-Setup"
#define PROV_AP_PASSWORD    "bluewatt2024"
#define PROV_AP_CHANNEL     1
#define PROV_AP_MAX_CONN    4

// NVS namespace and keys for credential storage
#define PROV_NVS_NAMESPACE  "wifi_config"
#define PROV_NVS_KEY_SSID   "ssid"
#define PROV_NVS_KEY_PASS   "password"
#define PROV_NVS_KEY_FLAG   "configured"

typedef enum {
    PROV_STATE_IDLE = 0,
    PROV_STATE_AP_STARTED,
    PROV_STATE_CREDENTIALS_RECEIVED,
    PROV_STATE_CONNECTING,
    PROV_STATE_CONNECTED,
    PROV_STATE_FAILED,
} provisioning_state_t;

/**
 * @brief Initialize NVS for credential storage.
 */
esp_err_t wifi_provisioning_init(void);

/**
 * @brief Start AP + HTTP server for credential provisioning.
 *        Web portal served at http://192.168.4.1
 */
esp_err_t wifi_provisioning_start_ap(void);

/**
 * @brief Stop HTTP server and AP.
 */
void wifi_provisioning_stop_ap(void);

/**
 * @brief Save SSID and password to NVS.
 */
esp_err_t wifi_provisioning_save_credentials(const char *ssid, const char *password);

/**
 * @brief Load SSID and password from NVS.
 */
esp_err_t wifi_provisioning_load_credentials(char *ssid, size_t ssid_len,
                                              char *password, size_t pass_len);

/**
 * @brief Return true if credentials have been saved to NVS.
 */
bool wifi_provisioning_is_configured(void);

/**
 * @brief Erase all stored credentials from NVS.
 */
esp_err_t wifi_provisioning_clear_credentials(void);

/**
 * @brief Return current provisioning state.
 */
provisioning_state_t wifi_provisioning_get_state(void);

/**
 * @brief Load static IP from NVS.
 *        Returns ESP_ERR_NVS_NOT_FOUND if not configured (use DHCP).
 */
esp_err_t wifi_provisioning_load_static_ip(char *ip, size_t ip_len);

/**
 * @brief Start the HTTP dashboard server on the STA interface.
 *        Call this right after a successful wifi_connect() so the full
 *        BlueWatt dashboard (readings, relay, WiFi config) is reachable at
 *        http://<device-ip>/.  Safe to call multiple times — no-ops if the
 *        server is already running.
 */
esp_err_t wifi_provisioning_start_sta_server(void);
