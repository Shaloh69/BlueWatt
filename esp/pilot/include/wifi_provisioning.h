#ifndef WIFI_PROVISIONING_H
#define WIFI_PROVISIONING_H

#include "esp_err.h"
#include <stdbool.h>

#define PROVISIONING_AP_SSID "BlueWatt-Setup"
#define PROVISIONING_AP_PASSWORD "bluewatt2024"
#define PROVISIONING_AP_CHANNEL 1
#define PROVISIONING_AP_MAX_CONNECTIONS 4

#define NVS_WIFI_NAMESPACE "wifi_config"
#define NVS_WIFI_SSID_KEY "ssid"
#define NVS_WIFI_PASSWORD_KEY "password"
#define NVS_WIFI_CONFIGURED_KEY "configured"

typedef enum {
    PROV_STATE_IDLE,
    PROV_STATE_AP_STARTED,
    PROV_STATE_CREDENTIALS_RECEIVED,
    PROV_STATE_CONNECTING,
    PROV_STATE_CONNECTED,
    PROV_STATE_FAILED
} provisioning_state_t;

/**
 * Initialize WiFi provisioning system
 */
esp_err_t wifi_provisioning_init(void);

/**
 * Start WiFi provisioning AP mode
 */
esp_err_t wifi_provisioning_start_ap(void);

/**
 * Stop WiFi provisioning AP mode
 */
esp_err_t wifi_provisioning_stop_ap(void);

/**
 * Save WiFi credentials to NVS
 */
esp_err_t wifi_provisioning_save_credentials(const char *ssid, const char *password);

/**
 * Load WiFi credentials from NVS
 */
esp_err_t wifi_provisioning_load_credentials(char *ssid, size_t ssid_len,
                                              char *password, size_t password_len);

/**
 * Check if WiFi credentials are configured
 */
bool wifi_provisioning_is_configured(void);

/**
 * Clear saved WiFi credentials
 */
esp_err_t wifi_provisioning_clear_credentials(void);

/**
 * Get current provisioning state
 */
provisioning_state_t wifi_provisioning_get_state(void);

#endif // WIFI_PROVISIONING_H
