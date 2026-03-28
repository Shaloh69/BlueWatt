#include "logger.h"
#include "relay_control.h"
#include "esp_log.h"

void log_power_data(const pzem_data_t *data)
{
    if (!data || !data->valid) return;
    ESP_LOGI(TAG_PZEM,
             "V=%.1fV  I=%.3fA  P=%.1fW  S=%.1fVA  PF=%.2f  E=%.0fWh  F=%.1fHz",
             data->v_rms,
             data->i_rms,
             data->power,
             data->power_apparent,
             data->power_factor,
             data->energy,
             data->frequency);
}

void log_anomaly_event(const anomaly_event_t *event)
{
    if (!event) return;
    ESP_LOGE(TAG_ANOMALY,
             "!!! ANOMALY: %-15s  I=%.2fA  V=%.1fV  P=%.1fW  Relay=%s  t=%lums",
             anomaly_type_to_string(event->type),
             event->i_rms,
             event->v_rms,
             event->power,
             event->relay_triggered ? "TRIPPED" : "ok",
             (unsigned long)event->timestamp);
}
