# BlueWatt — Repository Analysis

> Last updated: 2026-06-18 (NTP, ACK retry, auto-rotate key, thresholds corrected)

---

## 1. Project Overview

**BlueWatt** is an IoT-based electrical monitoring and management system designed for boarding houses in the Philippines. The system:

- Monitors real-time electrical consumption per unit via an ESP32 + PZEM-004T power meter
- Detects safety anomalies (overcurrent, short circuits, wire fires) and triggers automatic relay cutoffs
- Manages per-unit billing based on actual energy consumption (daily / weekly / monthly schedules)
- Handles tenant payment submissions with receipt image verification
- Provides a web admin dashboard and a mobile tenant app

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Client Layer                                                │
│  - Next.js web admin dashboard (admin/landlord)             │
│  - Flutter mobile app (tenants)                             │
│  - Real-time updates via SSE                                │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTP/REST API
┌────────────────────▼────────────────────────────────────────┐
│ Application Layer (Node.js/Express/TypeScript)              │
│  - REST API (Express, versioned /api/v1)                    │
│  - Real-time event streaming (Server-Sent Events)           │
│  - Business logic services (billing, aggregation)           │
│  - Background cron jobs                                     │
│  - File storage via Supabase                                │
└────────────────────┬────────────────────────────────────────┘
                     │ TCP/HTTP + MySQL
┌────────────────────▼────────────────────────────────────────┐
│ Data & Device Layer                                         │
│  - MySQL on Aiven cloud (primary database)                  │
│  - ESP32 devices (PZEM-004T via UART, FreeRTOS)             │
│  - Supabase Storage (receipts, QR codes, images)            │
└─────────────────────────────────────────────────────────────┘
```

**ESP32 FreeRTOS Task Architecture:**

| Task | Priority | Function |
|------|----------|----------|
| `task_pzem_read` | 9 | Read PZEM-004T sensor every 1s, fan out to queues |
| `task_anomaly_detection` | 9 | Monitor thresholds, push events to relay + HTTP queues |
| `task_relay_control` | 8 | Execute emergency cutoff on critical anomalies |
| `task_wifi_manager` | 3 | Maintain WiFi connectivity, NTP after connect |
| `task_http_client` | 2 | POST data/events, poll relay commands every 5s |

**Inter-task queues:**

| Queue | Size | From → To |
|-------|------|-----------|
| `queue_power_data` | 1 (overwrite) | PZEM read → Anomaly detection |
| `queue_anomaly_events` | 10 | Anomaly → Relay control |
| `queue_http_events` | 20 | Anomaly → HTTP client |
| `queue_http_power` | 5 | PZEM read → HTTP client |

---

## 3. Directory Structure

```
BlueWatt/
├── server/                         # Node.js/TypeScript backend
│   └── src/
│       ├── app.ts                  # Express setup, middleware, routes
│       ├── config/environment.ts   # Environment variables
│       ├── database/
│       │   ├── connection.ts       # MySQL connection pool
│       │   ├── migrate.ts          # Migration runner
│       │   └── migrations/         # SQL migration files (001–007)
│       ├── controllers/            # HTTP request handlers
│       ├── models/                 # Data access (prepared statements)
│       ├── services/               # Business logic
│       ├── routes/                 # Route definitions
│       ├── middleware/             # Auth, rate-limit, upload, error
│       ├── validators/             # Input validation schemas
│       ├── jobs/index.ts           # Cron jobs
│       └── types/models.ts         # TypeScript interfaces
│
├── client/
│   ├── web_admin/                  # Next.js admin panel
│   │   ├── app/
│   │   │   ├── (auth)/login/       # Login page
│   │   │   ├── (dashboard)/        # Protected dashboard pages
│   │   └── lib/use-api.ts          # SWR hooks (FAST=5s, MEDIUM=8s, SLOW=15s)
│   │
│   └── flutter_app/                # Flutter tenant app (v1.1.1+75)
│
├── esp/
│   ├── main/                       # Production ESP32 firmware
│   │   ├── src/                    # C source files
│   │   ├── include/                # Header files
│   │   └── platformio.ini          # PlatformIO build config
│   └── pilot/                      # Prototype/pilot firmware
│
├── proxy/index.js                  # Express reverse proxy (Render)
├── render.yaml                     # Render deployment config
└── analyzation.md                  # This document
```

---

## 4. ESP32 Firmware (`esp/main/`)

### 4.1 Power Architecture

```
220V AC
    │
[AC-DC Converter]
    │
   5V DC ─────────────────────────────────────────────────────┐
    │                                                          │
    ├──── PZEM-004T VCC (runs at 5V, TX outputs 5V signals)   │
    ├──── Relay Module VCC (coil driven at 5V)                 │
    └──── ESP32 VIN pin                                        │
                │                                              │
          [AMS1117 LDO on ESP32 board]                         │
                │                                              │
              3.3V ── powers ESP32 chip internally             │
                       ALL GPIO pins = 3.3V logic              │
                       regardless of 5V supply ────────────────┘
```

> **KEY FACT:** The ESP32 is powered from 5V but its GPIO pins always operate at 3.3V.
> The PZEM and relay run at 5V. This 5V ↔ 3.3V boundary is where all resistor requirements come from.

### 4.2 Hardware

| Component | Details |
|-----------|---------|
| MCU | ESP32 (5V in via VIN → 3.3V internal via LDO) |
| Power Meter | PZEM-004T v3.0 via UART0 (GPIO1/GPIO3, 9600 baud, Modbus RTU) |
| Relay | SLA-05VDC-SL-C — GPIO14, active-LOW, 30A rated |
| Status LED | GPIO2 |
| Power supply | 220V AC → 5V DC converter |

**PCB Wiring (custom PCB — pins cannot change):**

```
    PZEM TX ──────────────────────────────► GPIO1 (TX0)   TX-to-TX
    PZEM RX ◄──────────────────────────────  GPIO3 (RX0)   RX-to-RX

Status LED
──────────
  GPIO2 (3.3V) → 330Ω → LED → GND
```

> **IMPORTANT:** Wiring is TX→TX and RX→RX (not the conventional crossover).
> This is intentional on this custom PCB. Do not "fix" it to a crossover — it will break communication.

**Required resistors / mods (production-critical):**

| Item | Location | Why |
|------|----------|-----|
| 1kΩ in parallel with R8 on PZEM board | On PZEM PCB near RX optocoupler | GPIO3 outputs 3.3V; stock R8 sized for 5V — low current causes unreliable optocoupler switching |
| 10kΩ + 20kΩ voltage divider on PZEM TX → GPIO1 | PCB trace | PZEM TX outputs 5V; ESP32 GPIO1 max is 3.6V — without divider, GPIO can be damaged |
| 10kΩ pull-up on relay IN to 3.3V | PCB, IN pin to 3.3V rail | GPIO14 glitches during boot; pull-up holds IN HIGH (relay OFF) until firmware runs |
| 100µF + 0.1µF decoupling caps on PZEM VCC | PCB near PZEM VCC pin | WiFi TX causes 5V supply spikes that corrupt PZEM's internal address register |

### 4.3 Firmware Modules

| File | Purpose |
|------|---------|
| `main.c` | FreeRTOS task orchestration and startup |
| `pzem_sensor.c` | PZEM-004T driver — reads voltage, current, power, energy, PF, frequency |
| `anomaly_detector.c` | Threshold-based anomaly detection with confirmation logic |
| `relay_control.c` | Relay state machine — ON/OFF/TRIPPED, 1s cooldown |
| `http_client.c` | JSON POST of readings and anomalies; relay poll and ACK |
| `wifi_provisioning.c` | SoftAP captive portal for WiFi credential setup (stored in NVS) |
| `wifi_manager.c` | WiFi connection, auto-reconnect, NTP init on connect |
| `led_status.c` | Blink pattern driver |
| `logger.c` | Centralized logging |

### 4.4 Anomaly Detection Thresholds

Compliant with **PEC 2017 (Philippine Electrical Code)** / IEC 60038:

| Anomaly | Condition | Threshold | Action |
|---------|-----------|-----------|--------|
| Short Circuit | I_rms spike | > 50A | Immediate relay TRIP |
| Overcurrent | I_rms sustained (3 readings) | > 28A | Relay TRIP |
| Wire Fire | P_real ≥ 1.5× baseline AND P_real > 2100W | Thermal runaway | Relay TRIP |
| Overvoltage | V_rms | > 253V (230V + 10%) | Log only |
| Undervoltage | V_rms | < 207V (230V − 10%) | Log only |

> **Relay state machine:** TRIPPED cannot be overridden by an "on" command — admin must send "reset" first.
> Undervoltage does NOT trip the relay; it logs only.

### 4.5 WiFi Provisioning

On first boot (or when no credentials are in NVS):
1. ESP broadcasts SoftAP: **"PAD 4 Setup"** (password: `bluewatt2024`)
2. User connects and opens `http://192.168.4.1` (captive portal)
3. Submits WiFi SSID + password (optionally server URL / API key)
4. ESP saves to NVS, reboots into STA mode

Once in STA mode the local settings page is accessible at:
- `http://bluewatt.local/` (mDNS)
- `http://<device-ip>/` (direct IP)

**NVS persists across reflash.** Use `pio run -t erase` to clear stale credentials before fresh provisioning.

### 4.6 NVS Stored Values

| Key | Default (config.h) | Purpose |
|-----|--------------------|---------|
| `server_url` | `https://bluewatt-api.onrender.com` | Backend endpoint |
| `api_key` | `bw_fd0fdbbc...` | Device API key |
| `device_id` | `bluewatt-004` | Device serial |
| `wifi_ssid` | `""` | Target AP |
| `wifi_pass` | `""` | AP password |
| `static_ip` | `""` | Optional static IP |

NVS values **override** `config.h` defaults at every boot.

### 4.7 LED Status Codes

| Pattern | Meaning |
|---------|---------|
| Solid ON | No WiFi, no server |
| 1 blink / 2s | WiFi connected, server unreachable |
| 2 blinks / 2s | WiFi + server both connected ✓ |

### 4.8 NTP Time Sync

After WiFi connects, `wifi_manager.c` calls `sntp_init()` pointing to `pool.ntp.org` and `time.cloudflare.com`. `pzem_sensor.c` timestamps readings with `time(NULL)` and falls back to boot-uptime ms if NTP has not yet synced (`now > 1_000_000_000` check).

### 4.9 Relay Command Flow

1. Admin issues command (on / off / reset) via web dashboard
2. Server stores it as `pending` in `relay_commands` (expiry: 3 min — planned: 10 min)
3. ESP polls `GET /devices/:id/relay-command` every **5 seconds**
4. ESP executes command; on success ACKs via `PUT /devices/:id/relay-command/ack`
5. ACK is retried up to **3 times** with 3s delay between attempts (handles Render cold-start timeouts)
6. If relay_set_state fails (e.g. TRIPPED trying "on"), command is NOT ACKed — stays pending for next poll

---

## 5. Backend Server (`server/`)

### 5.1 Tech Stack

| Category | Library / Version |
|----------|------------------|
| Runtime | Node.js >= 18.0.0 |
| Framework | Express.js 4.19.2 |
| Language | TypeScript 5.4.2 |
| Database | MySQL2 3.9.2 |
| Auth | jsonwebtoken 9.0.2, bcrypt 5.1.1 |
| File Storage | @supabase/supabase-js 2.95.3 |
| Real-time | Server-Sent Events (native) |
| Cron | node-cron 3.0.3 |
| Validation | express-validator 7.0.1 |
| Logging | winston 3.12.0 + daily-rotate-file |
| Security | helmet 7.1.0, express-rate-limit 7.2.0 |
| Email | Nodemailer + Gmail SMTP |

### 5.2 Database Schema

**Tables:**

| Table | Purpose |
|-------|---------|
| `users` | Admins and tenants |
| `devices` | ESP32 devices (device_id, relay_status, last_seen_at) |
| `device_keys` | Plaintext API keys for ESP32 auth (one per device, auto-rotated) |
| `power_readings` | Raw sensor data (voltage, current, power, timestamp) |
| `power_aggregates_hourly` | Hourly averages (avg/max/min power, energy_kwh) |
| `power_aggregates_daily` | Daily summaries with peak hour + anomaly count |
| `power_aggregates_monthly` | Monthly totals |
| `anomaly_events` | Detected anomalies with type, severity, resolution |
| `pads` | Billing units linking device → tenant → owner |
| `billing_periods` | Bills generated per schedule period |
| `payments` | Tenant payment submissions with receipt images |
| `payment_qr_codes` | Payment destination QR codes (GCash, Maya, etc.) |
| `relay_commands` | Admin-issued relay commands (pending → acked / failed) |

**Relationships:**
```
users ──< devices (owner_id)
users ──< pads (owner_id, tenant_id)
devices ──< power_readings
devices ──< anomaly_events
devices ──< relay_commands
devices ──1 pads
pads ──< billing_periods
billing_periods ──< payments
power_readings → power_aggregates_hourly → power_aggregates_daily → power_aggregates_monthly
```

**Migrations:**

| File | Description |
|------|-------------|
| `000_create_migrations_log.sql` | Migration tracking table |
| `001_create_pads.sql` | Pads table |
| `002_create_billing_periods.sql` | Billing periods table |
| `003_create_payments.sql` | Payments table |
| `004_create_relay_commands.sql` | Relay commands table |
| `005_create_power_aggregates.sql` | Aggregate tables (hourly/daily/monthly) |
| `006_update_payments_receipt.sql` | Add receipt fields to payments |
| `007_create_payment_qr_codes.sql` | Payment QR codes table |

### 5.3 API Routes (`/api/v1`)

**Authentication & Users**

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/auth/register` | None | Register user |
| POST | `/auth/login` | None | Login, receive JWT |
| POST | `/auth/refresh` | None | Refresh JWT token |
| POST | `/auth/forgot-password` | None | Send reset email (Gmail SMTP) |

**Devices**

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/devices/register` | JWT | Register new device |
| GET | `/devices` | JWT | List user's devices |
| GET | `/devices/:id` | JWT | Device details |
| PUT | `/devices/:id` | JWT | Update device |
| PUT | `/devices/:id/relay` | JWT | Update relay status |
| POST | `/devices/:id/relay-command` | JWT + Admin | Issue relay command |
| GET | `/devices/:id/relay-command` | API Key | ESP polls pending command |
| PUT | `/devices/:id/relay-command/ack` | API Key | ESP acknowledges command |
| GET | `/devices/:id/relay-command/history` | JWT + Admin | Command history |

**Power Data**

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/power-data` | API Key | ESP submits reading |
| GET | `/power-data/:id` | JWT | Power history |
| GET | `/power-data/:id/latest` | JWT | Latest reading |
| GET | `/power-data/:id/stats` | JWT | Stats for date range |

**Anomaly Events**

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/anomaly-events` | API Key | ESP reports anomaly |
| GET | `/anomaly-events` | JWT | List anomalies |
| PUT | `/anomaly-events/:id/resolve` | JWT + Admin | Resolve anomaly |

**Pads**

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/pads` | JWT + Admin | Create pad |
| GET | `/pads` | JWT + Admin | List all pads |
| GET | `/pads/my` | JWT | Tenant's own pad |
| GET | `/pads/:id` | JWT | Pad details |
| PUT | `/pads/:id` | JWT + Admin | Update pad |
| PUT | `/pads/:id/assign` | JWT + Admin | Assign tenant to pad |

**Billing**

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/billing` | JWT + Admin | All billing periods |
| GET | `/billing/my` | JWT | Tenant's bills |
| GET | `/billing/:id` | JWT | Bill details |
| POST | `/billing/generate` | JWT + Admin | Manually generate bill |
| PUT | `/billing/:id/waive` | JWT + Admin | Waive a bill |

**Payments**

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/payments/submit` | JWT | Submit payment receipt |
| GET | `/payments/pending-verification` | JWT + Admin | Receipts awaiting review |
| PUT | `/payments/:id/approve` | JWT + Admin | Approve payment |
| PUT | `/payments/:id/reject` | JWT + Admin | Reject payment |
| GET | `/payments/qr-codes` | JWT | Active QR codes |
| POST | `/payments/qr-codes` | JWT + Admin | Upload QR code |
| PUT | `/payments/qr-codes/:id/toggle` | JWT + Admin | Enable/disable QR code |

**Reports & SSE**

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/reports/*` | JWT | Analytics and report data |
| GET | `/sse/events?token=` | JWT | SSE event stream |
| GET | `/health` | None | Health check |

### 5.4 Authentication

**JWT (Users/Admins):**
- Login → `{ token, refreshToken, user }`
- Header: `Authorization: Bearer <token>`
- Access token: 24h, Refresh token: 7d
- Payload: `{ id, email, full_name, role, is_active }`

**API Key (ESP32 Devices):**
- Format: `bw_` prefix + 64 hex chars
- Header: `X-API-Key: <key>`
- Stored **plaintext** in `device_keys` table (compared directly, not bcrypt)
- Cache TTL: 60 seconds (avoids per-request DB queries)
- **Auto-rotate on mismatch**: if `device_id` matches a known device but the key doesn't match any stored key, all old keys are deleted and the new key is auto-registered. This handles reflash / NVS regeneration without manual DB cleanup.

### 5.5 Services

**SSE Service** (`sse.service.ts`)
- Real-time broadcasting to connected clients (in-memory registry)
- Event types: `anomaly`, `power_reading`, `relay_state`, `relay_command_issued`, `payment_submitted`, `payment_received`, `payment_rejected`
- Target: `sendToUser(userId)`, `sendToDevice(deviceId)`, `broadcastToAll()`

**Billing Service** (`billing.service.ts`)
- Supports `daily`, `weekly`, and `monthly` billing frequency per pad
- `bill_type`: `electricity` (energy × rate) or `flat_rate`
- `due_date = period_end + due_offset_days`
- Energy rounded to 2dp before multiplication — displayed `kWh × rate = displayed amount`
- **Auto-rollback**: deleting a generated bill rolls `next_period_start` back for regeneration

**Aggregation Service** (`aggregation.service.ts`)
- Hourly: averages raw readings per device
- Daily: sums hourly records, identifies peak hour, counts anomalies
- Monthly: sums daily records
- All use UPSERT to prevent duplicates

**Supabase Service** (`supabase.service.ts`)
- Uploads to organized buckets: `users/{id}/`, `devices/{id}/`, `receipts/{tenantId}/`, `payment-qr/`
- Returns public URLs for display

### 5.6 Cron Jobs (`jobs/index.ts`)

| Schedule | Task |
|----------|------|
| `55 * * * *` | Check billing schedules and generate closed periods |
| `5 * * * *` | Hourly power aggregation |
| `10 0 * * *` | Daily aggregation |
| `20 0 1 * *` | Monthly aggregation |
| `0 8 * * *` | Mark overdue bills |
| `0 3 * * 0` | Data cleanup (raw > 30 days, aggregates > 90 days) |

### 5.7 Online Status Threshold

A device is considered **online** if: `Date.now() - last_seen_at < 2 minutes`.
Checked in the devices page (`client/web_admin/app/(dashboard)/devices/page.tsx`).

---

## 6. Deployed Devices

| Device ID | Pad | CKS Meter | Notes |
|-----------|-----|-----------|-------|
| bluewatt-001 | PAD-1 | #2020351146 | Tenant: Sophie Garcia |
| bluewatt-002 | PAD-2 | — | Inactive, no tenant |
| bluewatt-003 | PAD-3 | #2020351142 | Tenant: Reynie Tapnio |
| bluewatt-004 | PAD-4 | #2020351141 | Tenant: Jassy Halt; PZEM reset ~2026-05-10 (energy_offset: 197.774 kWh) |

---

## 7. Web Admin Dashboard (`client/web_admin/`)

### Tech Stack

| Category | Library |
|----------|---------|
| Framework | Next.js 14 (App Router, `output: standalone`) |
| UI Library | HeroUI 2.x |
| Styling | TailwindCSS |
| Charts | Recharts |
| Forms | react-hook-form + zod |
| HTTP | Axios / SWR |
| Icons | lucide-react, framer-motion |

### Pages

| Route | Purpose |
|-------|---------|
| `/` | Redirects to `/dashboard` |
| `/(auth)/login` | Login form |
| `/(dashboard)/dashboard` | Main monitoring dashboard |
| `/(dashboard)/devices` | Device list + online status |
| `/about`, `/blog`, `/docs`, `/pricing` | Static pages |

### Authentication Flow
1. POST `/auth/login` → receive JWT + user
2. Store in `localStorage`
3. `useAuth` hook exposes auth state globally
4. API client injects `Authorization: Bearer <token>` on all requests
5. SSE connects via `GET /sse/events?token=<jwt>`

---

## 8. Flutter App (`client/flutter_app/`)

| Category | Details |
|----------|---------|
| Version | 1.1.1+75 |
| State management | Provider |
| Storage | `flutter_secure_storage` (JWT, user object) |
| Caching | `shared_preferences` (stale-while-revalidate) |
| Notifications | `flutter_local_notifications` |
| Charts | fl_chart |
| Distribution | Direct APK (Android only, not on Play Store) |
| API URL | `https://bluewatt-api-ydhd.onrender.com` |

---

## 9. Key TypeScript Types

```typescript
interface User {
  id: number; email: string; full_name: string;
  role: 'admin' | 'user'; is_active: boolean;
}

interface Device {
  id: number; device_id: string; owner_id: number;
  relay_status: 'on' | 'off' | 'tripped'; last_seen_at?: Date;
}

interface PowerReading {
  id: number; device_id: number; timestamp: Date;
  voltage_rms: number; current_rms: number;
  power_apparent: number; power_real: number;
  power_factor: number; energy_kwh?: number; frequency?: number;
}

interface AnomalyEvent {
  id: number; device_id: number; timestamp: Date;
  anomaly_type: 'overcurrent' | 'short_circuit' | 'wire_fire' |
                'overvoltage' | 'undervoltage';
  severity: 'low' | 'medium' | 'high' | 'critical';
  relay_tripped: boolean; is_resolved: boolean;
}

interface Pad {
  id: number; name: string; device_id?: number;
  tenant_id?: number; owner_id: number; rate_per_kwh: number;
  bill_type: 'electricity' | 'flat_rate';
  frequency: 'daily' | 'weekly' | 'monthly';
  due_offset_days: number;
}

interface BillingPeriod {
  id: number; pad_id: number; energy_kwh: number;
  rate_per_kwh: number; amount_due: number;
  status: 'unpaid' | 'paid' | 'overdue' | 'waived';
  due_date: Date;
}

interface Payment {
  id: number; billing_period_id: number; tenant_id: number;
  amount: number; payment_method?: string;
  receipt_url?: string; reference_number?: string;
  status: 'pending' | 'pending_verification' | 'paid' | 'failed' | 'refunded';
  rejection_reason?: string;
}

interface RelayCommand {
  id: number; device_id: number; command: 'on' | 'off' | 'reset';
  issued_by: number; status: 'pending' | 'acked' | 'failed';
  expires_at: Date;
}
```

---

## 10. Billing & Payment Workflow

```
1. ESP32 reads energy every 1s
       ↓
2. Raw readings aggregated hourly → daily → monthly (cron)
       ↓
3. Cron at :55 every hour: check billing schedules
   Closed period → generate billing_period record
   amount_due = energy_kwh × pad.rate_per_kwh (electricity)
             or flat_rate (flat_rate type)
   due_date   = period_end + due_offset_days
       ↓
4. Tenant views bill → selects payment method → uploads receipt image
   → POST /payments/submit → stored as 'pending_verification'
   → SSE event sent to admin
       ↓
5. Admin reviews receipt:
   Approve → billing status 'paid', SSE 'payment_received' → tenant
   Reject  → payment status 'failed' with reason, SSE 'payment_rejected' → tenant
       ↓
6. Daily cron (08:00): unpaid past due_date → status 'overdue'
```

---

## 11. Environment Variables

**Backend (`server/.env`):**

```env
NODE_ENV=production
PORT=3000

# MySQL (Aiven)
DB_HOST=<host>
DB_PORT=3306
DB_USER=<user>
DB_PASSWORD=<password>
DB_NAME=bluewatt_db
DB_SSL=true
DB_SSL_CA_B64=<base64-cert>

# Supabase
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<key>
SUPABASE_STORAGE_BUCKET=profile-images

# JWT
JWT_SECRET=<secret>
JWT_EXPIRES_IN=24h
JWT_REFRESH_SECRET=<secret>
JWT_REFRESH_EXPIRES_IN=7d

# SMTP (Gmail app password for forgot-password email)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<gmail>
SMTP_PASS=<app-password>

# CORS
CORS_ORIGIN=http://localhost:3001,https://bluewatt-admin-cqis.onrender.com
```

**Frontend (`client/web_admin/.env.local`):**

```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
NEXT_PUBLIC_SITE_NAME=BlueWatt
```

---

## 12. Deployment

| Component | URL / Target |
|-----------|-------------|
| API Server | https://bluewatt-api-ydhd.onrender.com |
| Proxy (ESP points here) | https://bluewatt-api.onrender.com |
| Web Admin | https://bluewatt-admin-cqis.onrender.com |
| Database | Aiven Cloud MySQL |
| File Storage | Supabase Storage |
| Flutter App | Direct APK distribution |

**Render free tier note:** Both the proxy and the ydhd server sleep after inactivity. Cold starts take up to 30s, which can consume the ESP's entire HTTP timeout. The ACK retry (3× with 3s delay) was added to handle this.

---

## 13. Known Limitations

- **No offline data buffering**: Power queue holds only 5 readings (~50s). Readings during disconnection are dropped (PZEM hardware kWh counter is safe and persists).
- **Render free tier cold starts**: Up to 30s wakeup; mitigated by ACK retry but first POST after sleep may time out.
- **Single ESP per pad**: No hardware redundancy.
- **Android only**: APK not on Play Store — distributed directly.
- **Relay command expiry**: Currently 3 minutes; should be 10 minutes to survive a Render cold start + 3 ACK retries.

---

## 14. Notable Design Decisions

1. **Pads decouple billing from devices** — a "pad" links one device to one tenant under one owner, allowing device reassignment without losing billing history.
2. **Aggregation pipeline** — raw readings (30-day retention) are pre-aggregated into hourly/daily/monthly tables for fast report queries.
3. **Relay command polling** — ESP32 polls every 5s rather than receiving push; simpler for embedded, works behind NAT.
4. **ACK retry** — 3 attempts with 3s delay each; ensures commands stuck on a Render cold-start timeout are eventually ACKed rather than staying pending forever.
5. **API key auto-rotation** — if device_id matches but key mismatches, old keys are deleted and new key registered automatically. Handles reflash without manual DB cleanup.
6. **NTP fallback** — timestamps fall back to boot-uptime ms if NTP hasn't synced yet (`now > 1_000_000_000` check), so power readings are never blocked by clock sync.
7. **Confirmation logic** — overcurrent requires 3 consecutive readings above threshold to reduce false positives from transient spikes.
8. **Philippines-specific** — PEC 2017 voltage thresholds (207V–253V @ 230V nominal), 60Hz, payment methods (GCash, Maya).
9. **In-memory SSE registry** — simple and effective for single-server deployments; would need Redis pub/sub for horizontal scaling.
