"use client";

import { useEffect, useState, useCallback } from "react";
import { addToast } from "@heroui/toast";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { BarChart3, RefreshCw, Download } from "lucide-react";
import { reportsApi, devicesApi, getErrorMessage } from "@/lib/api";
import { Device, DailyAggregate } from "@/types";
import { TableSkeleton } from "@/components/shared/PageLoader";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function ReportsPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<number | null>(null);
  const [daily, setDaily] = useState<DailyAggregate[]>([]);
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));

  useEffect(() => {
    devicesApi.list().then(r => {
      const d = r.data.data?.devices ?? [];
      setDevices(d);
      if (d.length > 0) setSelectedDevice(d[0].id);
    }).catch(() => {});
  }, []);

  const load = useCallback(async (deviceId: number, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await reportsApi.daily(deviceId, month);
      setDaily(res.data.data?.days ?? []);
    } catch (err) {
      addToast({ title: "Failed to load report", description: getErrorMessage(err), color: "danger" });
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    if (selectedDevice) load(selectedDevice);
  }, [selectedDevice, load]);

  async function handleExport() {
    if (!selectedDevice) return;
    try {
      const res = await reportsApi.exportCsv(selectedDevice);
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `report-device-${selectedDevice}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      addToast({ title: "Export failed", description: getErrorMessage(err), color: "danger" });
    }
  }

  const totalKwh = daily.reduce((s, d) => s + d.total_energy_kwh, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reports</h1>
          <p className="text-default-500 text-sm mt-0.5">Daily energy consumption</p>
        </div>
        <div className="flex gap-2 items-center">
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="px-3 py-2 rounded-xl bg-content2 border border-default-200 text-sm text-foreground focus:outline-none focus:border-primary" />
          <Button variant="flat" size="sm" startContent={<Download className="w-4 h-4" />} onPress={handleExport}>Export CSV</Button>
          <Button variant="flat" size="sm" startContent={<RefreshCw className="w-4 h-4" />}
            onPress={() => selectedDevice && load(selectedDevice, true)}>Refresh</Button>
        </div>
      </div>

      {/* Device selector */}
      <div className="flex gap-2 flex-wrap">
        {devices.map(d => (
          <Button key={d.id} size="sm"
            variant={selectedDevice === d.id ? "solid" : "flat"}
            color={selectedDevice === d.id ? "primary" : "default"}
            onPress={() => setSelectedDevice(d.id)}>
            {d.name}
          </Button>
        ))}
      </div>

      {/* Chart */}
      <Card className="border border-default-200">
        <CardHeader className="flex items-center gap-2 pb-0">
          <BarChart3 className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-foreground">Daily Energy — {month}</h2>
          <span className="ml-auto text-sm text-default-500">{totalKwh.toFixed(2)} kWh total</span>
        </CardHeader>
        <CardBody>
          {loading ? <div className="h-64 flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div> : daily.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center">
              <BarChart3 className="w-10 h-10 text-default-300 mb-3" />
              <p className="text-default-400">{selectedDevice ? "No data for this period" : "Select a device"}</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={daily} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={v => v.slice(5)} />
                <YAxis tick={{ fontSize: 11, fill: "#64748b" }} unit=" kWh" />
                <Tooltip formatter={(v: number) => [`${v.toFixed(3)} kWh`, "Energy"]}
                  contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }} />
                <Bar dataKey="total_energy_kwh" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardBody>
      </Card>

      {/* Table */}
      {!loading && daily.length > 0 && (
        <Card className="border border-default-200">
          <CardBody>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-default-200">
                    {["Date", "Energy (kWh)", "Avg Power (W)", "Avg Voltage (V)", "Anomalies"].map(h => (
                      <th key={h} className="text-left py-2 px-3 text-default-500 font-medium text-xs uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {daily.map(d => (
                    <tr key={d.date} className="border-b border-default-100 hover:bg-default-50">
                      <td className="py-2 px-3 text-default-500">{d.date}</td>
                      <td className="py-2 px-3 font-mono text-xs">{Number(d.total_energy_kwh).toFixed(3)}</td>
                      <td className="py-2 px-3 font-mono text-xs">{Number(d.avg_power).toFixed(1)}</td>
                      <td className="py-2 px-3 font-mono text-xs">{Number(d.avg_voltage).toFixed(1)}</td>
                      <td className="py-2 px-3">{d.anomaly_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
