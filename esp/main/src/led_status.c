#include "led_status.h"
#include "config.h"
#include "wifi_manager.h"

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"

// ── State ─────────────────────────────────────────────────────────────────────
static volatile bool s_server_connected = false;

void led_status_set_server(bool connected)
{
    s_server_connected = connected;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Blink the LED n times (100 ms on / 100 ms off per blink)
static void blink_n(int n)
{
    for (int i = 0; i < n; i++) {
        gpio_set_level(STATUS_LED_GPIO, 1);
        vTaskDelay(pdMS_TO_TICKS(100));
        gpio_set_level(STATUS_LED_GPIO, 0);
        vTaskDelay(pdMS_TO_TICKS(100));
    }
}

// ── Task ──────────────────────────────────────────────────────────────────────
// Full cycle is ~2 000 ms regardless of blink count:
//   n blinks consume n*200 ms, remainder is held LOW as the pause.

static void led_task(void *pvParam)
{
    while (1) {
        bool wifi_ok   = wifi_is_connected();
        bool server_ok = s_server_connected;

        if (!wifi_ok && !server_ok) {
            // Nothing connected — solid on
            gpio_set_level(STATUS_LED_GPIO, 1);
            vTaskDelay(pdMS_TO_TICKS(2000));

        } else if (wifi_ok && server_ok) {
            // Both connected — 3 blinks
            blink_n(3);
            vTaskDelay(pdMS_TO_TICKS(2000 - 3 * 200));

        } else if (wifi_ok) {
            // WiFi only — 1 blink
            blink_n(1);
            vTaskDelay(pdMS_TO_TICKS(2000 - 1 * 200));

        } else {
            // Server only (edge case) — 2 blinks
            blink_n(2);
            vTaskDelay(pdMS_TO_TICKS(2000 - 2 * 200));
        }
    }
}

// ── Init ──────────────────────────────────────────────────────────────────────
void led_status_init(void)
{
    gpio_config_t io_conf = {
        .pin_bit_mask = (1ULL << STATUS_LED_GPIO),
        .mode         = GPIO_MODE_OUTPUT,
        .pull_up_en   = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type    = GPIO_INTR_DISABLE,
    };
    gpio_config(&io_conf);

    // Start solid — not connected yet
    gpio_set_level(STATUS_LED_GPIO, 1);

    xTaskCreate(led_task, "led_status", 2048, NULL, 1, NULL);
}
