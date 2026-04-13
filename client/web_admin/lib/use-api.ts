/**
 * SWR hooks for all API endpoints.
 *
 * Data is cached in memory for the browser session.
 * On navigation, cached data is shown instantly while a background revalidation runs.
 * Calling mutate() after a write forces an immediate refresh.
 */
import useSWR, { mutate as globalMutate } from "swr";
import {
  devicesApi,
  padsApi,
  billingApi,
  paymentsApi,
  reportsApi,
  anomalyApi,
  adminApi,
} from "./api";

// ── Config ────────────────────────────────────────────────────────────────────

/** Revalidate at most once per 30 s on the same key */
const DEDUPE_MS = 30_000;

// ── Devices ───────────────────────────────────────────────────────────────────

export function useDevices() {
  return useSWR(
    "devices",
    () => devicesApi.list().then((r) => r.data.data?.devices ?? []),
    { dedupingInterval: DEDUPE_MS, revalidateOnFocus: false }
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
    { dedupingInterval: DEDUPE_MS, revalidateOnFocus: false }
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
    { dedupingInterval: DEDUPE_MS, revalidateOnFocus: false }
  );
}

export function reloadBilling() {
  return globalMutate("billing");
}

// ── Payments ──────────────────────────────────────────────────────────────────

export function useAllPayments() {
  return useSWR(
    "payments:all",
    () => paymentsApi.all().then((r) => r.data.data?.payments ?? []),
    { dedupingInterval: DEDUPE_MS, revalidateOnFocus: false }
  );
}

export function usePendingPayments() {
  return useSWR(
    "payments:pending",
    () => paymentsApi.pendingVerification().then((r) => r.data.data?.payments ?? []),
    { dedupingInterval: DEDUPE_MS, revalidateOnFocus: false }
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
    { dedupingInterval: DEDUPE_MS, revalidateOnFocus: false }
  );
}

export function useDailyReport(deviceId: number | null, month: string) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  return useSWR(
    deviceId ? ["reports:daily", deviceId, month] : null,
    () => reportsApi.daily(deviceId!, month).then((r) => r.data.data?.days ?? []),
    {
      dedupingInterval: DEDUPE_MS,
      revalidateOnFocus: false,
      // Auto-refresh only for the current month (live data may change as ESP sends readings)
      refreshInterval: month === currentMonth ? 60_000 : 0,
    }
  );
}

// ── Anomalies ─────────────────────────────────────────────────────────────────

export function useAnomalyEvents(deviceId: number | null) {
  return useSWR(
    deviceId ? ["anomaly:events", deviceId] : null,
    () => anomalyApi.list(deviceId!).then((r) => r.data.data?.events ?? []),
    { dedupingInterval: DEDUPE_MS, revalidateOnFocus: false }
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
    { dedupingInterval: DEDUPE_MS, revalidateOnFocus: false }
  );
}

export function reloadTenants() {
  return globalMutate("tenants");
}
