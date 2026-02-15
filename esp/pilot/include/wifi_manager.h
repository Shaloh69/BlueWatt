#ifndef WIFI_MANAGER_H
#define WIFI_MANAGER_H

#include "esp_err.h"
#include "esp_netif_types.h"
#include <stdbool.h>

// WiFi connection states
typedef enum {
    WIFI_STATE_DISCONNECTED,
    WIFI_STATE_CONNECTING,
    WIFI_STATE_CONNECTED,
    WIFI_STATE_FAILED
} wifi_state_t;

// WiFi context
typedef struct {
    wifi_state_t state;
    uint32_t retry_count;
    esp_ip4_addr_t ip_addr;
    bool has_internet;
} wifi_context_t;

/**
 * Initialize WiFi subsystem
 */
esp_err_t wifi_init(void);

/**
 * Connect to WiFi network
 * Uses credentials from config.h
 */
esp_err_t wifi_connect(void);

/**
 * Disconnect from WiFi
 */
esp_err_t wifi_disconnect(void);

/**
 * Get current WiFi state
 */
wifi_state_t wifi_get_state(void);

/**
 * Check if WiFi is connected
 */
bool wifi_is_connected(void);

/**
 * Get IP address
 */
esp_ip4_addr_t wifi_get_ip(void);

#endif // WIFI_MANAGER_H
