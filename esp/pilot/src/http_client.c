#include "http_client.h"
#include "logger.h"
#include "config.h"
#include "wifi_manager.h"
#include "relay_control.h"
#include "esp_http_client.h"
#include "cJSON.h"
#include <string.h>

esp_err_t http_client_init(void) {
    LOG_INFO(TAG_HTTP, "HTTP client initialized");
    LOG_INFO(TAG_HTTP, "Server URL: %s", HTTP_SERVER_URL);
    return ESP_OK;
}

static esp_err_t http_event_handler(esp_http_client_event_t *evt) {
    switch(evt->event_id) {
        case HTTP_EVENT_ERROR:
            LOG_ERROR(TAG_HTTP, "HTTP error");
            break;
        case HTTP_EVENT_ON_DATA:
            LOG_DEBUG(TAG_HTTP, "HTTP data received: %d bytes", evt->data_len);
            break;
        default:
            break;
    }
    return ESP_OK;
}

esp_err_t http_post_power_data(const power_data_t *data) {
    if (data == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    if (!wifi_is_connected()) {
        LOG_WARN(TAG_HTTP, "WiFi not connected, skipping power data upload");
        return ESP_FAIL;
    }

    // Create JSON payload
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "device_id", DEVICE_ID);
    cJSON_AddNumberToObject(root, "timestamp", data->timestamp / 1000);  // Convert to seconds
    cJSON_AddNumberToObject(root, "voltage_rms", data->v_rms);
    cJSON_AddNumberToObject(root, "current_rms", data->i_rms);
    cJSON_AddNumberToObject(root, "power_apparent", data->power_apparent);
    cJSON_AddNumberToObject(root, "power_real", data->power_real);
    cJSON_AddNumberToObject(root, "power_factor", data->power_factor);

    char *json_string = cJSON_PrintUnformatted(root);
    if (json_string == NULL) {
        cJSON_Delete(root);
        return ESP_FAIL;
    }

    LOG_DEBUG(TAG_HTTP, "Sending power data: %s", json_string);

    // Configure HTTP client
    char url[256];
    snprintf(url, sizeof(url), "%s%s", HTTP_SERVER_URL, ENDPOINT_POWER_DATA);

    esp_http_client_config_t config = {
        .url = url,
        .method = HTTP_METHOD_POST,
        .timeout_ms = HTTP_TIMEOUT_MS,
        .event_handler = http_event_handler,
    };

    esp_http_client_handle_t client = esp_http_client_init(&config);

    // Set headers
    esp_http_client_set_header(client, "Content-Type", "application/json");
    esp_http_client_set_header(client, "X-API-Key", API_KEY);

    // Set POST data
    esp_http_client_set_post_field(client, json_string, strlen(json_string));

    // Perform request
    esp_err_t err = esp_http_client_perform(client);

    if (err == ESP_OK) {
        int status_code = esp_http_client_get_status_code(client);
        if (status_code == 200 || status_code == 201) {
            LOG_INFO(TAG_HTTP, "Power data sent successfully (status: %d)", status_code);
        } else {
            LOG_WARN(TAG_HTTP, "Server returned status: %d", status_code);
            err = ESP_FAIL;
        }
    } else {
        LOG_ERROR(TAG_HTTP, "HTTP request failed: %s", esp_err_to_name(err));
    }

    // Cleanup
    esp_http_client_cleanup(client);
    free(json_string);
    cJSON_Delete(root);

    return err;
}

esp_err_t http_post_anomaly_event(const anomaly_event_t *event) {
    if (event == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    if (!wifi_is_connected()) {
        LOG_WARN(TAG_HTTP, "WiFi not connected, anomaly event not uploaded");
        return ESP_FAIL;
    }

    // Create JSON payload
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "device_id", DEVICE_ID);
    cJSON_AddNumberToObject(root, "timestamp", event->timestamp / 1000);
    cJSON_AddStringToObject(root, "anomaly_type", anomaly_type_to_string(event->type));
    cJSON_AddNumberToObject(root, "current", event->current_value);
    cJSON_AddNumberToObject(root, "voltage", event->voltage_value);
    cJSON_AddNumberToObject(root, "power", event->power_value);
    cJSON_AddBoolToObject(root, "relay_tripped", event->relay_triggered);

    char *json_string = cJSON_PrintUnformatted(root);
    if (json_string == NULL) {
        cJSON_Delete(root);
        return ESP_FAIL;
    }

    LOG_WARN(TAG_HTTP, "Sending anomaly event: %s", json_string);

    // Configure HTTP client
    char url[256];
    snprintf(url, sizeof(url), "%s%s", HTTP_SERVER_URL, ENDPOINT_ANOMALY_EVENT);

    esp_http_client_config_t config = {
        .url = url,
        .method = HTTP_METHOD_POST,
        .timeout_ms = HTTP_TIMEOUT_MS,
        .event_handler = http_event_handler,
    };

    esp_http_client_handle_t client = esp_http_client_init(&config);

    // Set headers
    esp_http_client_set_header(client, "Content-Type", "application/json");
    esp_http_client_set_header(client, "X-API-Key", API_KEY);

    // Set POST data
    esp_http_client_set_post_field(client, json_string, strlen(json_string));

    // Perform request
    esp_err_t err = esp_http_client_perform(client);

    if (err == ESP_OK) {
        int status_code = esp_http_client_get_status_code(client);
        if (status_code == 200 || status_code == 201) {
            LOG_INFO(TAG_HTTP, "Anomaly event sent successfully (status: %d)", status_code);
        } else {
            LOG_WARN(TAG_HTTP, "Server returned status: %d", status_code);
            err = ESP_FAIL;
        }
    } else {
        LOG_ERROR(TAG_HTTP, "HTTP request failed: %s", esp_err_to_name(err));
    }

    // Cleanup
    esp_http_client_cleanup(client);
    free(json_string);
    cJSON_Delete(root);

    return err;
}

bool http_server_available(void) {
    if (!wifi_is_connected()) {
        return false;
    }

    char url[256];
    snprintf(url, sizeof(url), "%s/api/health", HTTP_SERVER_URL);

    esp_http_client_config_t config = {
        .url = url,
        .method = HTTP_METHOD_GET,
        .timeout_ms = 3000,
    };

    esp_http_client_handle_t client = esp_http_client_init(&config);
    esp_err_t err = esp_http_client_perform(client);

    bool available = false;
    if (err == ESP_OK) {
        int status = esp_http_client_get_status_code(client);
        available = (status == 200);
    }

    esp_http_client_cleanup(client);
    return available;
}
