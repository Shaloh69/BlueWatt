#include "http_client.h"
#include "config.h"
#include "logger.h"
#include "relay_control.h"
#include "wifi_manager.h"

#include "esp_http_client.h"
#include "esp_log.h"
#include "cJSON.h"

#include <string.h>

void http_client_init(void)
{
    ESP_LOGI(TAG_HTTP, "HTTP client initialized, server: %s", HTTP_SERVER_URL);
}

static esp_err_t perform_post(const char *url, const char *json_str)
{
    esp_http_client_config_t config = {
        .url            = url,
        .method         = HTTP_METHOD_POST,
        .timeout_ms     = HTTP_TIMEOUT_MS,
    };

    esp_http_client_handle_t client = esp_http_client_init(&config);
    if (!client) {
        ESP_LOGE(TAG_HTTP, "Failed to create HTTP client");
        return ESP_FAIL;
    }

    esp_http_client_set_header(client, "Content-Type", "application/json");
    esp_http_client_set_header(client, "X-API-Key", HTTP_API_KEY);
    esp_http_client_set_post_field(client, json_str, strlen(json_str));

    esp_err_t err = esp_http_client_perform(client);
    if (err == ESP_OK) {
        int status = esp_http_client_get_status_code(client);
        if (status != 200 && status != 201) {
            ESP_LOGW(TAG_HTTP, "POST %s returned HTTP %d", url, status);
            err = ESP_FAIL;
        } else {
            LOG_DEBUG(TAG_HTTP, "POST %s -> HTTP %d OK", url, status);
        }
    } else {
        ESP_LOGE(TAG_HTTP, "POST %s failed: %s", url, esp_err_to_name(err));
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
    cJSON_AddStringToObject(root, "device_id",      HTTP_DEVICE_ID);
    cJSON_AddNumberToObject(root, "timestamp",      data->timestamp);
    cJSON_AddNumberToObject(root, "v_rms",          (double)data->v_rms);
    cJSON_AddNumberToObject(root, "i_rms",          (double)data->i_rms);
    cJSON_AddNumberToObject(root, "power_real",     (double)data->power);
    cJSON_AddNumberToObject(root, "power_apparent", (double)data->power_apparent);
    cJSON_AddNumberToObject(root, "power_factor",   (double)data->power_factor);
    cJSON_AddNumberToObject(root, "energy_kwh",     (double)(data->energy / 1000.0f));
    cJSON_AddNumberToObject(root, "frequency",      (double)data->frequency);

    char *json_str = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);

    if (!json_str) return ESP_ERR_NO_MEM;

    char url[128];
    snprintf(url, sizeof(url), "%s/api/power-data", HTTP_SERVER_URL);
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
    cJSON_AddStringToObject(root, "device_id",      HTTP_DEVICE_ID);
    cJSON_AddNumberToObject(root, "timestamp",      event->timestamp);
    cJSON_AddStringToObject(root, "anomaly_type",   anomaly_type_to_string(event->type));
    cJSON_AddNumberToObject(root, "current",        (double)event->i_rms);
    cJSON_AddNumberToObject(root, "voltage",        (double)event->v_rms);
    cJSON_AddNumberToObject(root, "power",          (double)event->power);
    cJSON_AddBoolToObject(root,   "relay_tripped",  event->relay_triggered);

    char *json_str = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);

    if (!json_str) return ESP_ERR_NO_MEM;

    char url[128];
    snprintf(url, sizeof(url), "%s/api/anomaly-events", HTTP_SERVER_URL);
    esp_err_t err = perform_post(url, json_str);

    free(json_str);
    return err;
}

bool http_server_available(void)
{
    if (!wifi_is_connected()) return false;

    char url[128];
    snprintf(url, sizeof(url), "%s/api/health", HTTP_SERVER_URL);

    esp_http_client_config_t config = {
        .url        = url,
        .method     = HTTP_METHOD_GET,
        .timeout_ms = HTTP_TIMEOUT_MS,
    };

    esp_http_client_handle_t client = esp_http_client_init(&config);
    if (!client) return false;

    esp_err_t err = esp_http_client_perform(client);
    bool available = (err == ESP_OK && esp_http_client_get_status_code(client) == 200);
    esp_http_client_cleanup(client);
    return available;
}
