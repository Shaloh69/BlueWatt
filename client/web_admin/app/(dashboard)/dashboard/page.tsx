"use client";

import { useEffect, useState, useCallback } from "react";
import { addToast } from "@heroui/toast";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Button } from "@heroui/button";
import { Building2, CreditCard, AlertTriangle, Cpu, RefreshCw, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/shared/StatCard";
import { TableSkeleton } from "@/components/shared/PageLoader";
import { padsApi, paymentsApi, reportsApi, getErrorMessage } from "@/lib/api";
import { PadSummaryRow, Payment } from "@/types";

export default function DashboardPage() {
  const [padSummary, setPadSummary] = useState<PadSummaryRow[]>([]);
  const [pendingPayments, setPendingPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [padRes, payRes] = await Promise.all([
        reportsApi.padSummary(),
        paymentsApi.pendingVerification(),
      ]);
      setPadSummary(padRes.data.data?.pads ?? []);
      setPendingPayments(payRes.data.data ?? []);
    } catch (err) {
      addToast({ title: "Failed to load dashboard", description: getErrorMessage(err), color: "danger" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const activePads = padSummary.filter((p) => p.device_serial).length;
  const totalAnomaly = padSummary.reduce((s, p) => s + (p.anomaly_count ?? 0), 0);
  const totalEnergy = padSummary.reduce((s, p) => s + (p.energy_kwh ?? 0), 0);

  const billStatusColor = (s?: string) =>
    s === "paid" ? "success" : s === "overdue" ? "danger" : s === "waived" ? "default" : "warning";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-default-500 text-sm mt-0.5">Overview for {new Date().toLocaleString("default", { month: "long", year: "numeric" })}</p>
        </div>
        <Button
          variant="flat"
          size="sm"
          startContent={<RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />}
          onPress={() => load(true)}
          isDisabled={refreshing}
        >
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Active Pads" value={padSummary.length} icon={Building2} color="primary" loading={loading} />
        <StatCard label="Devices Online" value={activePads} icon={Cpu} color="success" loading={loading} />
        <StatCard
          label="Pending Payments"
          value={pendingPayments.length}
          icon={CreditCard}
          color={pendingPayments.length > 0 ? "warning" : "default"}
          loading={loading}
        />
        <StatCard
          label="Anomalies (month)"
          value={totalAnomaly}
          icon={AlertTriangle}
          color={totalAnomaly > 0 ? "danger" : "default"}
          loading={loading}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Pad Summary */}
        <Card className="lg:col-span-2 border border-default-200">
          <CardHeader className="flex items-center gap-2 pb-0">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-foreground">Pad Summary</h2>
            <Chip size="sm" variant="flat" color="primary" className="ml-auto">
              {totalEnergy.toFixed(2)} kWh
            </Chip>
          </CardHeader>
          <CardBody>
            {loading ? (
              <TableSkeleton rows={4} cols={5} />
            ) : padSummary.length === 0 ? (
              <p className="text-default-400 text-sm text-center py-8">No active pads found</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-default-200">
                      {["Pad", "Tenant", "Device", "Energy", "Bill"].map((h) => (
                        <th key={h} className="text-left py-2 px-3 text-default-500 font-medium text-xs uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {padSummary.map((p) => (
                      <tr key={p.id} className="border-b border-default-100 hover:bg-default-50 transition-colors">
                        <td className="py-3 px-3 font-medium text-foreground">{p.name}</td>
                        <td className="py-3 px-3 text-default-500">{p.tenant_name ?? "—"}</td>
                        <td className="py-3 px-3">
                          {p.device_serial ? (
                            <Chip size="sm" variant="flat" color="success">{p.device_serial}</Chip>
                          ) : <span className="text-default-400">—</span>}
                        </td>
                        <td className="py-3 px-3 text-default-600 font-mono">{p.energy_kwh.toFixed(2)} kWh</td>
                        <td className="py-3 px-3">
                          <Chip size="sm" variant="flat" color={billStatusColor(p.bill_status)}>
                            {p.bill_status ?? "no bill"}
                          </Chip>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Pending Payments */}
        <Card className="border border-default-200">
          <CardHeader className="flex items-center gap-2 pb-0">
            <CreditCard className="w-5 h-5 text-warning" />
            <h2 className="font-semibold text-foreground">Pending Verification</h2>
            {pendingPayments.length > 0 && (
              <Chip size="sm" color="warning" className="ml-auto">{pendingPayments.length}</Chip>
            )}
          </CardHeader>
          <CardBody>
            {loading ? (
              <TableSkeleton rows={3} cols={2} />
            ) : pendingPayments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CreditCard className="w-8 h-8 text-default-300 mb-2" />
                <p className="text-default-400 text-sm">All payments verified</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingPayments.slice(0, 6).map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-default-50 hover:bg-default-100 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{p.tenant_name ?? "Tenant"}</p>
                      <p className="text-xs text-default-400">₱{Number(p.amount).toFixed(2)}</p>
                    </div>
                    <Chip size="sm" color="warning" variant="flat">Pending</Chip>
                  </div>
                ))}
                {pendingPayments.length > 6 && (
                  <p className="text-center text-xs text-default-400 pt-1">+{pendingPayments.length - 6} more</p>
                )}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
