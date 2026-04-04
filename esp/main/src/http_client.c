#include "http_client.h"
#include "config.h"
#include "logger.h"
#include "relay_control.h"
#include "wifi_manager.h"
#include "led_status.h"

#include "esp_http_client.h"
#include "esp_crt_bundle.h"
#include "esp_log.h"
#include "cJSON.h"
#include "nvs_flash.h"
#include "nvs.h"

#include <string.h>
#include <stdlib.h>

// Runtime-configurable settings (loaded from NVS via Settings tab, fallback to config.h)
static char s_server_url[160] = HTTP_SERVER_URL;
static char s_api_key[80]     = HTTP_API_KEY;
static char s_device_id[80]   = HTTP_DEVICE_ID;

void http_client_init(void)
{
    // Load server URL and API key from NVS (set via the Settings tab in the dashboard)
    nvs_handle_t handle;
    if (nvs_open(NVS_NAMESPACE, NVS_READONLY, &handle) == ESP_OK) {
        size_t url_len = sizeof(s_server_url);
        size_t key_len = sizeof(s_api_key);
        size_t id_len  = sizeof(s_device_id);
        nvs_get_str(handle, "server_url", s_server_url, &url_len);
        nvs_get_str(handle, "api_key",    s_api_key,    &key_len);
        nvs_get_str(handle, "device_id",  s_device_id,  &id_len);
        nvs_close(handle);
    }
    ESP_LOGI(TAG_HTTP, "HTTP client initialized, server: %s  device: %s", s_server_url, s_device_id);
}

static esp_err_t perform_post(const char *url, const char *json_str)
{
    esp_http_client_config_t cfg = {
        .url               = url,
        .method            = HTTP_METHOD_POST,
        .timeout_ms        = HTTP_TIMEOUT_MS,
        .crt_bundle_attach = esp_crt_bundle_attach,  // HTTPS: verify Render's TLS cert
    };

    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    if (!client) {
        ESP_LOGE(TAG_HTTP, "Failed to create HTTP client");
        return ESP_FAIL;
    }

    esp_http_client_set_header(client, "Content-Type", "application/json");
    esp_http_client_set_header(client, "X-API-Key",    s_api_key);
    esp_http_client_set_post_field(client, json_str, strlen(json_str));

    esp_err_t err = esp_http_client_perform(client);
    if (err == ESP_OK) {
        int status = esp_http_client_get_status_code(client);
        if (status != 200 && status != 201) {
            ESP_LOGW(TAG_HTTP, "POST %s returned HTTP %d", url, status);
            led_status_set_server(false);
            err = ESP_FAIL;
        } else {
            LOG_DEBUG(TAG_HTTP, "POST %s -> HTTP %d OK", url, status);
            led_status_set_server(true);
        }
    } else {
        ESP_LOGE(TAG_HTTP, "POST %s failed: %s", url, esp_err_to_name(err));
        led_status_set_server(false);
    }

    esp_http_client_cleanup(client);
    return err;
}

esp_err_t http_post_power_data(const pzem_data_t *data)
{
    if (!wifi_is_connected()) {
        LOG_DEBUG(TAG_HTTP, "WiFi not connected, skipping power data POST");
        return ESP_ERR_INVALID_STATE;
    }
    if (!data || !data->valid) return ESP_ERR_INVALID_ARG;

    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "device_id",      s_device_id);
    cJSON_AddNumberToObject(root, "timestamp",      data->timestamp);
    cJSON_AddNumberToObject(root, "voltage_rms",    (double)data->v_rms);
    cJSON_AddNumberToObject(root, "current_rms",    (double)data->i_rms);
    cJSON_AddNumberToObject(root, "power_real",     (double)data->power);
    cJSON_AddNumberToObject(root, "power_apparent", (double)data->power_apparent);
    cJSON_AddNumberToObject(root, "power_factor",   (double)data->power_factor);
    cJSON_AddNumberToObject(root, "energy_kwh",     (double)(data->energy / 1000.0f));
    cJSON_AddNumberToObject(root, "frequency",      (double)data->frequency);

    char *json_str = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);

    if (!json_str) return ESP_ERR_NO_MEM;

    char url[256];
    snprintf(url, sizeof(url), "%s/api/v1/power-data", s_server_url);
    esp_err_t err = perform_post(url, json_str);

    free(json_str);
    return err;
}

esp_err_t http_post_anomaly_event(const anomaly_event_t *event)
{
    if (!wifi_is_connected()) {
        LOG_DEBUG(TAG_HTTP, "WiFi not connected, skipping anomaly POST");
        return ESP_ERR_INVALID_STATE;
    }
    if (!event) return ESP_ERR_INVALID_ARG;

    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "device_id",    s_device_id);
    cJSON_AddNumberToObject(root, "timestamp",    event->timestamp);
    cJSON_AddStringToObject(root, "anomaly_type", anomaly_type_to_string(event->type));
    cJSON_AddNumberToObject(root, "current",      (double)event->i_rms);
    cJSON_AddNumberToObject(root, "voltage",      (double)event->v_rms);
    cJSON_AddNumberToObject(root, "power",        (double)event->power);
    cJSON_AddBoolToObject(root,   "relay_tripped", event->relay_triggered);

    char *json_str = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);

    if (!json_str) return ESP_ERR_NO_MEM;

    char url[256];
    snprintf(url, sizeof(url), "%s/api/v1/anomaly-events", s_server_url);
    esp_err_t err = perform_post(url, json_str);

    free(json_str);
    return err;
}

bool http_server_available(void)
{
    if (!wifi_is_connected()) return false;

    char url[256];
    snprintf(url, sizeof(url), "%s/api/v1/health", s_server_url);

    esp_http_client_config_t cfg = {
        .url               = url,
        .method            = HTTP_METHOD_GET,
        .timeout_ms        = HTTP_TIMEOUT_MS,
        .crt_bundle_attach = esp_crt_bundle_attach,
    };

    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    if (!client) return false;

    esp_err_t err = esp_http_client_perform(client);
    bool available = (err == ESP_OK && esp_http_client_get_status_code(client) == 200);
    esp_http_client_cleanup(client);
    return available;
}

// ── Relay command polling ─────────────────────────────────────────────────────

esp_err_t http_poll_relay_command(int *out_command_id, char *out_command, size_t cmd_len)
{
    if (!wifi_is_connected()) return ESP_ERR_INVALID_STATE;
    *out_command_id = -1;
    out_command[0]  = '\0';

    char url[320];
    snprintf(url, sizeof(url), "%s/api/v1/devices/%s/relay-command", s_server_url, s_device_id);

    char resp_buf[256] = {0};
    esp_http_client_config_t cfg = {
        .url               = url,
        .method            = HTTP_METHOD_GET,
        .timeout_ms        = HTTP_TIMEOUT_MS,
        .user_data         = resp_buf,
        .crt_bundle_attach = esp_crt_bundle_attach,
    };

    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    if (!client) return ESP_FAIL;

    esp_http_client_set_header(client, "X-API-Key", s_api_key);

    // Use event-based approach: open + read manually
    esp_err_t err = esp_http_client_open(client, 0);
    if (err != ESP_OK) {
        esp_http_client_cleanup(client);
        return err;
    }

    int content_len = esp_http_client_fetch_headers(client);
    if (content_len < 0) content_len = 255;

    int read_len = esp_http_client_read(client, resp_buf, content_len < 255 ? content_len : 255);
    esp_http_client_close(client);
    esp_http_client_cleanup(client);

    if (read_len <= 0) return ESP_FAIL;
    resp_buf[read_len] = '\0';

    // Parse: {"data":{"command":"off","command_id":42}} or {"data":{"command":null,"command_id":null}}
    cJSON *root = cJSON_Parse(resp_buf);
    if (!root) return ESP_FAIL;

    cJSON *data    = cJSON_GetObjectItem(root, "data");
    cJSON *cmd_obj = data ? cJSON_GetObjectItem(data, "command")    : NULL;
    cJSON *id_obj  = data ? cJSON_GetObjectItem(data, "command_id") : NULL;

    if (cmd_obj && cJSON_IsString(cmd_obj)) {
        strncpy(out_command, cmd_obj->valuestring, cmd_len - 1);
        out_command[cmd_len - 1] = '\0';
    }
    if (id_obj && cJSON_IsNumber(id_obj)) {
        *out_command_id = (int)id_obj->valuedouble;
    }

    cJSON_Delete(root);
    return ESP_OK;
}

esp_err_t http_ack_relay_command(int command_id, const char *relay_status)
{
    if (!wifi_is_connected()) return ESP_ERR_INVALID_STATE;

    cJSON *root = cJSON_CreateObject();
    cJSON_AddNumberToObject(root, "command_id",    command_id);
    cJSON_AddStringToObject(root, "relay_status",  relay_status);

    char *json_str = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    if (!json_str) return ESP_ERR_NO_MEM;

    char url[320];
    snprintf(url, sizeof(url), "%s/api/v1/devices/%s/relay-command/ack", s_server_url, s_device_id);

    esp_http_client_config_t cfg = {
        .url               = url,
        .method            = HTTP_METHOD_PUT,
        .timeout_ms        = HTTP_TIMEOUT_MS,
        .crt_bundle_attach = esp_crt_bundle_attach,
    };

    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    if (!client) { free(json_str); return ESP_FAIL; }

    esp_http_client_set_header(client, "Content-Type", "application/json");
    esp_http_client_set_header(client, "X-API-Key",    s_api_key);
    esp_http_client_set_post_field(client, json_str, strlen(json_str));

    esp_err_t err = esp_http_client_perform(client);
    esp_http_client_cleanup(client);
    free(json_str);

    LOG_DEBUG(TAG_HTTP, "ACK relay command %d -> %s", command_id, esp_err_to_name(err));
    return err;
}
