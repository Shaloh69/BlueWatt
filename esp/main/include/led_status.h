#pragma once

#include <stdbool.h>

// ============================================================
// LED Status — GPIO2 (built-in LED)
//
// Blink pattern (repeating ~2-second cycle):
//   Both WiFi + Server connected : 2 blinks  ← fully operational
//   WiFi only                    : 1 blink
//   Server only (edge case)      : 2 blinks fast (unlikely)
//   Nothing connected            : solid on
// ============================================================

// Call once in app_main before creating tasks.
void led_status_init(void);

// Call from http_client whenever server reachability changes.
void led_status_set_server(bool connected);
