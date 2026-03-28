#pragma once

#include <stdbool.h>
#include <stdint.h>
#include "esp_err.h"

typedef enum {
    WIFI_STATE_DISCONNECTED = 0,
    WIFI_STATE_CONNECTING,
    WIFI_STATE_CONNECTED,
    WIFI_STATE_FAILED,
} wifi_state_t;

typedef struct {
    wifi_state_t state;
    uint8_t      retry_count;
    char         ip_addr[16];
    bool         internet_available;
} wifi_context_t;

/**
 * @brief Initialize WiFi hardware, netif, event loop, and event handlers.
 */
esp_err_t wifi_init(void);

/**
 * @brief Connect using NVS-stored credentials or config.h defaults.
 * @return ESP_OK if connected successfully.
 */
esp_err_t wifi_connect(void);

/**
 * @brief Disconnect from current AP.
 */
void wifi_disconnect(void);

/**
 * @brief Switch to AP provisioning mode (web portal at 192.168.4.1).
 */
void wifi_start_provisioning_mode(void);

/**
 * @brief Return current WiFi state.
 */
wifi_state_t wifi_get_state(void);

/**
 * @brief Return true if currently connected to an AP.
 */
bool wifi_is_connected(void);

/**
 * @brief Return the current IP address string.
 */
const char *wifi_get_ip(void);
