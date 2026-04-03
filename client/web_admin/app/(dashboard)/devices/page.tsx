"use client";

import { useEffect, useState, useCallback } from "react";
import { addToast } from "@heroui/toast";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Input, Textarea } from "@heroui/input";
import { Cpu, Plus, RefreshCw, Wifi, WifiOff, ToggleLeft, ToggleRight } from "lucide-react";
import { devicesApi, getErrorMessage } from "@/lib/api";
import { Device } from "@/types";
import { TableSkeleton } from "@/components/shared/PageLoader";

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ device_id: "", name: "", description: "" });

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await devicesApi.list();
      setDevices(res.data.data?.devices ?? []);
    } catch (err) {
      addToast({ title: "Failed to load devices", description: getErrorMessage(err), color: "danger" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleRelay(device: Device, command: "on" | "off") {
    try {
      await devicesApi.issueRelayCommand(device.id, command);
      addToast({ title: `Relay command sent: ${command.toUpperCase()}`, color: "success" });
      setTimeout(() => load(true), 1500);
    } catch (err) {
      addToast({ title: "Relay command failed", description: getErrorMessage(err), color: "danger" });
    }
  }

  async function handleRegister() {
    if (!form.device_id.trim() || !form.name.trim()) {
      addToast({ title: "Device ID and name are required", color: "warning" });
      return;
    }
    setSaving(true);
    try {
      await devicesApi.register(form);
      addToast({ title: "Device registered", color: "success" });
      setShowAdd(false);
      setForm({ device_id: "", name: "", description: "" });
      load(true);
    } catch (err) {
      addToast({ title: "Registration failed", description: getErrorMessage(err), color: "danger" });
    } finally {
      setSaving(false);
    }
  }

  const isOnline = (d: Device) => {
    if (!d.last_seen_at) return false;
    return Date.now() - new Date(d.last_seen_at).getTime() < 2 * 60 * 1000;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Devices</h1>
          <p className="text-default-500 text-sm mt-0.5">{devices.length} registered</p>
        </div>
        <div className="flex gap-2">
          <Button variant="flat" size="sm" startContent={<RefreshCw className="w-4 h-4" />} onPress={() => load(true)}>
            Refresh
          </Button>
          <Button color="primary" size="sm" startContent={<Plus className="w-4 h-4" />} onPress={() => setShowAdd(true)}>
            Register Device
          </Button>
        </div>
      </div>

      <Card className="border border-default-200">
        <CardHeader className="flex items-center gap-2 pb-0">
          <Cpu className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-foreground">All Devices</h2>
        </CardHeader>
        <CardBody>
          {loading ? <TableSkeleton rows={4} cols={5} /> : devices.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Cpu className="w-10 h-10 text-default-300 mb-3" />
              <p className="text-default-400">No devices registered yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-default-200">
                    {["Device ID", "Name", "Status", "Relay", "Last Seen", "Actions"].map(h => (
                      <th key={h} className="text-left py-2 px-3 text-default-500 font-medium text-xs uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {devices.map(d => (
                    <tr key={d.id} className="border-b border-default-100 hover:bg-default-50">
                      <td className="py-3 px-3 font-mono text-xs text-default-600">{d.device_id}</td>
                      <td className="py-3 px-3 font-medium text-foreground">{d.name}</td>
                      <td className="py-3 px-3">
                        {isOnline(d)
                          ? <Chip size="sm" color="success" variant="flat" startContent={<Wifi className="w-3 h-3" />}>Online</Chip>
                          : <Chip size="sm" color="default" variant="flat" startContent={<WifiOff className="w-3 h-3" />}>Offline</Chip>}
                      </td>
                      <td className="py-3 px-3">
                        <Chip size="sm" variant="flat" color={d.relay_status === "on" ? "success" : d.relay_status === "off" ? "default" : "warning"}>
                          {d.relay_status ?? "unknown"}
                        </Chip>
                      </td>
                      <td className="py-3 px-3 text-default-400 text-xs">
                        {d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : "Never"}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex gap-1">
                          <Button size="sm" variant="flat" color="success" isIconOnly title="Relay ON"
                            onPress={() => handleRelay(d, "on")}>
                            <ToggleRight className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="flat" color="default" isIconOnly title="Relay OFF"
                            onPress={() => handleRelay(d, "off")}>
                            <ToggleLeft className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Modal isOpen={showAdd} onOpenChange={setShowAdd}>
        <ModalContent>
          <ModalHeader>Register New Device</ModalHeader>
          <ModalBody className="space-y-3">
            <Input label="Device ID" placeholder="bluewatt-001" value={form.device_id}
              onChange={e => setForm(f => ({ ...f, device_id: e.target.value }))} />
            <Input label="Name" placeholder="Unit 1A Meter" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <Textarea label="Description (optional)" value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setShowAdd(false)}>Cancel</Button>
            <Button color="primary" isLoading={saving} onPress={handleRegister}>Register</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
