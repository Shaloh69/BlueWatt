# BlueWatt — Repository Analysis

> Last updated: 2026-03-30 (wiring corrected: TX→TX, RX→RX)

---

## 1. Project Overview

**BlueWatt** is an IoT-based electrical monitoring and management system designed for multi-unit residential buildings (condominiums, boarding houses, rental units) in the Philippines. The system:

- Monitors real-time electrical consumption per unit via an ESP32 + PZEM-004T power meter
- Detects safety anomalies (overcurrent, short circuits, arc faults, wire fires) and triggers automatic relay cutoffs
- Manages per-unit billing based on actual energy consumption
- Handles tenant payment submissions with receipt image verification
- Provides a web admin dashboard and a mobile tenant app

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Client Layer                                                │
│  - Next.js web admin dashboard (admin/landlord)             │
│  - Flutter mobile app (tenants)                             │
│  - Real-time updates via SSE and webhooks                   │
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
| `task_pzem_read` | 9 | Read PZEM-004T sensor every 1s |
| `task_anomaly_detection` | 9 | Monitor thresholds, trigger relay |
| `task_relay_control` | 8 | Execute relay commands |
| `task_wifi_manager` | 3 | Maintain WiFi connectivity |
| `task_http_client` | 2 | POST data/events to backend |

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
│   ├── web_admin/                  # Next.js 15 admin panel
│   │   ├── app/
│   │   │   ├── (auth)/login/       # Login page
│   │   │   ├── (dashboard)/        # Protected dashboard pages
│   │   │   └── [about,blog,docs,pricing]/
│   │   ├── components/             # Sidebar, StatCard, dialogs
│   │   ├── hooks/                  # useAuth, useSSE
│   │   ├── lib/api.ts              # Axios API client
│   │   └── types/index.ts          # Shared TypeScript types
│   │
│   └── flutter_app/                # Flutter tenant app (structure present)
│       └── [ios, android, windows, linux, macos, web]
│
├── esp/
│   ├── main/                       # Production ESP32 firmware
│   │   ├── src/                    # C source files
│   │   ├── include/                # Header files
│   │   └── platformio.ini          # PlatformIO build config
│   └── pilot/                      # Prototype/pilot firmware
│
├── render.yaml                     # Render deployment config
└── analyzation.md                  # This document
```

---

## 4. ESP32 Firmware (`esp/main/`)

**Power Architecture:**

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
                                                   ↑ this mismatch
                                                     is why resistors are needed
```

> **KEY FACT:** The ESP32 is powered from 5V but its GPIO pins always operate at 3.3V.
> The PZEM and relay run at 5V. This 5V ↔ 3.3V boundary is where all resistor requirements come from.

**Hardware:**
- MCU: ESP32 (5V in via VIN → 3.3V internal via LDO)
- Power Meter: PZEM-004T via UART0 (GPIO1/GPIO3, 9600 baud, VCC = 5V)
- Relay: GPIO14 (active-LOW, SLA-05VDC-SL-C module, VCC = 5V)
- Status LED: GPIO2
- Power supply: 220V AC → 5V DC converter feeds everything

**PCB Wiring (FIXED — custom PCB, pins cannot change):**

```
220V AC → [AC-DC] → 5V DC
                        │
          ┌─────────────┼──────────────────────────────┐
          │             │                              │
    PZEM-004T      ESP32 board                   Relay Module
    ─────────      ─────────────                 ────────────
      VCC ◄──── 5V   VIN ◄──── 5V                VCC ◄──── 5V
      GND ──── GND   GND ──── GND                GND ──── GND
                       │                           │
                   [LDO reg]                   IN ◄──── GPIO14 (3.3V)
                       │
                     3.3V (internal)
                    GPIO pins

    TX ──────────────────────────────► GPIO1 (TX0)   TX-to-TX
    RX ◄──────────────────────────────  GPIO3 (RX0)   RX-to-RX
                                        (3.3V output)

Status LED
──────────
  GPIO2 (3.3V) → 330Ω → LED → GND
```

> **IMPORTANT:** Wiring is TX→TX and RX→RX (not the conventional crossover).
> This is intentional on this custom PCB. Do not "fix" it to a crossover — it will break communication.

**Required resistors / mods (production-critical):**

All resistor needs come from the **5V ↔ 3.3V boundary** between PZEM/relay (5V) and ESP32 GPIO (3.3V).

| Item | Location | Why |
|------|----------|-----|
| 1kΩ in parallel with R8 on PZEM board | On PZEM PCB near RX optocoupler | GPIO3 outputs 3.3V to PZEM RX — stock R8 (1kΩ) was sized for 5V; at 3.3V current is too low for reliable optocoupler switching |
| 10kΩ + 20kΩ voltage divider on PZEM TX → GPIO1 | PCB trace between PZEM TX and GPIO1 | PZEM TX outputs 5V (its VCC); ESP32 GPIO1 input max is 3.6V — without this, the ESP32 GPIO can be damaged |
| 10kΩ pull-up on relay IN to 3.3V | PCB, IN pin to 3.3V rail | GPIO14 (3.3V) glitches during boot; pull-up holds IN HIGH (relay OFF) until firmware takes control |
| 100µF + 0.1µF decoupling caps on PZEM VCC | PCB near PZEM VCC pin | ESP32 WiFi TX causes 5V supply spikes; caps absorb them before they corrupt the PZEM's internal address register |

**Modules:**

| File | Purpose |
|------|---------|
| `main.c` | FreeRTOS task orchestration and startup |
| `pzem_sensor.c` | PZEM-004T driver — reads voltage, current, power, energy, frequency |
| `anomaly_detector.c` | Threshold-based anomaly detection with confirmation logic |
| `relay_control.c` | Relay open/close with 1s cooldown |
| `http_client.c` | JSON POST of readings and anomalies to backend |
| `wifi_provisioning.c` | BLE-based WiFi credential setup (stored in NVS) |
| `wifi_manager.c` | WiFi connection and auto-reconnect |
| `logger.c` | Centralized logging |

**Anomaly Detection Thresholds (`config.h`):**

| Anomaly | Condition | Threshold | Action |
|---------|-----------|-----------|--------|
| Short Circuit | I_rms spike | > 50A | Immediate relay trip |
| Overcurrent | I_rms sustained (3 readings) | > 15A | Relay trip |
| Wire Fire | P_apparent / P_real ratio | > 1.5x with P > 2100W | Relay trip |
| Overvoltage | V_rms | > 250V | Log event |
| Undervoltage | V_rms | < 180V | Log event |
| Overpower | P_real sustained | > 3000W | Log event |
| Arc Fault | Rapid power fluctuations | Analyzer logic | Log event |
| Ground Fault | Phase imbalance | Analyzer logic | Log event |

**Relay Command Flow:**
1. Admin issues command (ON / OFF / RESET) via web dashboard
2. Backend stores it as `pending` in `relay_commands` table
3. ESP32 polls `/devices/:id/relay-command` every ~5–10s
4. ESP32 executes command and ACKs via `/relay-command/ack`

**HTTP Authentication:** `X-API-Key` header (per-device key, stored in NVS)

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

### 5.2 Database Schema

**Tables:**

| Table | Purpose |
|-------|---------|
| `users` | Admins and tenants |
| `devices` | ESP32 devices (device_id, relay_status, last_seen_at) |
| `device_keys` | Hashed API keys for ESP32 auth |
| `power_readings` | Raw sensor data (voltage, current, power, timestamp) |
| `power_aggregates_hourly` | Hourly averages (avg/max/min power, energy_kwh) |
| `power_aggregates_daily` | Daily summaries with peak hour + anomaly count |
| `power_aggregates_monthly` | Monthly totals |
| `anomaly_events` | Detected anomalies with type, severity, resolution |
| `pads` | Billing units linking device → tenant → owner |
| `billing_periods` | Monthly bills (energy × rate) |
| `payments` | Tenant payment submissions with receipt images |
| `payment_qr_codes` | Payment destination QR codes (GCash, Maya, etc.) |
| `relay_commands` | Admin-issued relay commands (pending → acked) |

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

### 5.4 Services

**SSE Service** (`sse.service.ts`)
- Real-time broadcasting to connected clients (in-memory registry)
- Event types: `anomaly`, `power_reading`, `relay_state`, `relay_command_issued`, `payment_submitted`, `payment_received`, `payment_rejected`
- Target: `sendToUser(userId)`, `sendToDevice(deviceId)`, `broadcastToAll()`

**Billing Service** (`billing.service.ts`)
- Monthly billing auto-generation on 1st of month
- Bill = `energy_kwh × rate_per_kwh`
- `due_date = period_end + 7 days`
- Daily overdue check (status → `overdue`)
- Manual waive operation

**Aggregation Service** (`aggregation.service.ts`)
- Hourly: averages raw readings per device
- Daily: sums hourly records, identifies peak hour, counts anomalies
- Monthly: sums daily records
- All use UPSERT to prevent duplicates

**Supabase Service** (`supabase.service.ts`)
- Uploads to organized buckets: `users/{id}/`, `devices/{id}/`, `receipts/{tenantId}/`, `payment-qr/`
- Returns public URLs for display

### 5.5 Cron Jobs (`jobs/index.ts`)

| Schedule | Task |
|----------|------|
| `5 * * * *` | Hourly power aggregation |
| `10 0 * * *` | Daily aggregation |
| `20 0 1 * *` | Monthly aggregation |
| `30 0 1 * *` | Auto-generate billing for all pads |
| `0 8 * * *` | Mark overdue bills |
| `0 3 * * 0` | Data cleanup (raw > 30 days, aggregates > 90 days) |

### 5.6 Authentication

**JWT (Users/Admins):**
- Login → `{ token, refreshToken, user }`
- Header: `Authorization: Bearer <token>`
- Access token: 24h, Refresh token: 7d
- Payload: `{ id, email, full_name, role, is_active }`

**API Key (ESP32 Devices):**
- Format: `bw_<random32>` (prefix configurable)
- Header: `X-API-Key: <key>`
- Stored bcrypt-hashed in `device_keys` table

---

## 6. Web Admin Dashboard (`client/web_admin/`)

### Tech Stack

| Category | Library |
|----------|---------|
| Framework | Next.js 15.5.9 (App Router) |
| UI Library | HeroUI 2.x |
| Styling | TailwindCSS 4.1.11 |
| Charts | Recharts |
| Forms | react-hook-form + zod |
| HTTP | Axios |
| Theming | next-themes |
| Icons | lucide-react, framer-motion |

### Pages

| Route | Purpose |
|-------|---------|
| `/` | Redirects to `/dashboard` |
| `/(auth)/login` | Login form |
| `/(dashboard)/dashboard` | Main monitoring dashboard |
| `/about` | About page |
| `/blog` | Blog (placeholder) |
| `/docs` | Documentation |
| `/pricing` | Pricing table |

### Key Files

| File | Purpose |
|------|---------|
| `app/layout.tsx` | Root layout with providers |
| `app/providers.tsx` | Theme, auth, and query providers |
| `components/layout/Sidebar.tsx` | Navigation sidebar |
| `components/shared/StatCard.tsx` | Stat display cards |
| `components/shared/ConfirmDialog.tsx` | Confirmation modals |
| `hooks/useAuth.ts` | Auth state (localStorage) |
| `hooks/useSSE.ts` | SSE event subscription |
| `lib/api.ts` | Axios client with auth header injection |
| `types/index.ts` | TypeScript type definitions |

### Authentication Flow
1. POST `/auth/login` → receive JWT + user
2. Store in `localStorage`
3. `useAuth` hook exposes auth state globally
4. API client injects `Authorization: Bearer <token>` on all requests
5. SSE connects via `GET /sse/events?token=<jwt>`

---

## 7. Key TypeScript Types

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
                'overvoltage' | 'undervoltage' | 'overpower' |
                'arc_fault' | 'ground_fault';
  severity: 'low' | 'medium' | 'high' | 'critical';
  relay_tripped: boolean; is_resolved: boolean;
}

interface Pad {
  id: number; name: string; device_id?: number;
  tenant_id?: number; owner_id: number; rate_per_kwh: number;
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
}
```

---

## 8. Billing & Payment Workflow

```
1. ESP32 reads energy every 1s
       ↓
2. Raw readings aggregated hourly → daily → monthly (cron)
       ↓
3. 1st of month: Billing auto-generated
   amount_due = energy_kwh × pad.rate_per_kwh
   due_date   = period_end + 7 days
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

## 9. Environment Variables

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

# CORS
CORS_ORIGIN=http://localhost:3001,https://admin.bluewatt.com
```

**Frontend (`client/web_admin/.env.local`):**

```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
NEXT_PUBLIC_SITE_NAME=BlueWatt
```

**ESP32 (NVS runtime config):**

```
server_url   → HTTP endpoint for backend
api_key      → Device API key
```

---

## 10. Deployment

| Component | Target |
|-----------|--------|
| Backend | Render (render.yaml configured) |
| Database | Aiven Cloud MySQL |
| File Storage | Supabase Storage |
| Web Admin | Vercel (recommended for Next.js) |
| ESP32 Firmware | PlatformIO (UART flash or OTA) |

---

## 11. Completeness Assessment

### Complete
- Core REST API (all CRUD operations)
- ESP32 firmware: power reading, anomaly detection, relay control, HTTP client, WiFi provisioning
- Real-time SSE event streaming
- JWT + API Key dual authentication
- Database schema with migrations (7 migrations)
- Billing auto-generation from energy aggregates
- Payment submission + admin receipt verification
- Payment QR code management
- Data aggregation pipeline (hourly → daily → monthly)
- Background cron jobs
- Rate limiting, security headers, CORS
- File uploads via Supabase

### Partial / In Progress
- Web admin dashboard (login + minimal dashboard page; full feature pages not confirmed)
- Reports/analytics (routes + controller files exist)
- Flutter mobile app (project structure only, Dart source not confirmed)

### Not Yet Implemented
- OTA firmware updates
- Email / SMS notifications
- CSV/PDF export for reports
- Multi-language support
- Device onboarding wizard UI
- Webhook integrations

---

## 12. Notable Design Decisions

1. **Pads decouple billing from devices** — a "pad" (billing unit) links one device to one tenant under one owner, allowing device reassignment without losing billing history.
2. **Aggregation pipeline** — raw readings (30-day retention) are pre-aggregated into hourly/daily/monthly tables for fast report queries without expensive full scans.
3. **Relay command polling** — ESP32 polls for commands rather than receiving push (simpler for embedded, works behind NAT).
4. **In-memory SSE registry** — simple and effective for single-server deployments; would need Redis pub/sub for horizontal scaling.
5. **Confirmation logic** — anomaly detector requires 3 consecutive threshold breaches before triggering, reducing false positives.
6. **Dual auth** — JWT for human users, API key (bcrypt-hashed) for devices; kept intentionally separate in middleware.
7. **Philippines-specific** — rate defaults, voltage range (180–250V, nominal 220V), payment methods (GCash, Maya) all reflect local context.
