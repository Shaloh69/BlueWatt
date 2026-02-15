#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "esp_system.h"
#include "nvs_flash.h"

#include "config.h"
#include "logger.h"
#include "adc_sensor.h"
#include "relay_control.h"
#include "power_calc.h"
#include "anomaly_detector.h"
#include "wifi_manager.h"
#include "wifi_provisioning.h"
#include "http_client.h"

// FreeRTOS queues for inter-task communication
static QueueHandle_t queue_power_data;
static QueueHandle_t queue_anomaly_events;
static QueueHandle_t queue_http_events;
static QueueHandle_t queue_http_power;

/**
 * Task 1: High-speed sensor sampling at ~1kHz
 * Reads ADC and stores samples in circular buffer
 */
void task_sensor_sampling(void *pvParameters) {
    LOG_INFO(TAG_SENSOR, "Sensor sampling task started");

    TickType_t xLastWakeTime = xTaskGetTickCount();
    const TickType_t xPeriod = pdMS_TO_TICKS(1);

    sensor_reading_t reading;

    while (1) {
        // Read both sensors
        if (adc_sensor_read(&reading) == ESP_OK) {
            // Store in circular buffer
            sample_buffer_write(reading.current_raw, reading.voltage_raw);
        }

        vTaskDelayUntil(&xLastWakeTime, xPeriod);
    }
}

/**
 * Task 2: Power calculation
 * Every 200ms, compute RMS and power from collected samples
 */
void task_power_calculation(void *pvParameters) {
    LOG_INFO(TAG_POWER, "Power calculation task started");

    int current_samples[TOTAL_SAMPLES];
    int voltage_samples[TOTAL_SAMPLES];
    power_data_t power_data;

    while (1) {
        vTaskDelay(pdMS_TO_TICKS(200));

        uint32_t samples_read = sample_buffer_read(current_samples, voltage_samples, TOTAL_SAMPLES);

        if (samples_read >= TOTAL_SAMPLES) {
            if (power_calc_compute(current_samples, voltage_samples, TOTAL_SAMPLES, &power_data) == ESP_OK) {
                log_power_data(power_data.v_rms, power_data.i_rms, power_data.power_real, power_data.power_factor);
                xQueueSend(queue_power_data, &power_data, 0);
                xQueueSend(queue_http_power, &power_data, 0);
            }
        } else {
            LOG_WARN(TAG_POWER, "Insufficient samples: %lu/%d", samples_read, TOTAL_SAMPLES);
        }
    }
}

/**
 * Task 3: Anomaly detection
 */
void task_anomaly_detection(void *pvParameters) {
    LOG_INFO(TAG_ANOMALY, "Anomaly detection task started");

    power_data_t power_data;
    anomaly_event_t anomaly_event;

    while (1) {
        if (xQueueReceive(queue_power_data, &power_data, portMAX_DELAY) == pdTRUE) {
            if (anomaly_analyze(&power_data, &anomaly_event)) {
                LOG_ERROR(TAG_ANOMALY, "CRITICAL ANOMALY: %s", anomaly_type_to_string(anomaly_event.type));
                xQueueSend(queue_anomaly_events, &anomaly_event, 0);
                xQueueSend(queue_http_events, &anomaly_event, 0);
            }
        }
    }
}

/**
 * Task 4: Relay control
 */
void task_relay_control(void *pvParameters) {
    LOG_INFO(TAG_RELAY, "Relay control task started");

    anomaly_event_t event;

    while (1) {
        if (xQueueReceive(queue_anomaly_events, &event, portMAX_DELAY) == pdTRUE) {
            if (event.type == ANOMALY_SHORT_CIRCUIT || event.type == ANOMALY_OVERCURRENT || event.type == ANOMALY_WIRE_FIRE) {
                relay_emergency_cutoff(event.type);
                event.relay_triggered = true;
                LOG_ERROR(TAG_RELAY, "EMERGENCY CUTOFF ACTIVATED!");
            }
        }
    }
}

/**
 * Task 5: WiFi manager
 */
void task_wifi_manager(void *pvParameters) {
    LOG_INFO(TAG_WIFI, "WiFi manager task started with provisioning support");

    // Try to connect to WiFi
    esp_err_t wifi_result = wifi_connect();

    // If connection fails, start provisioning mode
    if (wifi_result != ESP_OK) {
        LOG_WARN(TAG_WIFI, "Initial WiFi connection failed, starting provisioning mode");
        wifi_start_provisioning_mode();

        // Wait for credentials to be configured
        while (wifi_provisioning_get_state() != PROV_STATE_CREDENTIALS_RECEIVED) {
            vTaskDelay(pdMS_TO_TICKS(1000));
        }

        // Stop AP and try to connect with new credentials
        LOG_INFO(TAG_WIFI, "New credentials received, attempting connection...");
        wifi_provisioning_stop_ap();
        vTaskDelay(pdMS_TO_TICKS(2000));

        wifi_result = wifi_connect();
        if (wifi_result == ESP_OK) {
            LOG_INFO(TAG_WIFI, "Successfully connected with new credentials!");
        } else {
            LOG_ERROR(TAG_WIFI, "Failed to connect with new credentials, restarting provisioning");
            wifi_start_provisioning_mode();
        }
    }

    // Main WiFi monitoring loop
    while (1) {
        if (wifi_get_state() == WIFI_STATE_DISCONNECTED || wifi_get_state() == WIFI_STATE_FAILED) {
            LOG_WARN(TAG_WIFI, "WiFi disconnected, reconnecting...");
            esp_err_t result = wifi_connect();

            // If reconnection fails multiple times, restart provisioning
            if (result != ESP_OK) {
                LOG_ERROR(TAG_WIFI, "Persistent connection failure, starting provisioning mode");
                wifi_start_provisioning_mode();
            }
        }
        vTaskDelay(pdMS_TO_TICKS(WIFI_RECONNECT_MS));
    }
}

/**
 * Task 6: HTTP client
 */
void task_http_client(void *pvParameters) {
    LOG_INFO(TAG_HTTP, "HTTP client task started");

    power_data_t power_data;
    anomaly_event_t anomaly_event;
    uint32_t power_count = 0;

    while (1) {
        if (xQueueReceive(queue_http_events, &anomaly_event, 0) == pdTRUE) {
            if (wifi_is_connected()) {
                http_post_anomaly_event(&anomaly_event);
            }
        }

        if (xQueueReceive(queue_http_power, &power_data, pdMS_TO_TICKS(100)) == pdTRUE) {
            power_count++;
            if (power_count >= 50) {  // Every 10 seconds
                if (wifi_is_connected()) {
                    http_post_power_data(&power_data);
                }
                power_count = 0;
            }
        }
    }
}

void app_main() {
    LOG_INFO(TAG_MAIN, "===========================================");
    LOG_INFO(TAG_MAIN, "  BlueWatt ESP32 Monitoring System - PILOT");
    LOG_INFO(TAG_MAIN, "  Complete Integrated System");
    LOG_INFO(TAG_MAIN, "===========================================");

    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    ESP_ERROR_CHECK(adc_sensor_init());
    ESP_ERROR_CHECK(relay_init());
    ESP_ERROR_CHECK(power_calc_init());
    ESP_ERROR_CHECK(anomaly_detector_init());
    ESP_ERROR_CHECK(wifi_init());
    ESP_ERROR_CHECK(http_client_init());

    queue_power_data = xQueueCreate(QUEUE_SIZE_POWER_DATA, sizeof(power_data_t));
    queue_anomaly_events = xQueueCreate(QUEUE_SIZE_ANOMALIES, sizeof(anomaly_event_t));
    queue_http_events = xQueueCreate(QUEUE_SIZE_HTTP_EVENTS, sizeof(anomaly_event_t));
    queue_http_power = xQueueCreate(QUEUE_SIZE_HTTP_POWER, sizeof(power_data_t));

    LOG_INFO(TAG_MAIN, "Starting tasks...");

    xTaskCreate(task_sensor_sampling, "sensor", STACK_SIZE_SENSOR, NULL, TASK_PRIORITY_SENSOR, NULL);
    xTaskCreate(task_power_calculation, "power", STACK_SIZE_POWER, NULL, TASK_PRIORITY_POWER, NULL);
    xTaskCreate(task_anomaly_detection, "anomaly", STACK_SIZE_ANOMALY, NULL, TASK_PRIORITY_ANOMALY, NULL);
    xTaskCreate(task_relay_control, "relay", STACK_SIZE_RELAY, NULL, TASK_PRIORITY_RELAY, NULL);
    xTaskCreate(task_wifi_manager, "wifi", STACK_SIZE_WIFI, NULL, TASK_PRIORITY_WIFI, NULL);
    xTaskCreate(task_http_client, "http", STACK_SIZE_HTTP, NULL, TASK_PRIORITY_HTTP, NULL);

    LOG_INFO(TAG_MAIN, "System operational!");

    while (1) {
        vTaskDelay(pdMS_TO_TICKS(60000));
        LOG_INFO(TAG_MAIN, "Uptime: %lu sec | Trips: %lu",
                 xTaskGetTickCount() * portTICK_PERIOD_MS / 1000, relay_get_trip_count());
    }
}