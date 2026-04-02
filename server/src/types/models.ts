export interface User {
  id: number;
  email: string;
  password_hash: string;
  full_name: string;
  role: 'admin' | 'user';
  is_active: boolean;
  profile_image_url?: string;
  created_at: Date;
  updated_at: Date;
  last_login_at?: Date;
}

export interface Device {
  id: number;
  device_id: string;
  owner_id: number;
  device_name: string;
  location?: string;
  description?: string;
  is_active: boolean;
  relay_status: 'on' | 'off' | 'tripped';
  device_image_url?: string;
  last_seen_at?: Date;
  firmware_version?: string;
  created_at: Date;
  updated_at: Date;
}

export interface DeviceKey {
  id: number;
  device_id: number;
  api_key: string;
  key_hash: string;
  is_active: boolean;
  last_used_at?: Date;
  expires_at?: Date;
  created_at: Date;
}

export interface PowerReading {
  id: number;
  device_id: number;
  timestamp: Date;
  voltage_rms: number;
  current_rms: number;
  power_apparent: number;
  power_real: number;
  power_factor: number;
  energy_kwh?: number;
  frequency?: number;
  created_at: Date;
}

export interface AnomalyEvent {
  id: number;
  device_id: number;
  timestamp: Date;
  anomaly_type: 'overcurrent' | 'short_circuit' | 'wire_fire' | 'overvoltage' | 'undervoltage' | 'overpower' | 'arc_fault' | 'ground_fault';
  severity: 'low' | 'medium' | 'high' | 'critical';
  current_value?: number;
  voltage_value?: number;
  power_value?: number;
  relay_tripped: boolean;
  is_resolved: boolean;
  resolved_at?: Date;
  resolved_by?: number;
  notes?: string;
  created_at: Date;
}

export interface Pad {
  id: number;
  name: string;
  description?: string;
  device_id?: number;
  tenant_id?: number;
  owner_id: number;
  rate_per_kwh: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface BillingPeriod {
  id: number;
  pad_id: number;
  tenant_id?: number;
  period_start: Date;
  period_end: Date;
  energy_kwh: number;
  rate_per_kwh: number;
  amount_due: number;
  status: 'unpaid' | 'paid' | 'overdue' | 'waived';
  due_date: Date;
  paid_at?: Date;
  created_at: Date;
}

export interface Payment {
  id: number;
  billing_period_id: number;
  tenant_id: number;
  amount: number;
  currency: string;
  payment_method?: string;        // 'gcash', 'maya', 'bank_transfer', etc.
  reference_number?: string;      // reference from the receipt (e.g. GCash ref #)
  receipt_url?: string;           // Supabase URL of uploaded receipt image
  status: 'pending' | 'pending_verification' | 'paid' | 'failed' | 'refunded';
  rejection_reason?: string;      // set by admin when rejecting
  verified_by?: number;           // admin user id
  verified_at?: Date;
  paid_at?: Date;
  created_at: Date;
}

export interface PaymentQrCode {
  id: number;
  label: string;
  image_url: string;
  is_active: boolean;
  uploaded_by: number;
  created_at: Date;
  updated_at: Date;
}

export interface RelayCommand {
  id: number;
  device_id: number;
  command: 'on' | 'off' | 'reset';
  issued_by: number;
  status: 'pending' | 'acked' | 'failed';
  issued_at: Date;
  acked_at?: Date;
}

export interface PowerAggregateHourly {
  id: number;
  device_id: number;
  hour_start: Date;
  avg_voltage: number;
  avg_current: number;
  avg_power_real: number;
  max_power_real: number;
  min_power_real: number;
  total_energy_kwh: number;
  avg_power_factor: number;
  reading_count: number;
  created_at: Date;
}

export interface PowerAggregateDaily {
  id: number;
  device_id: number;
  date: Date;
  avg_voltage: number;
  avg_current: number;
  avg_power_real: number;
  max_power_real: number;
  min_power_real: number;
  total_energy_kwh: number;
  avg_power_factor: number;
  peak_hour?: number;
  reading_count: number;
  anomaly_count: number;
  created_at: Date;
}

export interface PowerAggregateMonthly {
  id: number;
  device_id: number;
  year_month: string;
  total_energy_kwh: number;
  avg_power_real: number;
  max_power_real: number;
  avg_voltage: number;
  avg_current: number;
  avg_power_factor: number;
  anomaly_count: number;
  created_at: Date;
}
