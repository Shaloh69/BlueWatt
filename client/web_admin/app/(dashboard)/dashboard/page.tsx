"use client";

import { useState } from "react";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Button } from "@heroui/button";
import { Building2, CreditCard, AlertTriangle, Cpu, RefreshCw, TrendingUp, LineChart as LineChartIcon } from "lucide-react";
import { StatCard } from "@/components/shared/StatCard";
import { TableSkeleton } from "@/components/shared/PageLoader";
import { usePadSummary, usePendingPayments, reloadPendingPayments, useDailyReport } from "@/lib/use-api";
import { PadSummaryRow } from "@/types";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Dot } from "recharts";

// ── Per-pad daily consumption mini-chart ──────────────────────────────────────

function PadChart({ pad, month }: { pad: PadSummaryRow; month: string }) {
  const deviceId = pad.device_id_int ?? null;
  const { data: daily = [], isLoading } = useDailyReport(deviceId, month);

  if (!deviceId) {
    return <p className="text-xs text-default-400 italic py-4 text-center">No device assigned</p>;
  }
  if (isLoading) {
    return <div className="h-28 flex items-center justify-center"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (daily.length === 0) {
    return <p className="text-xs text-default-400 italic py-4 text-center">No data for {month}</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={112}>
      <LineChart data={daily} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#64748b" }}
          tickFormatter={v => String(v).slice(0, 10).slice(8)} />
        <YAxis tick={{ fontSize: 9, fill: "#64748b" }} />
        <Tooltip
          formatter={(v: number) => [`${Number(v).toFixed(3)} kWh`, "Energy"]}
          contentStyle={{ background: "#0f172a", border: "1px solid #1e3a5f", borderRadius: 6, fontSize: 11 }}
          labelFormatter={l => `Day ${String(l).slice(0, 10).slice(8)}`}
        />
        <Line
          type="monotone"
          dataKey="total_energy_kwh"
          stroke="#6366f1"
          strokeWidth={2}
          dot={<Dot r={3} fill="#6366f1" />}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: padSummary = [], isLoading: padLoading, isValidating: padValidating, mutate: reloadPad } = usePadSummary();
  const { data: pendingPayments = [], isLoading: payLoading, isValidating: payValidating } = usePendingPayments();
  const [selectedPad, setSelectedPad] = useState<number | null>(null);
  const month = new Date().toISOString().slice(0, 7);

  const loading = padLoading || payLoading;
  const refreshing = padValidating || payValidating;

  function load() { reloadPad(); reloadPendingPayments(); }

  const activePads = padSummary.filter((p: PadSummaryRow) => p.device_serial).length;
  const totalAnomaly = padSummary.reduce((s: number, p: PadSummaryRow) => s + (p.anomaly_count ?? 0), 0);
  const totalEnergy = padSummary.reduce((s: number, p: PadSummaryRow) => s + Number(p.energy_kwh ?? 0), 0);

  // default selected pad to first with a device
  const displayPad = selectedPad
    ? padSummary.find((p: PadSummaryRow) => p.id === selectedPad) ?? padSummary[0]
    : padSummary.find((p: PadSummaryRow) => p.device_id_int) ?? padSummary[0];

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
          variant="flat" size="sm"
          startContent={<RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />}
          onPress={() => load()} isDisabled={refreshing}
        >
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Active Pads" value={padSummary.length} icon={Building2} color="primary" loading={loading} />
        <StatCard label="Devices Online" value={activePads} icon={Cpu} color="success" loading={loading} />
        <StatCard label="Pending Payments" value={pendingPayments.length} icon={CreditCard}
          color={pendingPayments.length > 0 ? "warning" : "default"} loading={loading} />
        <StatCard label="Anomalies (month)" value={totalAnomaly} icon={AlertTriangle}
          color={totalAnomaly > 0 ? "danger" : "default"} loading={loading} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Pad Summary table */}
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
                    {padSummary.map((p: PadSummaryRow) => (
                      <tr key={p.id}
                        className={`border-b border-default-100 hover:bg-default-50 transition-colors cursor-pointer ${displayPad?.id === p.id ? "bg-primary/5" : ""}`}
                        onClick={() => setSelectedPad(p.id)}>
                        <td className="py-3 px-3 font-medium text-foreground">{p.name}</td>
                        <td className="py-3 px-3 text-default-500">{p.tenant_name ?? "—"}</td>
                        <td className="py-3 px-3">
                          {p.device_serial
                            ? <Chip size="sm" variant="flat" color="success">{p.device_serial}</Chip>
                            : <span className="text-default-400">—</span>}
                        </td>
                        <td className="py-3 px-3 text-default-600 font-mono">{Number(p.energy_kwh).toFixed(2)} kWh</td>
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
                {pendingPayments.slice(0, 6).map((p: { id: number; tenant_name?: string; amount: number }) => (
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

      {/* ── Per-pad daily consumption chart ──────────────────────────────────── */}
      {!loading && padSummary.length > 0 && (
        <Card className="border border-default-200">
          <CardHeader className="flex items-start justify-between gap-3 pb-0 flex-wrap">
            <div className="flex items-center gap-2">
              <LineChartIcon className="w-5 h-5 text-primary" />
              <h2 className="font-semibold text-foreground">Daily Consumption — {month}</h2>
            </div>
            {/* Pad selector tabs */}
            <div className="flex gap-1.5 flex-wrap">
              {padSummary.map((p: PadSummaryRow) => (
                <Button key={p.id} size="sm"
                  variant={displayPad?.id === p.id ? "solid" : "flat"}
                  color={displayPad?.id === p.id ? "primary" : "default"}
                  onPress={() => setSelectedPad(p.id)}>
                  {p.name}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardBody>
            {displayPad ? (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-default-500">
                    {displayPad.tenant_name ? `Tenant: ${displayPad.tenant_name}` : "No tenant assigned"}
                    {displayPad.device_serial && <span className="ml-2 font-mono text-xs text-primary">· {displayPad.device_serial}</span>}
                  </p>
                  <Chip size="sm" variant="flat" color="primary">
                    {Number(displayPad.energy_kwh).toFixed(2)} kWh this month
                  </Chip>
                </div>
                <PadChart pad={displayPad} month={month} />
              </div>
            ) : (
              <p className="text-default-400 text-sm text-center py-8">Select a pad to view consumption</p>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
