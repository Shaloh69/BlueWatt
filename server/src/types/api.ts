// Request types
export interface RegisterRequest {
  email: string;
  password: string;
  full_name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface DeviceRegistrationRequest {
  device_id: string;
  device_name: string;
  location?: string;
  description?: string;
}

export interface PowerDataRequest {
  device_id: string;
  timestamp: number;
  voltage_rms: number;
  current_rms: number;
  power_apparent: number;
  power_real: number;
  power_factor: number;
}

export interface AnomalyEventRequest {
  device_id: string;
  timestamp: number;
  anomaly_type: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  current: number;
  voltage: number;
  power: number;
  relay_tripped: boolean;
}

// Response types
export interface AuthResponse {
  token: string;
  user: {
    id: number;
    email: string;
    full_name: string;
    role: string;
  };
}

export interface DeviceResponse {
  id: number;
  device_id: string;
  device_name: string;
  location?: string;
  is_active: boolean;
  relay_status: string;
  last_seen_at?: Date;
}

export interface DeviceRegistrationResponse {
  device: DeviceResponse;
  api_key: string;
}

export interface DeviceStatsResponse {
  device_id: string;
  current_status: {
    is_online: boolean;
    relay_status: string;
    last_reading?: {
      voltage_rms: number;
      current_rms: number;
      power_real: number;
      power_factor: number;
      timestamp: Date;
    };
  };
  today: {
    total_kwh: number;
    avg_power: number;
    peak_power: number;
    anomaly_count: number;
  };
  this_month: {
    total_kwh: number;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}
