#include "config.h"
#include "logger.h"
#include "pzem_sensor.h"
#include "anomaly_detector.h"
#include "relay_control.h"
#include "http_client.h"
#include "wifi_manager.h"
#include "wifi_provisioning.h"
#include "led_status.h"

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "esp_log.h"
#include "nvs_flash.h"
#include "nvs.h"

// ── Queue handles ─────────────────────────────────────────────────────────────
static QueueHandle_t queue_power_data     = NULL;  // PZEM read → anomaly detect
static QueueHandle_t queue_anomaly_events = NULL;  // anomaly detect → relay
static QueueHandle_t queue_http_events    = NULL;  // anomaly detect → http
static QueueHandle_t queue_http_power     = NULL;  // PZEM read → http

// ─────────────────────────────────────────────────────────────────────────────
// Task 1: PZEM Read (highest priority)
// Reads PZEM-004T every PZEM_READ_INTERVAL_MS and fans out to queues
// ─────────────────────────────────────────────────────────────────────────────
static void task_pzem_read(void *pvParam)
{
    pzem_data_t data;
    TickType_t  last_wake  = xTaskGetTickCount();
    uint32_t    read_count = 0;

    ESP_LOGI(TAG_MAIN, "task_pzem_read started");
    // Give PZEM-004T time to boot its measurement IC after AC is applied.
    // Without this, the first 1-2 reads often return garbage or time out.
    vTaskDelay(pdMS_TO_TICKS(2000));

    while (1) {
        esp_err_t err = pzem_sensor_read(&data);

        if (err == ESP_OK && data.valid) {
            read_count++;

            // Always overwrite so anomaly task sees the latest reading
            xQueueOverwrite(queue_power_data, &data);

            // POST power data every HTTP_POWER_INTERVAL reads (~10 s)
            if (read_count % HTTP_POWER_INTERVAL == 0) {
                xQueueSend(queue_http_power, &data, 0);
            }

            log_power_data(&data);
        } else {
            LOG_WARN(TAG_MAIN, "PZEM read failed (%s)", esp_err_to_name(err));
        }

        vTaskDelayUntil(&last_wake, pdMS_TO_TICKS(PZEM_READ_INTERVAL_MS));
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Task 2: Anomaly Detection
// Watches power data queue and checks all anomaly conditions
// ─────────────────────────────────────────────────────────────────────────────
static void task_anomaly_detection(void *pvParam)
{
    pzem_data_t     data;
    anomaly_event_t event;

    ESP_LOGI(TAG_MAIN, "task_anomaly_detection started");

    while (1) {
        if (xQueueReceive(queue_power_data, &data, pdMS_TO_TICKS(2000)) == pdTRUE) {
            if (anomaly_analyze(&data, &event)) {
                log_anomaly_event(&event);
                xQueueSend(queue_anomaly_events, &event, pdMS_TO_TICKS(50));
                xQueueSend(queue_http_events,    &event, pdMS_TO_TICKS(50));
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Task 3: Relay Control
// Executes emergency cutoff on critical anomalies
// ─────────────────────────────────────────────────────────────────────────────
static void task_relay_control(void *pvParam)
{
    anomaly_event_t event;

    ESP_LOGI(TAG_MAIN, "task_relay_control started");

    while (1) {
        if (xQueueReceive(queue_anomaly_events, &event, portMAX_DELAY) == pdTRUE) {
            switch (event.type) {
                case ANOMALY_SHORT_CIRCUIT:
                case ANOMALY_OVERCURRENT:
                case ANOMALY_WIRE_FIRE:
                    relay_emergency_cutoff(event.type);
                    break;

                case ANOMALY_OVERVOLTAGE:
                case ANOMALY_UNDERVOLTAGE:
                    // Voltage anomalies: log only, relay unchanged
                    LOG_WARN(TAG_MAIN, "Voltage anomaly: %s (%.1fV)",
                             anomaly_type_to_string(event.type), event.v_rms);
                    break;

                default:
                    break;
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Task 4: WiFi Manager
// Maintains connectivity; falls back to provisioning AP on repeated failure.
// Opens the local dashboard server immediately after every successful connect.
// ─────────────────────────────────────────────────────────────────────────────
static void task_wifi_manager(void *pvParam)
{
    ESP_LOGI(TAG_MAIN, "task_wifi_manager started");

    bool sta_server_running = false;
    bool in_provisioning    = false;  // true while AP mode is active

    esp_err_t err = wifi_connect();
    if (err == ESP_OK) {
        ESP_LOGI(TAG_MAIN, "Connected — local dashboard: http://%s", wifi_get_ip());
        wifi_provisioning_start_sta_server();
        sta_server_running = true;
    } else {
        LOG_WARN(TAG_MAIN, "WiFi connect failed — starting provisioning AP");
        wifi_start_provisioning_mode();
        in_provisioning = true;
    }

    while (1) {
        vTaskDelay(pdMS_TO_TICKS(WIFI_RECONNECT_MS));

        if (in_provisioning) {
            // Stay in AP mode until the user submits credentials.
            // NEVER call wifi_connect() here — the AP is still running and
            // calling esp_wifi_start() on top of it would crash the device.
            if (wifi_provisioning_get_state() == PROV_STATE_CREDENTIALS_RECEIVED) {
                ESP_LOGI(TAG_MAIN, "Credentials received — switching to STA mode");
                wifi_provisioning_stop_ap();   // stops AP + DNS task
                in_provisioning    = false;
                sta_server_running = false;

                err = wifi_connect();
                if (err == ESP_OK) {
                    ESP_LOGI(TAG_MAIN, "Connected — dashboard: http://%s", wifi_get_ip());
                    wifi_provisioning_start_sta_server();
                    sta_server_running = true;
                } else {
                    LOG_WARN(TAG_MAIN, "Post-provision connect failed — back to AP");
                    wifi_start_provisioning_mode();
                    in_provisioning = true;
                }
            }
            continue;  // Skip STA reconnect logic while in AP mode
        }

        // STA mode: reconnect if connection was lost
        if (!wifi_is_connected()) {
            LOG_WARN(TAG_MAIN, "WiFi lost — reconnecting...");
            err = wifi_connect();
            if (err == ESP_OK) {
                LOG_INFO(TAG_MAIN, "Reconnected — IP: %s", wifi_get_ip());
                if (!sta_server_running) {
                    wifi_provisioning_start_sta_server();
                    sta_server_running = true;
                }
            } else {
                LOG_WARN(TAG_MAIN, "Reconnect failed — will retry in %d s",
                         WIFI_RECONNECT_MS / 1000);
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Task 5: HTTP Client (lowest priority)
// Anomaly events are sent immediately; power data batched every 10 reads.
// Also polls the server every 5 seconds for pending relay commands.
// ─────────────────────────────────────────────────────────────────────────────
static void task_http_client(void *pvParam)
{
    anomaly_event_t event;
    pzem_data_t     power;
    uint32_t        last_relay_poll_ms = 0;

    ESP_LOGI(TAG_MAIN, "task_http_client started");

    while (1) {
        // Priority: flush anomaly events first (non-blocking check)
        if (xQueueReceive(queue_http_events, &event, 0) == pdTRUE) {
            http_post_anomaly_event(&event);
        }

        // Then try power data (100 ms wait allows anomaly events to arrive)
        if (xQueueReceive(queue_http_power, &power, pdMS_TO_TICKS(100)) == pdTRUE) {
            http_post_power_data(&power);
        }

        // Poll server for relay commands every 5 seconds
        uint32_t now_ms = xTaskGetTickCount() * portTICK_PERIOD_MS;
        if ((now_ms - last_relay_poll_ms) >= 5000 && wifi_is_connected()) {
            last_relay_poll_ms = now_ms;

            int  cmd_id  = -1;
            char cmd[16] = {0};

            if (http_poll_relay_command(&cmd_id, cmd, sizeof(cmd)) == ESP_OK && cmd_id >= 0) {
                ESP_LOGI(TAG_MAIN, "Server relay command: %s (id=%d)", cmd, cmd_id);

                esp_err_t relay_err = ESP_OK;
                if (strcmp(cmd, "on") == 0) {
                    relay_err = relay_set_state(RELAY_STATE_ON);
                } else if (strcmp(cmd, "off") == 0) {
                    relay_err = relay_set_state(RELAY_STATE_OFF);
                } else if (strcmp(cmd, "reset") == 0) {
                    relay_err = relay_set_state(RELAY_STATE_OFF);
                    if (relay_err == ESP_OK) anomaly_detector_reset();
                }

                // ACK with resulting relay state
                relay_state_t rs    = relay_get_state();
                const char   *rs_str = (rs == RELAY_STATE_ON)     ? "on"      :
                                       (rs == RELAY_STATE_TRIPPED) ? "tripped" : "off";
                http_ack_relay_command(cmd_id, rs_str);
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// app_main
// ─────────────────────────────────────────────────────────────────────────────
void app_main(void)
{
    ESP_LOGI(TAG_MAIN, "BlueWatt v1.0 — PZEM-004T v3.0 + SLA-05VDC-SL-C");
    ESP_LOGI(TAG_MAIN, "Server: %s", HTTP_SERVER_URL);

    // ── NVS flash ──────────────────────────────────────────────────────────
    esp_err_t nvs_err = nvs_flash_init();
    if (nvs_err == ESP_ERR_NVS_NO_FREE_PAGES || nvs_err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_LOGW(TAG_MAIN, "NVS issue — erasing");
        ESP_ERROR_CHECK(nvs_flash_erase());
        nvs_err = nvs_flash_init();
    }
    ESP_ERROR_CHECK(nvs_err);

    // ── Module init ────────────────────────────────────────────────────────
    led_status_init();
    ESP_ERROR_CHECK(pzem_sensor_init());
    ESP_ERROR_CHECK(relay_init());
    anomaly_detector_init();
    http_client_init();
    ESP_ERROR_CHECK(wifi_init());

    // ── Queues ─────────────────────────────────────────────────────────────
    queue_power_data     = xQueueCreate(1,                         sizeof(pzem_data_t));
    queue_anomaly_events = xQueueCreate(QUEUE_ANOMALY_EVENTS_SIZE, sizeof(anomaly_event_t));
    queue_http_events    = xQueueCreate(QUEUE_HTTP_EVENTS_SIZE,    sizeof(anomaly_event_t));
    queue_http_power     = xQueueCreate(QUEUE_HTTP_POWER_SIZE,     sizeof(pzem_data_t));

    if (!queue_power_data || !queue_anomaly_events ||
        !queue_http_events || !queue_http_power) {
        ESP_LOGE(TAG_MAIN, "Queue creation failed — halting");
        while (1) vTaskDelay(portMAX_DELAY);
    }

    // ── Tasks ──────────────────────────────────────────────────────────────
    xTaskCreate(task_pzem_read,         "pzem_read",  TASK_STACK_PZEM_READ,
                NULL, TASK_PRIORITY_PZEM_READ, NULL);

    xTaskCreate(task_anomaly_detection, "anomaly_det", TASK_STACK_ANOMALY,
                NULL, TASK_PRIORITY_ANOMALY,   NULL);

    xTaskCreate(task_relay_control,     "relay_ctrl",  TASK_STACK_RELAY,
                NULL, TASK_PRIORITY_RELAY,     NULL);

    xTaskCreate(task_wifi_manager,      "wifi_mgr",    TASK_STACK_WIFI,
                NULL, TASK_PRIORITY_WIFI,      NULL);

    xTaskCreate(task_http_client,       "http_client", TASK_STACK_HTTP,
                NULL, TASK_PRIORITY_HTTP,      NULL);

    ESP_LOGI(TAG_MAIN, "All 5 tasks running");

    // ── Watchdog heartbeat ─────────────────────────────────────────────────
    while (1) {
        vTaskDelay(pdMS_TO_TICKS(60000));
        ESP_LOGI(TAG_MAIN, "Uptime=%lus  Trips=%lu  WiFi=%s",
                 (unsigned long)(xTaskGetTickCount() * portTICK_PERIOD_MS / 1000),
                 (unsigned long)relay_get_trip_count(),
                 wifi_is_connected() ? wifi_get_ip() : "disconnected");
    }
}
