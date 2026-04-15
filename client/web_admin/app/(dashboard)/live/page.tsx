"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { toast } from "@/lib/toast";
import { modalClassNames } from "@/lib/modal-styles";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Button } from "@heroui/button";
import { MonitorDot, Zap, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { devicesApi, powerApi, getErrorMessage } from "@/lib/api";
import { Device, PowerReading } from "@/types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

interface LiveReading {
  voltage_rms: number;
  current_rms: number;
  power_real: number;
  power_apparent: number;
  power_factor: number;
  energy_kwh?: number;
  frequency?: number;
  timestamp: string;
}

export default function LivePage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<number | null>(null);
  const [reading, setReading] = useState<LiveReading | null>(null);
  const [connected, setConnected] = useState(false);
  const [relayPending, setRelayPending] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    devicesApi.list().then(r => {
      const d = r.data.data?.devices ?? [];
      setDevices(d);
      if (d.length > 0) setSelectedDevice(d[0].id);
    }).catch(() => {});
  }, []);

  const connectSSE = useCallback((deviceId: number) => {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    setConnected(false);

    const token = typeof window !== "undefined" ? localStorage.getItem("bw_token") : null;
    const url = `${BASE_URL}/sse/events${token ? `?token=${token}` : ""}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener("power_reading", (e) => {
      try {
        const d = JSON.parse(e.data);
        setReading(d);
        setConnected(true);
      } catch {}
    });

    es.addEventListener("relay_state", () => { devicesApi.list().then(r => setDevices(r.data.data?.devices ?? [])).catch(() => {}); });
    es.onerror = () => setConnected(false);

    return () => { es.close(); };
  }, []);

  useEffect(() => {
    if (!selectedDevice) return;

    // Load latest reading immediately
    powerApi.latest(selectedDevice).then(r => {
      const d = r.data.data?.reading;
      if (d) setReading(d);
    }).catch(() => {});

    const cleanup = connectSSE(selectedDevice);
    return cleanup;
  }, [selectedDevice, connectSSE]);

  useEffect(() => () => { esRef.current?.close(); }, []);

  async function handleRelay(command: "on" | "off") {
    if (!selectedDevice) return;
    setRelayPending(true);
    try {
      await devicesApi.issueRelayCommand(selectedDevice, command);
      toast.success(`Relay ${command.toUpperCase()} sent`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setRelayPending(false);
    }
  }

  const device = devices.find(d => d.id === selectedDevice);

  const metricCard = (label: string, value: string, unit: string, color = "text-foreground") => (
    <Card className="border border-default-200">
      <CardBody className="text-center py-5">
        <p className="text-xs text-default-400 uppercase tracking-wide mb-1">{label}</p>
        <p className={`text-3xl font-bold ${color}`}>{value}</p>
        <p className="text-xs text-default-400 mt-1">{unit}</p>
      </CardBody>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">Live Monitor</h1>
          <Chip size="sm" color={connected ? "success" : "default"} variant="flat"
            startContent={connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}>
            {connected ? "Live" : "Connecting..."}
          </Chip>
        </div>
        <Button variant="flat" size="sm" startContent={<RefreshCw className="w-4 h-4" />}
          onPress={() => selectedDevice && connectSSE(selectedDevice)}>Reconnect</Button>
      </div>

      {/* Device tabs */}
      <div className="flex gap-2 flex-wrap">
        {devices.map(d => (
          <Button key={d.id} size="sm"
            variant={selectedDevice === d.id ? "solid" : "flat"}
            color={selectedDevice === d.id ? "primary" : "default"}
            onPress={() => setSelectedDevice(d.id)}>
            {d.device_name}
          </Button>
        ))}
      </div>

      {/* Relay control */}
      {device && (
        <Card className="border border-default-200">
          <CardBody className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap className="w-5 h-5 text-primary" />
              <span className="font-medium text-foreground">Relay — {device.device_name}</span>
              <Chip size="sm" variant="flat"
                color={device.relay_status === "on" ? "success" : device.relay_status === "off" ? "default" : "warning"}>
                {device.relay_status ?? "unknown"}
              </Chip>
            </div>
            <div className="flex gap-2">
              <Button size="sm" color="success" variant="flat" isLoading={relayPending}
                onPress={() => handleRelay("on")}>ON</Button>
              <Button size="sm" color="danger" variant="flat" isLoading={relayPending}
                onPress={() => handleRelay("off")}>OFF</Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Live metrics */}
      {reading ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {metricCard("Voltage", Number(reading.voltage_rms).toFixed(1), "V", "text-blue-400")}
            {metricCard("Current", Number(reading.current_rms).toFixed(3), "A", "text-green-400")}
            {metricCard("Active Power", Number(reading.power_real).toFixed(1), "W", "text-yellow-400")}
            {metricCard("Apparent Power", Number(reading.power_apparent).toFixed(1), "VA")}
            {metricCard("Power Factor", Number(reading.power_factor).toFixed(2), "")}
            {metricCard("Frequency", Number(reading.frequency ?? 0).toFixed(1), "Hz")}
          </div>
          {reading.energy_kwh !== undefined && (
            <Card className="border border-default-200">
              <CardBody className="text-center py-4">
                <p className="text-xs text-default-400 uppercase tracking-wide mb-1">Meter Reading</p>
                <p className="text-4xl font-bold text-primary">{Number(reading.energy_kwh).toFixed(3)}</p>
                <p className="text-xs text-default-400 mt-1">kWh — cumulative since device start</p>
              </CardBody>
            </Card>
          )}
          <p className="text-xs text-default-400 text-center">
            Last updated: {new Date(reading.timestamp).toLocaleTimeString()}
          </p>
        </>
      ) : (
        <Card className="border border-default-200">
          <CardBody className="flex flex-col items-center py-16">
            <MonitorDot className="w-12 h-12 text-default-300 mb-3" />
            <p className="text-default-400">{selectedDevice ? "Waiting for data..." : "Select a device"}</p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
