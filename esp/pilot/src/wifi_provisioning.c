#include "wifi_provisioning.h"
#include "logger.h"
#include "config.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_http_server.h"
#include "nvs_flash.h"
#include "nvs.h"
#include <string.h>

static const char* TAG_PROV = "PROV";
static httpd_handle_t provisioning_server = NULL;
static provisioning_state_t current_state = PROV_STATE_IDLE;

// HTML page for WiFi configuration
static const char provisioning_html[] =
"<!DOCTYPE html>"
"<html>"
"<head>"
"<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
"<title>BlueWatt WiFi Setup</title>"
"<style>"
"body{font-family:Arial,sans-serif;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);margin:0;padding:20px;display:flex;justify-content:center;align-items:center;min-height:100vh}"
".container{background:white;border-radius:15px;box-shadow:0 10px 40px rgba(0,0,0,0.2);padding:40px;max-width:400px;width:100%}"
"h1{color:#667eea;text-align:center;margin-bottom:10px;font-size:28px}"
".subtitle{text-align:center;color:#666;margin-bottom:30px;font-size:14px}"
".form-group{margin-bottom:20px}"
"label{display:block;margin-bottom:8px;color:#333;font-weight:600;font-size:14px}"
"input{width:100%;padding:12px;border:2px solid #e0e0e0;border-radius:8px;font-size:16px;transition:border-color 0.3s;box-sizing:border-box}"
"input:focus{outline:none;border-color:#667eea}"
"button{width:100%;padding:14px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;transition:transform 0.2s,box-shadow 0.2s}"
"button:hover{transform:translateY(-2px);box-shadow:0 5px 15px rgba(102,126,234,0.4)}"
"button:active{transform:translateY(0)}"
".status{margin-top:20px;padding:12px;border-radius:8px;text-align:center;display:none;font-size:14px}"
".status.success{background:#d4edda;color:#155724;display:block}"
".status.error{background:#f8d7da;color:#721c24;display:block}"
".icon{text-align:center;font-size:48px;margin-bottom:20px}"
"</style>"
"</head>"
"<body>"
"<div class=\"container\">"
"<div class=\"icon\">&#x26A1;</div>"
"<h1>BlueWatt Setup</h1>"
"<p class=\"subtitle\">Configure WiFi Connection</p>"
"<form id=\"wifiForm\">"
"<div class=\"form-group\">"
"<label for=\"ssid\">WiFi Network Name (SSID)</label>"
"<input type=\"text\" id=\"ssid\" name=\"ssid\" placeholder=\"Enter WiFi name\" required>"
"</div>"
"<div class=\"form-group\">"
"<label for=\"password\">WiFi Password</label>"
"<input type=\"password\" id=\"password\" name=\"password\" placeholder=\"Enter password\" required>"
"</div>"
"<button type=\"submit\">Connect to WiFi</button>"
"</form>"
"<div id=\"status\" class=\"status\"></div>"
"</div>"
"<script>"
"document.getElementById('wifiForm').addEventListener('submit',function(e){"
"e.preventDefault();"
"var ssid=document.getElementById('ssid').value;"
"var password=document.getElementById('password').value;"
"var status=document.getElementById('status');"
"status.className='status';"
"status.textContent='Connecting...';"
"status.classList.add('success');"
"fetch('/wifi',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},"
"body:'ssid='+encodeURIComponent(ssid)+'&password='+encodeURIComponent(password)})"
".then(response=>response.json())"
".then(data=>{"
"if(data.success){"
"status.className='status success';"
"status.textContent='Connected! Device will restart...';"
"setTimeout(function(){window.location.href='/';},3000);"
"}else{"
"status.className='status error';"
"status.textContent='Connection failed: '+data.message;"
"}"
"})"
".catch(error=>{"
"status.className='status error';"
"status.textContent='Error: '+error.message;"
"});"
"});"
"</script>"
"</body>"
"</html>";

// HTTP GET handler for the provisioning page
static esp_err_t provisioning_page_handler(httpd_req_t *req) {
    httpd_resp_set_type(req, "text/html");
    httpd_resp_send(req, provisioning_html, strlen(provisioning_html));
    return ESP_OK;
}

// HTTP POST handler for WiFi credentials
static esp_err_t wifi_credentials_handler(httpd_req_t *req) {
    char buf[256];
    int ret, remaining = req->content_len;

    if (remaining >= sizeof(buf)) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Content too long");
        return ESP_FAIL;
    }

    ret = httpd_req_recv(req, buf, remaining);
    if (ret <= 0) {
        if (ret == HTTPD_SOCK_ERR_TIMEOUT) {
            httpd_resp_send_err(req, HTTPD_408_REQ_TIMEOUT, "Request timeout");
        }
        return ESP_FAIL;
    }

    buf[ret] = '\0';

    // Parse SSID and password from form data
    char ssid[64] = {0};
    char password[64] = {0};

    char *ssid_start = strstr(buf, "ssid=");
    char *pass_start = strstr(buf, "password=");

    if (ssid_start && pass_start) {
        ssid_start += 5; // Skip "ssid="
        char *ssid_end = strchr(ssid_start, '&');
        if (ssid_end) {
            int ssid_len = ssid_end - ssid_start;
            if (ssid_len > 0 && ssid_len < 64) {
                strncpy(ssid, ssid_start, ssid_len);
                ssid[ssid_len] = '\0';

                // URL decode SSID
                int j = 0;
                for (int i = 0; i < ssid_len; i++) {
                    if (ssid[i] == '+') {
                        ssid[j++] = ' ';
                    } else if (ssid[i] == '%' && i + 2 < ssid_len) {
                        char hex[3] = {ssid[i+1], ssid[i+2], '\0'};
                        ssid[j++] = (char)strtol(hex, NULL, 16);
                        i += 2;
                    } else {
                        ssid[j++] = ssid[i];
                    }
                }
                ssid[j] = '\0';
            }
        }

        pass_start += 9; // Skip "password="
        int pass_len = strlen(pass_start);
        if (pass_len > 0 && pass_len < 64) {
            strncpy(password, pass_start, pass_len);
            password[pass_len] = '\0';

            // URL decode password
            int j = 0;
            for (int i = 0; i < pass_len; i++) {
                if (password[i] == '+') {
                    password[j++] = ' ';
                } else if (password[i] == '%' && i + 2 < pass_len) {
                    char hex[3] = {password[i+1], password[i+2], '\0'};
                    password[j++] = (char)strtol(hex, NULL, 16);
                    i += 2;
                } else {
                    password[j++] = password[i];
                }
            }
            password[j] = '\0';
        }
    }

    LOG_INFO(TAG_PROV, "Received credentials - SSID: %s", ssid);

    // Save credentials
    esp_err_t err = wifi_provisioning_save_credentials(ssid, password);

    // Send JSON response
    char response[128];
    if (err == ESP_OK) {
        current_state = PROV_STATE_CREDENTIALS_RECEIVED;
        snprintf(response, sizeof(response), "{\"success\":true,\"message\":\"Credentials saved\"}");
    } else {
        snprintf(response, sizeof(response), "{\"success\":false,\"message\":\"Failed to save credentials\"}");
    }

    httpd_resp_set_type(req, "application/json");
    httpd_resp_send(req, response, strlen(response));

    return ESP_OK;
}

// Start HTTP server for provisioning
static esp_err_t start_provisioning_server(void) {
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.server_port = 80;
    config.max_uri_handlers = 8;
    config.lru_purge_enable = true;

    if (httpd_start(&provisioning_server, &config) == ESP_OK) {
        httpd_uri_t root_uri = {
            .uri = "/",
            .method = HTTP_GET,
            .handler = provisioning_page_handler,
            .user_ctx = NULL
        };
        httpd_register_uri_handler(provisioning_server, &root_uri);

        httpd_uri_t wifi_uri = {
            .uri = "/wifi",
            .method = HTTP_POST,
            .handler = wifi_credentials_handler,
            .user_ctx = NULL
        };
        httpd_register_uri_handler(provisioning_server, &wifi_uri);

        LOG_INFO(TAG_PROV, "Provisioning HTTP server started");
        return ESP_OK;
    }

    LOG_ERROR(TAG_PROV, "Failed to start HTTP server");
    return ESP_FAIL;
}

esp_err_t wifi_provisioning_init(void) {
    LOG_INFO(TAG_PROV, "Initializing WiFi provisioning");

    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }

    return ret;
}

esp_err_t wifi_provisioning_start_ap(void) {
    LOG_INFO(TAG_PROV, "Starting provisioning AP mode");

    wifi_config_t wifi_config = {
        .ap = {
            .ssid = PROVISIONING_AP_SSID,
            .ssid_len = strlen(PROVISIONING_AP_SSID),
            .channel = PROVISIONING_AP_CHANNEL,
            .password = PROVISIONING_AP_PASSWORD,
            .max_connection = PROVISIONING_AP_MAX_CONNECTIONS,
            .authmode = WIFI_AUTH_WPA2_PSK
        },
    };

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_AP));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_start());

    current_state = PROV_STATE_AP_STARTED;

    // Start HTTP server for captive portal
    start_provisioning_server();

    LOG_INFO(TAG_PROV, "AP started - SSID: %s, Password: %s",
             PROVISIONING_AP_SSID, PROVISIONING_AP_PASSWORD);

    return ESP_OK;
}

esp_err_t wifi_provisioning_stop_ap(void) {
    LOG_INFO(TAG_PROV, "Stopping provisioning AP mode");

    if (provisioning_server) {
        httpd_stop(provisioning_server);
        provisioning_server = NULL;
    }

    esp_wifi_stop();
    current_state = PROV_STATE_IDLE;

    return ESP_OK;
}

esp_err_t wifi_provisioning_save_credentials(const char *ssid, const char *password) {
    nvs_handle_t nvs_handle;
    esp_err_t err;

    err = nvs_open(NVS_WIFI_NAMESPACE, NVS_READWRITE, &nvs_handle);
    if (err != ESP_OK) {
        LOG_ERROR(TAG_PROV, "Failed to open NVS: %s", esp_err_to_name(err));
        return err;
    }

    err = nvs_set_str(nvs_handle, NVS_WIFI_SSID_KEY, ssid);
    if (err != ESP_OK) {
        nvs_close(nvs_handle);
        return err;
    }

    err = nvs_set_str(nvs_handle, NVS_WIFI_PASSWORD_KEY, password);
    if (err != ESP_OK) {
        nvs_close(nvs_handle);
        return err;
    }

    err = nvs_set_u8(nvs_handle, NVS_WIFI_CONFIGURED_KEY, 1);
    if (err != ESP_OK) {
        nvs_close(nvs_handle);
        return err;
    }

    err = nvs_commit(nvs_handle);
    nvs_close(nvs_handle);

    LOG_INFO(TAG_PROV, "WiFi credentials saved");
    return err;
}

esp_err_t wifi_provisioning_load_credentials(char *ssid, size_t ssid_len,
                                              char *password, size_t password_len) {
    nvs_handle_t nvs_handle;
    esp_err_t err;

    err = nvs_open(NVS_WIFI_NAMESPACE, NVS_READONLY, &nvs_handle);
    if (err != ESP_OK) {
        return err;
    }

    err = nvs_get_str(nvs_handle, NVS_WIFI_SSID_KEY, ssid, &ssid_len);
    if (err != ESP_OK) {
        nvs_close(nvs_handle);
        return err;
    }

    err = nvs_get_str(nvs_handle, NVS_WIFI_PASSWORD_KEY, password, &password_len);
    nvs_close(nvs_handle);

    return err;
}

bool wifi_provisioning_is_configured(void) {
    nvs_handle_t nvs_handle;
    esp_err_t err;
    uint8_t configured = 0;

    err = nvs_open(NVS_WIFI_NAMESPACE, NVS_READONLY, &nvs_handle);
    if (err != ESP_OK) {
        return false;
    }

    err = nvs_get_u8(nvs_handle, NVS_WIFI_CONFIGURED_KEY, &configured);
    nvs_close(nvs_handle);

    return (err == ESP_OK && configured == 1);
}

esp_err_t wifi_provisioning_clear_credentials(void) {
    nvs_handle_t nvs_handle;
    esp_err_t err;

    err = nvs_open(NVS_WIFI_NAMESPACE, NVS_READWRITE, &nvs_handle);
    if (err != ESP_OK) {
        return err;
    }

    nvs_erase_all(nvs_handle);
    err = nvs_commit(nvs_handle);
    nvs_close(nvs_handle);

    LOG_INFO(TAG_PROV, "WiFi credentials cleared");
    return err;
}

provisioning_state_t wifi_provisioning_get_state(void) {
    return current_state;
}
