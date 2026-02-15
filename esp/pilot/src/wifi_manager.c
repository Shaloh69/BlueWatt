#include "wifi_manager.h"
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
    }
}

esp_err_t wifi_init(void) {
    LOG_INFO(TAG_WIFI, "Initializing WiFi...");

    wifi_event_group = xEventGroupCreate();

    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();

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

    LOG_INFO(TAG_WIFI, "WiFi initialized successfully");
    return ESP_OK;
}

esp_err_t wifi_connect(void) {
    LOG_INFO(TAG_WIFI, "Connecting to WiFi SSID: %s", WIFI_SSID);

    wifi_config_t wifi_config = {
        .sta = {
            .ssid = WIFI_SSID,
            .password = WIFI_PASSWORD,
            .threshold.authmode = WIFI_AUTH_WPA2_PSK,
        },
    };

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_start());

    wifi_ctx.state = WIFI_STATE_CONNECTING;
    wifi_ctx.retry_count = 0;

    EventBits_t bits = xEventGroupWaitBits(wifi_event_group,
            WIFI_CONNECTED_BIT | WIFI_FAIL_BIT,
            pdFALSE,
            pdFALSE,
            portMAX_DELAY);

    if (bits & WIFI_CONNECTED_BIT) {
        LOG_INFO(TAG_WIFI, "Successfully connected to WiFi");
        return ESP_OK;
    } else if (bits & WIFI_FAIL_BIT) {
        LOG_ERROR(TAG_WIFI, "Failed to connect to WiFi");
        return ESP_FAIL;
    }

    return ESP_ERR_TIMEOUT;
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
