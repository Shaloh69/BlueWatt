#include "pzem_sensor.h"
#include "config.h"
#include "logger.h"

#include "driver/uart.h"
#include "driver/gpio.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"

#include <string.h>
#include <math.h>

// Cached last successful reading (thread-safe via mutex)
static pzem_data_t       s_last_reading = {.valid = false};
static SemaphoreHandle_t s_last_mutex   = NULL;
static uint8_t           s_pzem_addr    = PZEM_DEVICE_ADDR;

// Modbus RTU constants
#define PZEM_FUNC_READ_INPUT    0x04
#define PZEM_REG_START          0x0000
#define PZEM_REG_COUNT          0x000A  // 10 registers
#define PZEM_RESPONSE_LEN       25      // addr + func + bytecount + 20 data + 2 CRC
#define PZEM_RESET_FUNC         0x42
#define PZEM_RESET_LEN          4       // request + CRC

// Probe order for modules that may respond on different default addresses.
#define PZEM_ADDR_FALLBACK_1    0xF8
#define PZEM_ADDR_FALLBACK_2    0x01

static esp_err_t pzem_sensor_read_with_addr(uint8_t addr, pzem_data_t *out);
static esp_err_t pzem_reset_energy_with_addr(uint8_t addr);

// CRC16 Modbus (polynomial 0xA001)
static uint16_t crc16(const uint8_t *data, uint16_t len)
{
    uint16_t crc = 0xFFFF;
    for (uint16_t i = 0; i < len; i++) {
        crc ^= data[i];
        for (uint8_t j = 0; j < 8; j++) {
            if (crc & 0x0001) {
                crc = (crc >> 1) ^ 0xA001;
            } else {
                crc >>= 1;
            }
        }
    }
    return crc;
}

esp_err_t pzem_sensor_init(void)
{
    s_last_mutex = xSemaphoreCreateMutex();
    if (!s_last_mutex) {
        ESP_LOGE(TAG_PZEM, "Failed to create PZEM cache mutex");
        return ESP_ERR_NO_MEM;
    }

    uart_config_t uart_cfg = {
        .baud_rate  = PZEM_BAUD_RATE,
        .data_bits  = UART_DATA_8_BITS,
        .parity     = UART_PARITY_DISABLE,
        .stop_bits  = UART_STOP_BITS_1,
        .flow_ctrl  = UART_HW_FLOWCTRL_DISABLE,
        .source_clk = UART_SCLK_DEFAULT,
    };

    esp_err_t err = uart_driver_install(PZEM_UART_NUM, PZEM_UART_BUF_SIZE * 2,
                                        PZEM_UART_BUF_SIZE * 2, 0, NULL, 0);
    if (err != ESP_OK) {
        ESP_LOGE(TAG_PZEM, "UART driver install failed: %s", esp_err_to_name(err));
        return err;
    }

    err = uart_param_config(PZEM_UART_NUM, &uart_cfg);
    if (err != ESP_OK) {
        ESP_LOGE(TAG_PZEM, "UART param config failed: %s", esp_err_to_name(err));
        return err;
    }

    // Physical wiring in this project is RX->RX and TX->TX.
    // We map UART pins so ESP TX still drives the PZEM RX path and vice versa.
    err = uart_set_pin(PZEM_UART_NUM, PZEM_TX_PIN, PZEM_RX_PIN,
                       UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE);
    if (err != ESP_OK) {
        ESP_LOGE(TAG_PZEM, "UART set pins failed: %s", esp_err_to_name(err));
        return err;
    }

    // The PZEM-004T RX optocoupler is biased from 5V — a push-pull 3.3V HIGH
    // lets ~0.5 mA leak through the optocoupler LED, garbling every byte.
    // Open-drain + internal 45 kΩ pull-up to 3.3V limits HIGH-state current
    // to ~10 µA (well below activation threshold), so the optocoupler fully
    // turns off between bits — no external resistor required.
    // gpio_set_direction only changes the pad drive mode; it does NOT disturb
    // the GPIO-matrix routing that uart_set_pin configured.
    gpio_set_direction(PZEM_TX_PIN, GPIO_MODE_OUTPUT_OD);
    gpio_pullup_en(PZEM_TX_PIN);

    s_pzem_addr = PZEM_DEVICE_ADDR;
    ESP_LOGI(TAG_PZEM, "PZEM initialized on UART%d (TX=GPIO%d RX=GPIO%d, addr=0x%02X)",
             PZEM_UART_NUM, PZEM_TX_PIN, PZEM_RX_PIN, s_pzem_addr);
    return ESP_OK;
}

esp_err_t pzem_sensor_read(pzem_data_t *out)
{
    if (!out) return ESP_ERR_INVALID_ARG;
    out->valid = false;

    const uint8_t probe_addrs[] = {s_pzem_addr, PZEM_ADDR_FALLBACK_1, PZEM_ADDR_FALLBACK_2};
    esp_err_t last_err = ESP_FAIL;

    for (size_t i = 0; i < sizeof(probe_addrs); i++) {
        uint8_t addr = probe_addrs[i];
        bool duplicate = false;

        for (size_t j = 0; j < i; j++) {
            if (probe_addrs[j] == addr) {
                duplicate = true;
                break;
            }
        }
        if (duplicate) continue;

        esp_err_t err = pzem_sensor_read_with_addr(addr, out);
        if (err == ESP_OK) {
            if (s_pzem_addr != addr) {
                ESP_LOGI(TAG_PZEM, "PZEM address detected: 0x%02X (previous 0x%02X)",
                         addr, s_pzem_addr);
            }
            s_pzem_addr = addr;
            return ESP_OK;
        }

        last_err = err;
    }

    return last_err;
}

static esp_err_t pzem_sensor_read_with_addr(uint8_t addr, pzem_data_t *out)
{
    // Build Modbus RTU read-input-registers request
    uint8_t request[8];
    request[0] = addr;
    request[1] = PZEM_FUNC_READ_INPUT;
    request[2] = (PZEM_REG_START >> 8) & 0xFF;
    request[3] = PZEM_REG_START & 0xFF;
    request[4] = (PZEM_REG_COUNT >> 8) & 0xFF;
    request[5] = PZEM_REG_COUNT & 0xFF;
    uint16_t crc = crc16(request, 6);
    request[6] = crc & 0xFF;          // CRC LSB first (Modbus)
    request[7] = (crc >> 8) & 0xFF;

    uint8_t response[PZEM_RESPONSE_LEN];
    esp_err_t last_err = ESP_FAIL;

    // 3-attempt retry loop — standard Modbus RTU practice
    for (int attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) {
            vTaskDelay(pdMS_TO_TICKS(100));  // brief recovery gap before retry
        }

        // Clear only the RX buffer (uart_flush_input, not the deprecated uart_flush
        // which also clears TX and can cancel bytes still in the FIFO)
        uart_flush_input(PZEM_UART_NUM);

        int written = uart_write_bytes(PZEM_UART_NUM, (const char *)request, sizeof(request));
        if (written != (int)sizeof(request)) {
            ESP_LOGW(TAG_PZEM, "UART write incomplete for 0x%02X (%d/%d) attempt %d",
                     addr, written, (int)sizeof(request), attempt + 1);
            last_err = ESP_FAIL;
            continue;
        }

        // Ensure all request bytes have left the FIFO before we start reading
        uart_wait_tx_done(PZEM_UART_NUM, pdMS_TO_TICKS(50));

        // Wait for response
        int received = uart_read_bytes(PZEM_UART_NUM, response, PZEM_RESPONSE_LEN,
                                       pdMS_TO_TICKS(PZEM_READ_TIMEOUT_MS));

        if (received < PZEM_RESPONSE_LEN) {
            ESP_LOGW(TAG_PZEM, "UART timeout/short read for 0x%02X (%d/%d bytes) attempt %d",
                     addr, received, PZEM_RESPONSE_LEN, attempt + 1);
            uart_flush_input(PZEM_UART_NUM);  // discard partial frame
            last_err = ESP_ERR_TIMEOUT;
            continue;
        }

        // Validate CRC (last 2 bytes, LSB first)
        uint16_t recv_crc = (uint16_t)response[PZEM_RESPONSE_LEN - 1] << 8 |
                            (uint16_t)response[PZEM_RESPONSE_LEN - 2];
        uint16_t calc_crc = crc16(response, PZEM_RESPONSE_LEN - 2);
        if (recv_crc != calc_crc) {
            ESP_LOGW(TAG_PZEM, "CRC mismatch for 0x%02X: recv=0x%04X calc=0x%04X attempt %d",
                     addr, recv_crc, calc_crc, attempt + 1);
            uart_flush_input(PZEM_UART_NUM);  // discard corrupted frame
            last_err = ESP_FAIL;
            continue;
        }

        // Validate address, function code, and byte count.
        if (response[0] != addr || response[1] != PZEM_FUNC_READ_INPUT ||
            response[2] != (PZEM_REG_COUNT * 2)) {
            ESP_LOGW(TAG_PZEM, "Unexpected header for 0x%02X: addr=0x%02X func=0x%02X bytes=%u attempt %d",
                     addr, response[0], response[1], (unsigned)response[2], attempt + 1);
            uart_flush_input(PZEM_UART_NUM);
            last_err = ESP_FAIL;
            continue;
        }

        // All checks passed — fall through to parse below
        last_err = ESP_OK;
        break;
    }

    if (last_err != ESP_OK) {
        return last_err;
    }

    // Parse register values (big-endian, starting at byte 3)
    uint16_t v_raw  = (uint16_t)response[3]  << 8 | response[4];
    uint16_t i_low  = (uint16_t)response[5]  << 8 | response[6];
    uint16_t i_high = (uint16_t)response[7]  << 8 | response[8];
    uint16_t p_low  = (uint16_t)response[9]  << 8 | response[10];
    uint16_t p_high = (uint16_t)response[11] << 8 | response[12];
    uint16_t e_low  = (uint16_t)response[13] << 8 | response[14];
    uint16_t e_high = (uint16_t)response[15] << 8 | response[16];
    uint16_t f_raw  = (uint16_t)response[17] << 8 | response[18];
    uint16_t pf_raw = (uint16_t)response[19] << 8 | response[20];

    uint32_t i_raw = ((uint32_t)i_high << 16) | i_low;
    uint32_t p_raw = ((uint32_t)p_high << 16) | p_low;
    uint32_t e_raw = ((uint32_t)e_high << 16) | e_low;

    out->v_rms          = v_raw  / 10.0f;
    out->i_rms          = i_raw  / 1000.0f;
    out->power          = p_raw  / 10.0f;
    out->energy         = (float)e_raw;          // in Wh
    out->frequency      = f_raw  / 10.0f;
    out->power_factor   = pf_raw / 100.0f;
    out->power_apparent = out->v_rms * out->i_rms;
    out->timestamp      = xTaskGetTickCount() * portTICK_PERIOD_MS;
    out->valid          = true;

    // Cache for web dashboard
    if (s_last_mutex && xSemaphoreTake(s_last_mutex, pdMS_TO_TICKS(10)) == pdTRUE) {
        s_last_reading = *out;
        xSemaphoreGive(s_last_mutex);
    }

    LOG_DEBUG(TAG_PZEM, "addr=0x%02X V=%.1fV I=%.3fA P=%.1fW E=%.0fWh F=%.1fHz PF=%.2f",
              addr, out->v_rms, out->i_rms, out->power,
              out->energy, out->frequency, out->power_factor);

    return ESP_OK;
}

void pzem_sensor_get_last(pzem_data_t *out)
{
    if (!out) return;
    if (s_last_mutex && xSemaphoreTake(s_last_mutex, pdMS_TO_TICKS(20)) == pdTRUE) {
        *out = s_last_reading;
        xSemaphoreGive(s_last_mutex);
    } else {
        out->valid = false;
    }
}

esp_err_t pzem_reset_energy(void)
{
    const uint8_t probe_addrs[] = {s_pzem_addr, PZEM_ADDR_FALLBACK_1, PZEM_ADDR_FALLBACK_2};
    esp_err_t last_err = ESP_FAIL;

    for (size_t i = 0; i < sizeof(probe_addrs); i++) {
        uint8_t addr = probe_addrs[i];
        bool duplicate = false;

        for (size_t j = 0; j < i; j++) {
            if (probe_addrs[j] == addr) {
                duplicate = true;
                break;
            }
        }
        if (duplicate) continue;

        esp_err_t err = pzem_reset_energy_with_addr(addr);
        if (err == ESP_OK) {
            if (s_pzem_addr != addr) {
                ESP_LOGI(TAG_PZEM, "PZEM address detected during reset: 0x%02X", addr);
            }
            s_pzem_addr = addr;
            ESP_LOGI(TAG_PZEM, "Energy accumulator reset (addr=0x%02X)", addr);
            return ESP_OK;
        }

        last_err = err;
    }

    return last_err;
}

static esp_err_t pzem_reset_energy_with_addr(uint8_t addr)
{
    // Reset energy command: addr + 0x42 + CRC
    uint8_t request[PZEM_RESET_LEN];
    request[0] = addr;
    request[1] = PZEM_RESET_FUNC;
    uint16_t crc = crc16(request, 2);
    request[2] = crc & 0xFF;
    request[3] = (crc >> 8) & 0xFF;

    uart_flush_input(PZEM_UART_NUM);
    int written = uart_write_bytes(PZEM_UART_NUM, (const char *)request, sizeof(request));
    if (written != (int)sizeof(request)) {
        ESP_LOGW(TAG_PZEM, "Energy reset write failed for 0x%02X", addr);
        return ESP_FAIL;
    }
    uart_wait_tx_done(PZEM_UART_NUM, pdMS_TO_TICKS(50));

    // Read echo response (4 bytes)
    uint8_t response[PZEM_RESET_LEN];
    int received = uart_read_bytes(PZEM_UART_NUM, response, sizeof(response),
                                   pdMS_TO_TICKS(PZEM_READ_TIMEOUT_MS));
    if (received < PZEM_RESET_LEN) {
        ESP_LOGW(TAG_PZEM, "Energy reset timeout for 0x%02X", addr);
        uart_flush_input(PZEM_UART_NUM);
        return ESP_ERR_TIMEOUT;
    }

    uint16_t recv_crc = (uint16_t)response[PZEM_RESET_LEN - 1] << 8 |
                        (uint16_t)response[PZEM_RESET_LEN - 2];
    uint16_t calc_crc = crc16(response, PZEM_RESET_LEN - 2);
    if (recv_crc != calc_crc) {
        ESP_LOGW(TAG_PZEM, "Energy reset CRC mismatch for 0x%02X", addr);
        return ESP_FAIL;
    }

    if (response[0] != addr || response[1] != PZEM_RESET_FUNC) {
        ESP_LOGW(TAG_PZEM, "Energy reset header mismatch for 0x%02X", addr);
        return ESP_FAIL;
    }

    return ESP_OK;
}
