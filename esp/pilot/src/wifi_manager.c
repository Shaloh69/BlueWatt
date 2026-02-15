#include "wifi_manager.h"
#include "wifi_provisioning.h"
#include "logger.h"
#include "config.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include <string.h>

#define WIFI_CONNECTED_BIT BIT0
#define WIFI_FAIL_BIT      BIT1

static EventGroupHandle_t wifi_event_group;
static wifi_context_t wifi_ctx = {
    .state = WIFI_STATE_DISCONNECTED,
    .retry_count = 0,
    .has_internet = false
};

static esp_netif_t *sta_netif = NULL;
static esp_netif_t *ap_netif = NULL;

static void wifi_event_handler(void* arg, esp_event_base_t event_base,
                               int32_t event_id, void* event_data) {
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        LOG_INFO(TAG_WIFI, "WiFi station started, connecting...");
        esp_wifi_connect();
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        wifi_ctx.state = WIFI_STATE_DISCONNECTED;

        if (wifi_ctx.retry_count < WIFI_MAXIMUM_RETRY) {
            esp_wifi_connect();
            wifi_ctx.retry_count++;
            LOG_WARN(TAG_WIFI, "Retrying connection (%lu/%d)", wifi_ctx.retry_count, WIFI_MAXIMUM_RETRY);
        } else {
            xEventGroupSetBits(wifi_event_group, WIFI_FAIL_BIT);
            wifi_ctx.state = WIFI_STATE_FAILED;
            LOG_ERROR(TAG_WIFI, "Failed to connect after %d attempts", WIFI_MAXIMUM_RETRY);
        }
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t* event = (ip_event_got_ip_t*) event_data;
        wifi_ctx.ip_addr = event->ip_info.ip;
        wifi_ctx.state = WIFI_STATE_CONNECTED;
        wifi_ctx.retry_count = 0;

        LOG_INFO(TAG_WIFI, "Connected! IP: " IPSTR, IP2STR(&event->ip_info.ip));
        xEventGroupSetBits(wifi_event_group, WIFI_CONNECTED_BIT);
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_AP_STACONNECTED) {
        wifi_event_ap_staconnected_t* event = (wifi_event_ap_staconnected_t*) event_data;
        LOG_INFO(TAG_WIFI, "Station joined AP, AID=%d", event->aid);
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_AP_STADISCONNECTED) {
        wifi_event_ap_stadisconnected_t* event = (wifi_event_ap_stadisconnected_t*) event_data;
        LOG_INFO(TAG_WIFI, "Station left AP, AID=%d", event->aid);
    }
}

esp_err_t wifi_init(void) {
    LOG_INFO(TAG_WIFI, "Initializing WiFi...");

    wifi_event_group = xEventGroupCreate();

    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    sta_netif = esp_netif_create_default_wifi_sta();
    ap_netif = esp_netif_create_default_wifi_ap();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    esp_event_handler_instance_t instance_any_id;
    esp_event_handler_instance_t instance_got_ip;
    ESP_ERROR_CHECK(esp_event_handler_instance_register(WIFI_EVENT,
                                                        ESP_EVENT_ANY_ID,
                                                        &wifi_event_handler,
                                                        NULL,
                                                        &instance_any_id));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(IP_EVENT,
                                                        IP_EVENT_STA_GOT_IP,
                                                        &wifi_event_handler,
                                                        NULL,
                                                        &instance_got_ip));

    // Initialize provisioning
    ESP_ERROR_CHECK(wifi_provisioning_init());

    LOG_INFO(TAG_WIFI, "WiFi initialized successfully");
    return ESP_OK;
}

esp_err_t wifi_connect(void) {
    char ssid[64] = {0};
    char password[64] = {0};

    // Try to load credentials from NVS first
    if (wifi_provisioning_is_configured()) {
        esp_err_t err = wifi_provisioning_load_credentials(ssid, sizeof(ssid),
                                                           password, sizeof(password));
        if (err == ESP_OK) {
            LOG_INFO(TAG_WIFI, "Using saved WiFi credentials: %s", ssid);
        } else {
            LOG_WARN(TAG_WIFI, "Failed to load saved credentials, using defaults");
            strncpy(ssid, WIFI_SSID, sizeof(ssid) - 1);
            strncpy(password, WIFI_PASSWORD, sizeof(password) - 1);
        }
    } else {
        LOG_INFO(TAG_WIFI, "No saved credentials, using default config");
        strncpy(ssid, WIFI_SSID, sizeof(ssid) - 1);
        strncpy(password, WIFI_PASSWORD, sizeof(password) - 1);
    }

    LOG_INFO(TAG_WIFI, "Connecting to WiFi SSID: %s", ssid);

    wifi_config_t wifi_config = {0};
    strncpy((char *)wifi_config.sta.ssid, ssid, sizeof(wifi_config.sta.ssid) - 1);
    strncpy((char *)wifi_config.sta.password, password, sizeof(wifi_config.sta.password) - 1);
    wifi_config.sta.threshold.authmode = WIFI_AUTH_WPA2_PSK;

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_start());

    wifi_ctx.state = WIFI_STATE_CONNECTING;
    wifi_ctx.retry_count = 0;

    EventBits_t bits = xEventGroupWaitBits(wifi_event_group,
            WIFI_CONNECTED_BIT | WIFI_FAIL_BIT,
            pdFALSE,
            pdFALSE,
            pdMS_TO_TICKS(WIFI_RECONNECT_MS));

    if (bits & WIFI_CONNECTED_BIT) {
        LOG_INFO(TAG_WIFI, "Successfully connected to WiFi");
        return ESP_OK;
    } else if (bits & WIFI_FAIL_BIT) {
        LOG_ERROR(TAG_WIFI, "Failed to connect to WiFi");
        return ESP_FAIL;
    }

    LOG_WARN(TAG_WIFI, "WiFi connection timeout");
    return ESP_ERR_TIMEOUT;
}

esp_err_t wifi_start_provisioning_mode(void) {
    LOG_WARN(TAG_WIFI, "Starting WiFi provisioning mode - AP SSID: %s", PROVISIONING_AP_SSID);

    wifi_ctx.state = WIFI_STATE_DISCONNECTED;

    // Start provisioning AP
    esp_err_t err = wifi_provisioning_start_ap();
    if (err != ESP_OK) {
        LOG_ERROR(TAG_WIFI, "Failed to start provisioning AP");
        return err;
    }

    LOG_INFO(TAG_WIFI, "===============================================");
    LOG_INFO(TAG_WIFI, "  WiFi Provisioning Mode Active");
    LOG_INFO(TAG_WIFI, "  Connect to WiFi: %s", PROVISIONING_AP_SSID);
    LOG_INFO(TAG_WIFI, "  Password: %s", PROVISIONING_AP_PASSWORD);
    LOG_INFO(TAG_WIFI, "  Open browser and go to: http://192.168.4.1");
    LOG_INFO(TAG_WIFI, "===============================================");

    return ESP_OK;
}

esp_err_t wifi_disconnect(void) {
    LOG_INFO(TAG_WIFI, "Disconnecting from WiFi");
    return esp_wifi_disconnect();
}

wifi_state_t wifi_get_state(void) {
    return wifi_ctx.state;
}

bool wifi_is_connected(void) {
    return wifi_ctx.state == WIFI_STATE_CONNECTED;
}

esp_ip4_addr_t wifi_get_ip(void) {
    return wifi_ctx.ip_addr;
}
