#include "wifi_manager.h"
#include "wifi_provisioning.h"
#include "logger.h"
#include "config.h"

#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "lwip/inet.h"

#include <string.h>
#include <stdio.h>

#define WIFI_CONNECTED_BIT  BIT0
#define WIFI_FAIL_BIT       BIT1

static EventGroupHandle_t wifi_event_group;
static bool               s_wifi_started    = false;  // true once esp_wifi_start() succeeds
static bool               s_intentional_stop = false; // suppresses reconnect during deliberate stop
static wifi_context_t wifi_ctx = {
    .state              = WIFI_STATE_DISCONNECTED,
    .retry_count        = 0,
    .ip_addr            = {0},
    .internet_available = false,
};

static esp_netif_t *sta_netif = NULL;
static esp_netif_t *ap_netif  = NULL;

static void wifi_event_handler(void *arg, esp_event_base_t event_base,
                               int32_t event_id, void *event_data)
{
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        LOG_INFO(TAG_WIFI, "Station started, connecting...");
        esp_wifi_connect();

    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        wifi_ctx.state = WIFI_STATE_DISCONNECTED;

        // If we stopped the stack deliberately (e.g. switching to AP provisioning mode),
        // do NOT attempt to reconnect — that would corrupt the WiFi state.
        if (s_intentional_stop) {
            LOG_INFO(TAG_WIFI, "Disconnected (intentional stop) — skipping reconnect");

        } else if (wifi_ctx.retry_count < WIFI_MAX_RETRY) {
            esp_wifi_connect();
            wifi_ctx.retry_count++;
            LOG_WARN(TAG_WIFI, "Retrying (%d/%d)...", wifi_ctx.retry_count, WIFI_MAX_RETRY);
        } else {
            xEventGroupSetBits(wifi_event_group, WIFI_FAIL_BIT);
            wifi_ctx.state       = WIFI_STATE_FAILED;
            wifi_ctx.retry_count = 0;  // Reset so manager task can retry fresh
            LOG_ERROR(TAG_WIFI, "Connection failed after %d attempts", WIFI_MAX_RETRY);
        }

    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *event = (ip_event_got_ip_t *)event_data;
        snprintf(wifi_ctx.ip_addr, sizeof(wifi_ctx.ip_addr),
                 IPSTR, IP2STR(&event->ip_info.ip));
        wifi_ctx.state       = WIFI_STATE_CONNECTED;
        wifi_ctx.retry_count = 0;
        xEventGroupSetBits(wifi_event_group, WIFI_CONNECTED_BIT);
        LOG_INFO(TAG_WIFI, "Connected! IP: %s", wifi_ctx.ip_addr);

    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_AP_STACONNECTED) {
        wifi_event_ap_staconnected_t *ev = (wifi_event_ap_staconnected_t *)event_data;
        LOG_INFO(TAG_WIFI, "Client joined AP, AID=%d", ev->aid);

    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_AP_STADISCONNECTED) {
        wifi_event_ap_stadisconnected_t *ev = (wifi_event_ap_stadisconnected_t *)event_data;
        LOG_INFO(TAG_WIFI, "Client left AP, AID=%d", ev->aid);
    }
}

esp_err_t wifi_init(void)
{
    LOG_INFO(TAG_WIFI, "Initializing WiFi...");

    wifi_event_group = xEventGroupCreate();

    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    sta_netif = esp_netif_create_default_wifi_sta();
    ap_netif  = esp_netif_create_default_wifi_ap();
    (void)ap_netif;

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    esp_event_handler_instance_t instance_any_id;
    esp_event_handler_instance_t instance_got_ip;
    ESP_ERROR_CHECK(esp_event_handler_instance_register(WIFI_EVENT, ESP_EVENT_ANY_ID,
                                                        &wifi_event_handler, NULL,
                                                        &instance_any_id));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(IP_EVENT, IP_EVENT_STA_GOT_IP,
                                                        &wifi_event_handler, NULL,
                                                        &instance_got_ip));

    ESP_ERROR_CHECK(wifi_provisioning_init());

    LOG_INFO(TAG_WIFI, "WiFi initialized");
    return ESP_OK;
}

// If a static IP is saved in NVS, apply it to the STA netif.
// Gateway is auto-derived by replacing the last octet with 1 (covers 99% of home routers).
static void apply_static_ip_if_configured(void)
{
    char sip[20] = {0};
    if (wifi_provisioning_load_static_ip(sip, sizeof(sip)) != ESP_OK) return;
    if (strlen(sip) == 0) return;

    unsigned int a, b, c, d;
    if (sscanf(sip, "%u.%u.%u.%u", &a, &b, &c, &d) != 4) return;

    char gw[20];
    snprintf(gw, sizeof(gw), "%u.%u.%u.1", a, b, c);

    esp_netif_ip_info_t ip_info = {0};
    ip_info.ip.addr      = inet_addr(sip);
    ip_info.gw.addr      = inet_addr(gw);
    ip_info.netmask.addr = inet_addr("255.255.255.0");

    esp_netif_dhcpc_stop(sta_netif);          // stop DHCP — ignore error if already stopped
    esp_netif_set_ip_info(sta_netif, &ip_info);
    LOG_INFO(TAG_WIFI, "Static IP: %s  GW: %s  Mask: 255.255.255.0", sip, gw);
}

esp_err_t wifi_connect(void)
{
    char ssid[64]     = {0};
    char password[64] = {0};

    if (wifi_provisioning_is_configured()) {
        esp_err_t err = wifi_provisioning_load_credentials(ssid, sizeof(ssid),
                                                           password, sizeof(password));
        if (err == ESP_OK) {
            LOG_INFO(TAG_WIFI, "Using NVS credentials: %s", ssid);
        } else {
            LOG_WARN(TAG_WIFI, "NVS load failed, using defaults");
            strncpy(ssid,     WIFI_DEFAULT_SSID,     sizeof(ssid) - 1);
            strncpy(password, WIFI_DEFAULT_PASSWORD, sizeof(password) - 1);
        }
    } else {
        LOG_INFO(TAG_WIFI, "No saved credentials, using defaults");
        strncpy(ssid,     WIFI_DEFAULT_SSID,     sizeof(ssid) - 1);
        strncpy(password, WIFI_DEFAULT_PASSWORD, sizeof(password) - 1);
    }

    wifi_config_t wifi_config = {0};
    strncpy((char *)wifi_config.sta.ssid,     ssid,     sizeof(wifi_config.sta.ssid) - 1);
    strncpy((char *)wifi_config.sta.password, password, sizeof(wifi_config.sta.password) - 1);
    wifi_config.sta.threshold.authmode = WIFI_AUTH_WPA2_PSK;

    // Clear any stale bits from a previous attempt before waiting again
    xEventGroupClearBits(wifi_event_group, WIFI_CONNECTED_BIT | WIFI_FAIL_BIT);

    wifi_ctx.state       = WIFI_STATE_CONNECTING;
    wifi_ctx.retry_count = 0;

    if (s_wifi_started) {
        // Stack is already running in STA mode — update config and issue a
        // fresh connect.  WIFI_EVENT_STA_START won't fire again, so we call
        // esp_wifi_connect() ourselves; the disconnect handler will retry.
        esp_wifi_set_config(WIFI_IF_STA, &wifi_config);
        esp_wifi_connect();
    } else {
        // First call (or after a stop) — bring the stack up in STA mode.
        esp_err_t start_err;
        start_err = esp_wifi_set_mode(WIFI_MODE_STA);
        if (start_err != ESP_OK) {
            LOG_ERROR(TAG_WIFI, "set_mode STA failed: %s", esp_err_to_name(start_err));
            return start_err;
        }
        start_err = esp_wifi_set_config(WIFI_IF_STA, &wifi_config);
        if (start_err != ESP_OK) {
            LOG_ERROR(TAG_WIFI, "set_config failed: %s", esp_err_to_name(start_err));
            return start_err;
        }
        apply_static_ip_if_configured();
        start_err = esp_wifi_start();
        if (start_err != ESP_OK) {
            LOG_ERROR(TAG_WIFI, "esp_wifi_start failed: %s", esp_err_to_name(start_err));
            return start_err;
        }
        // Disable modem-sleep so the link stays alive under light traffic.
        esp_wifi_set_ps(WIFI_PS_NONE);
        s_wifi_started = true;
        // WIFI_EVENT_STA_START fires and calls esp_wifi_connect() automatically.
    }

    EventBits_t bits = xEventGroupWaitBits(wifi_event_group,
                                           WIFI_CONNECTED_BIT | WIFI_FAIL_BIT,
                                           pdFALSE, pdFALSE,
                                           pdMS_TO_TICKS(WIFI_RECONNECT_MS));

    if (bits & WIFI_CONNECTED_BIT) {
        return ESP_OK;
    } else if (bits & WIFI_FAIL_BIT) {
        return ESP_FAIL;
    }

    LOG_WARN(TAG_WIFI, "Connection timeout");
    return ESP_ERR_TIMEOUT;
}

void wifi_disconnect(void)
{
    esp_wifi_disconnect();
}

void wifi_start_provisioning_mode(void)
{
    LOG_WARN(TAG_WIFI, "Starting provisioning AP: %s", PROV_AP_SSID);
    // Stop the STA stack (if running) before switching to AP mode.
    if (s_wifi_started) {
        s_intentional_stop = true;   // tell disconnect handler not to reconnect
        esp_wifi_stop();
        s_intentional_stop = false;
        s_wifi_started = false;
    }
    wifi_ctx.state = WIFI_STATE_DISCONNECTED;
    wifi_provisioning_start_ap();
    LOG_INFO(TAG_WIFI, "Connect to '%s' (pw: %s) then open http://192.168.4.1",
             PROV_AP_SSID, PROV_AP_PASSWORD);
}

wifi_state_t wifi_get_state(void)
{
    return wifi_ctx.state;
}

bool wifi_is_connected(void)
{
    return wifi_ctx.state == WIFI_STATE_CONNECTED;
}

const char *wifi_get_ip(void)
{
    return wifi_ctx.ip_addr;
}
