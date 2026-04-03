import { SVGProps } from "react";

export type IconSvgProps = SVGProps<SVGSVGElement> & { size?: number };

// ── Auth ─────────────────────────────────────────────────────────────────────
export interface User {
  id: number;
  full_name: string;
  email: string;
  role: "admin" | "tenant";
  profile_image_url?: string;
  created_at: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

// ── Device ───────────────────────────────────────────────────────────────────
export interface Device {
  id: number;
  device_id: string;
  device_name: string;
  location?: string;
  description?: string;
  owner_id: number;
  is_active: boolean;
  relay_status: "on" | "off" | "tripped" | "unknown";
  last_seen_at?: string;
  firmware_version?: string;
  image_url?: string;
  created_at: string;
  updated_at: string;
}

// ── Power Reading ─────────────────────────────────────────────────────────────
export interface PowerReading {
  id: number;
  device_id: number;
  timestamp: string;
  voltage_rms: number;
  current_rms: number;
  power_real: number;
  power_apparent: number;
  power_factor: number;
  energy_kwh?: number;
  frequency?: number;
}

// ── Anomaly Event ─────────────────────────────────────────────────────────────
export interface AnomalyEvent {
  id: number;
  device_id: number;
  anomaly_type: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  value_at_detection?: number;
  threshold_exceeded?: number;
  relay_tripped: boolean | number;
  is_resolved: boolean | number;
  timestamp: string;
  resolved_at?: string;
  device_serial?: string;
}

// ── Pad ───────────────────────────────────────────────────────────────────────
export interface Pad {
  id: number;
  name: string;
  description?: string;
  device_id?: number;
  tenant_id?: number;
  owner_id: number;
  rate_per_kwh: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  tenant_name?: string;
  tenant_email?: string;
  device_serial?: string;
  relay_status?: string;
  last_seen_at?: string;
}

// ── Billing ───────────────────────────────────────────────────────────────────
export interface BillingPeriod {
  id: number;
  pad_id: number;
  tenant_id?: number;
  period_start: string;
  period_end: string;
  energy_kwh: number;
  rate_per_kwh: number;
  amount_due: number;
  status: "unpaid" | "paid" | "overdue" | "waived";
  due_date: string;
  paid_at?: string;
  created_at: string;
  pad_name?: string;
  tenant_name?: string;
}

// ── Payment ───────────────────────────────────────────────────────────────────
export type PaymentStatus = "pending" | "pending_verification" | "paid" | "failed" | "refunded";

export interface Payment {
  id: number;
  billing_period_id: number;
  tenant_id: number;
  amount: number;
  payment_method: string;
  status: PaymentStatus;
  reference_number?: string;
  receipt_url?: string;
  rejection_reason?: string;
  verified_by?: number;
  verified_at?: string;
  created_at: string;
  updated_at: string;
  tenant_name?: string;
  pad_name?: string;
  period_start?: string;
  period_end?: string;
}

export interface PaymentQrCode {
  id: number;
  label: string;
  image_url: string;
  is_active: boolean;
  uploaded_by: number;
  created_at: string;
  uploader_name?: string;
}

// ── Relay Command ─────────────────────────────────────────────────────────────
export interface RelayCommand {
  id: number;
  device_id: number;
  command: "on" | "off" | "reset";
  issued_by: number;
  status: "pending" | "acked" | "failed";
  issued_at: string;
  acked_at?: string;
  issuer_name?: string;
}

// ── Aggregates ────────────────────────────────────────────────────────────────
export interface HourlyAggregate {
  date: string;
  hour: number;
  avg_voltage: number;
  avg_current: number;
  avg_power: number;
  total_energy_kwh: number;
}

export interface DailyAggregate {
  date: string;
  avg_voltage: number;
  avg_current: number;
  avg_power: number;
  total_energy_kwh: number;
  anomaly_count: number;
}

export interface MonthlyAggregate {
  year_month: string;
  avg_voltage: number;
  avg_current: number;
  avg_power: number;
  total_energy_kwh: number;
  anomaly_count: number;
}

export interface PadSummaryRow {
  id: number;
  name: string;
  rate_per_kwh: number;
  tenant_name?: string;
  device_serial?: string;
  relay_status?: string;
  energy_kwh: number;
  estimated_amount: number;
  anomaly_count: number;
  bill_status?: string;
  billed_amount?: number;
}

// ── SSE ───────────────────────────────────────────────────────────────────────
export type SseEventType =
  | "anomaly"
  | "power_reading"
  | "relay_state"
  | "relay_command_issued"
  | "payment_submitted"
  | "payment_received"
  | "payment_rejected";
