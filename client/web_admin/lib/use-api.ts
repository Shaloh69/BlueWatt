/**
 * SWR hooks for all API endpoints.
 *
 * Data is cached in memory and auto-refreshed at the intervals below.
 * Calling mutate() after a write forces an immediate refresh.
 */
import useSWR, { mutate as globalMutate } from "swr";
import {
  devicesApi,
  padsApi,
  billingApi,
  billingSchedulesApi,
  paymentsApi,
  reportsApi,
  anomalyApi,
  adminApi,
  staysApi,
} from "./api";

// ── Refresh intervals ─────────────────────────────────────────────────────────

const DEDUPE_MS = 5_000;
const FAST = 5_000; // devices, anomalies, pending payments
const MEDIUM = 8_000; // stays, pads, all payments, pad summary
const SLOW = 15_000; // billing, schedules, tenants

// ── Devices ───────────────────────────────────────────────────────────────────

export function useDevices() {
  return useSWR(
    "devices",
    () => devicesApi.list().then((r) => r.data.data?.devices ?? []),
    {
      dedupingInterval: DEDUPE_MS,
      revalidateOnFocus: true,
      refreshInterval: FAST,
    },
  );
}

export function reloadDevices() {
  return globalMutate("devices");
}

// ── Pads ──────────────────────────────────────────────────────────────────────

export function usePads() {
  return useSWR(
    "pads",
    () => padsApi.list().then((r) => r.data.data?.pads ?? []),
    {
      dedupingInterval: DEDUPE_MS,
      revalidateOnFocus: true,
      refreshInterval: MEDIUM,
    },
  );
}

export function reloadPads() {
  return globalMutate("pads");
}

// ── Billing ───────────────────────────────────────────────────────────────────

export function useBilling() {
  return useSWR(
    "billing",
    () => billingApi.list().then((r) => r.data.data?.bills ?? []),
    {
      dedupingInterval: DEDUPE_MS,
      revalidateOnFocus: true,
      refreshInterval: SLOW,
    },
  );
}

export function reloadBilling() {
  return globalMutate("billing");
}

// ── Billing Schedules ─────────────────────────────────────────────────────────

export function useSchedules() {
  return useSWR(
    "billing:schedules",
    () => billingSchedulesApi.list().then((r) => r.data.data?.schedules ?? []),
    {
      dedupingInterval: DEDUPE_MS,
      revalidateOnFocus: true,
      refreshInterval: SLOW,
    },
  );
}

export function reloadSchedules() {
  return globalMutate("billing:schedules");
}

// ── Payments ──────────────────────────────────────────────────────────────────

export function useAllPayments() {
  return useSWR(
    "payments:all",
    () => paymentsApi.all().then((r) => r.data.data?.payments ?? []),
    {
      dedupingInterval: DEDUPE_MS,
      revalidateOnFocus: true,
      refreshInterval: MEDIUM,
    },
  );
}

export function usePendingPayments() {
  return useSWR(
    "payments:pending",
    () =>
      paymentsApi
        .pendingVerification()
        .then((r) => r.data.data?.payments ?? []),
    {
      dedupingInterval: DEDUPE_MS,
      revalidateOnFocus: true,
      refreshInterval: FAST,
    },
  );
}

export function reloadPendingPayments() {
  return globalMutate("payments:pending");
}

export function reloadPayments() {
  globalMutate("payments:all");
  globalMutate("payments:pending");
}

// ── Reports ───────────────────────────────────────────────────────────────────

export function usePadSummary(month?: string) {
  return useSWR(
    ["reports:pad-summary", month],
    () => reportsApi.padSummary(month).then((r) => r.data.data?.pads ?? []),
    {
      dedupingInterval: DEDUPE_MS,
      revalidateOnFocus: true,
      refreshInterval: MEDIUM,
    },
  );
}

export function useDailyReport(deviceId: number | null, month: string) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  return useSWR(
    deviceId ? ["reports:daily", deviceId, month] : null,
    () =>
      reportsApi.daily(deviceId!, month).then((r) => r.data.data?.days ?? []),
    {
      dedupingInterval: DEDUPE_MS,
      revalidateOnFocus: true,
      refreshInterval: month === currentMonth ? 60_000 : 0,
    },
  );
}

// ── Anomalies ─────────────────────────────────────────────────────────────────

export function useAnomalyEvents(deviceId: number | null) {
  return useSWR(
    deviceId ? ["anomaly:events", deviceId] : null,
    () => anomalyApi.list(deviceId!).then((r) => r.data.data?.events ?? []),
    {
      dedupingInterval: DEDUPE_MS,
      revalidateOnFocus: true,
      refreshInterval: FAST,
    },
  );
}

export function reloadAnomalyEvents(deviceId: number) {
  return globalMutate(["anomaly:events", deviceId]);
}

// ── Admin / Tenants ───────────────────────────────────────────────────────────

export function useTenants() {
  return useSWR(
    "tenants",
    () => adminApi.listTenants().then((r) => r.data.data?.tenants ?? []),
    {
      dedupingInterval: DEDUPE_MS,
      revalidateOnFocus: true,
      refreshInterval: SLOW,
    },
  );
}

export function reloadTenants() {
  return globalMutate("tenants");
}

// ── Stays ─────────────────────────────────────────────────────────────────────

export function useStays() {
  return useSWR(
    "stays",
    () => staysApi.list().then((r) => r.data.data?.stays ?? []),
    {
      dedupingInterval: DEDUPE_MS,
      revalidateOnFocus: true,
      refreshInterval: MEDIUM,
    },
  );
}

export function useStaysByPad(padId: number | null) {
  return useSWR(
    padId ? ["stays:pad", padId] : null,
    () => staysApi.getByPad(padId!).then((r) => r.data.data?.stays ?? []),
    {
      dedupingInterval: DEDUPE_MS,
      revalidateOnFocus: true,
      refreshInterval: MEDIUM,
    },
  );
}

export function reloadStays() {
  return globalMutate("stays");
}
