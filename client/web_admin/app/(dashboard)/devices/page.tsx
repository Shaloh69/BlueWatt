"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Input, Textarea } from "@heroui/input";
import { Tooltip } from "@heroui/tooltip";
import {
  Cpu, Plus, RefreshCw, Wifi, WifiOff, ToggleLeft, ToggleRight,
  Pencil, Building2, User, MapPin, Info, Trash2,
} from "lucide-react";
import { devicesApi, padsApi, getErrorMessage } from "@/lib/api";
import { Device, Pad } from "@/types";
import { TableSkeleton } from "@/components/shared/PageLoader";
import { toast } from "@/lib/toast";
import { modalClassNames } from "@/lib/modal-styles";

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [pads, setPads]       = useState<Pad[]>([]);
  const [loading, setLoading] = useState(true);

  // Register modal
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [form, setForm]       = useState({ device_id: "", device_name: "", location: "", description: "" });

  // Edit modal
  const [editTarget, setEditTarget] = useState<Device | null>(null);
  const [editForm, setEditForm]     = useState({ device_name: "", location: "", description: "" });
  const [editSaving, setEditSaving] = useState(false);

  // Detail modal
  const [detailDevice, setDetailDevice] = useState<Device | null>(null);

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState<Device | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [dRes, pRes] = await Promise.all([devicesApi.list(), padsApi.list()]);
      setDevices(dRes.data.data?.devices ?? []);
      setPads(pRes.data.data?.pads ?? []);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /** Find pads linked to a device */
  const linkedPads = (device: Device): Pad[] =>
    pads.filter(p => p.device_id === device.id);

  const isOnline = (d: Device) =>
    !!d.last_seen_at && Date.now() - new Date(d.last_seen_at).getTime() < 2 * 60 * 1000;

  async function handleRelay(device: Device, command: "on" | "off") {
    try {
      await devicesApi.issueRelayCommand(device.id, command);
      toast.success(`Relay ${command.toUpperCase()} sent to ${device.device_name}`);
      setTimeout(() => load(true), 1500);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  async function handleRegister() {
    if (!form.device_id.trim() || !form.device_name.trim()) {
      toast.warning("Device ID and name are required");
      return;
    }
    setSaving(true);
    try {
      const res = await devicesApi.register({
        device_id: form.device_id.trim(),
        device_name: form.device_name.trim(),
        location: form.location.trim() || undefined,
        description: form.description.trim() || undefined,
      });
      toast.success(`Device "${form.device_name}" registered`);
      if (res.data.data?.api_key) {
        // Show the API key — it won't be shown again
        const key = res.data.data.api_key as string;
        setTimeout(() => {
          window.alert(`Save this API key — it will not be shown again:\n\n${key}`);
        }, 300);
      }
      setShowAdd(false);
      setForm({ device_id: "", device_name: "", location: "", description: "" });
      load(true);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function openEdit(device: Device) {
    setEditTarget(device);
    setEditForm({
      device_name:  device.device_name,
      location:     device.location ?? "",
      description:  device.description ?? "",
    });
  }

  async function handleEdit() {
    if (!editTarget) return;
    if (!editForm.device_name.trim()) { toast.warning("Name is required"); return; }
    setEditSaving(true);
    try {
      await devicesApi.update(editTarget.id, {
        device_name:  editForm.device_name.trim(),
        location:     editForm.location.trim() || null,
        description:  editForm.description.trim() || null,
      });
      toast.success("Device updated");
      setEditTarget(null);
      load(true);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await devicesApi.delete(confirmDelete.id);
      toast.success(`Device "${confirmDelete.device_name}" deleted`);
      setConfirmDelete(null);
      load(true);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  const relayColor = (s?: string) =>
    s === "on" ? "success" : s === "off" ? "default" : s === "tripped" ? "danger" : "warning";

  return (
    <div className="space-y-6">
      {/* Header */}
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

      {/* Device cards */}
      {loading ? (
        <Card className="border border-default-200">
          <CardBody><TableSkeleton rows={4} cols={6} /></CardBody>
        </Card>
      ) : devices.length === 0 ? (
        <Card className="border border-default-200">
          <CardBody className="flex flex-col items-center py-16 text-center">
            <Cpu className="w-12 h-12 text-default-300 mb-3" />
            <p className="text-default-400">No devices registered yet</p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {devices.map(d => {
            const online = isOnline(d);
            const padsForDevice = linkedPads(d);
            const activePad = padsForDevice[0] ?? null;
            return (
              <Card key={d.id} className="border border-default-200 hover:border-primary/40 transition-colors">
                <CardHeader className="flex items-start justify-between gap-3 pb-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${online ? "bg-primary/15" : "bg-default-100"}`}>
                      <Cpu className={`w-5 h-5 ${online ? "text-primary" : "text-default-400"}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">{d.device_name}</p>
                      <p className="text-xs font-mono text-default-400">{d.device_id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Chip size="sm" variant="flat" color={online ? "success" : "default"}
                      startContent={online ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}>
                      {online ? "Online" : "Offline"}
                    </Chip>
                    <Chip size="sm" variant="flat" color={relayColor(d.relay_status)}>
                      {d.relay_status ?? "unknown"}
                    </Chip>
                  </div>
                </CardHeader>

                <CardBody className="pt-1 space-y-3">
                  {/* Active pad / module */}
                  <div className="rounded-xl bg-default-50 border border-default-200 px-3 py-2.5">
                    <p className="text-xs text-default-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                      <Building2 className="w-3 h-3" /> Active Module / Pad
                    </p>
                    {activePad ? (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">{activePad.name}</p>
                          <p className="text-xs text-default-400">₱{Number(activePad.rate_per_kwh).toFixed(2)}/kWh</p>
                        </div>
                        <Chip size="sm" variant="flat" color={activePad.is_active ? "success" : "default"}>
                          {activePad.is_active ? "Active" : "Inactive"}
                        </Chip>
                      </div>
                    ) : (
                      <p className="text-sm text-default-400 italic">Not assigned to any pad</p>
                    )}
                  </div>

                  {/* Linked accounts */}
                  <div className="rounded-xl bg-default-50 border border-default-200 px-3 py-2.5">
                    <p className="text-xs text-default-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                      <User className="w-3 h-3" /> Connected Accounts
                    </p>
                    {padsForDevice.filter(p => p.tenant_name).length > 0 ? (
                      <div className="space-y-1">
                        {padsForDevice.filter(p => p.tenant_name).map(p => (
                          <div key={p.id} className="flex items-center justify-between">
                            <p className="text-sm text-foreground">{p.tenant_name}</p>
                            <p className="text-xs text-default-400">{p.name}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-default-400 italic">No tenants linked</p>
                    )}
                  </div>

                  {/* Location */}
                  {d.location && (
                    <p className="text-xs text-default-400 flex items-center gap-1.5">
                      <MapPin className="w-3 h-3 shrink-0" /> {d.location}
                    </p>
                  )}

                  {/* Last seen + firmware */}
                  <div className="flex items-center justify-between text-xs text-default-400">
                    <span>Last seen: {d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : "Never"}</span>
                    {d.firmware_version && <span>fw {d.firmware_version}</span>}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-1 border-t border-default-200">
                    <Tooltip content="Relay ON" classNames={{ content: "bg-slate-800 text-white border border-white/10 text-xs" }}>
                      <Button size="sm" variant="flat" color="success" isIconOnly onPress={() => handleRelay(d, "on")}>
                        <ToggleRight className="w-4 h-4" />
                      </Button>
                    </Tooltip>
                    <Tooltip content="Relay OFF" classNames={{ content: "bg-slate-800 text-white border border-white/10 text-xs" }}>
                      <Button size="sm" variant="flat" color="default" isIconOnly onPress={() => handleRelay(d, "off")}>
                        <ToggleLeft className="w-4 h-4" />
                      </Button>
                    </Tooltip>
                    <Tooltip content="Rename / Edit" classNames={{ content: "bg-slate-800 text-white border border-white/10 text-xs" }}>
                      <Button size="sm" variant="flat" color="primary" isIconOnly onPress={() => openEdit(d)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </Tooltip>
                    <Tooltip content="Details" classNames={{ content: "bg-slate-800 text-white border border-white/10 text-xs" }}>
                      <Button size="sm" variant="flat" color="default" isIconOnly onPress={() => setDetailDevice(d)}>
                        <Info className="w-4 h-4" />
                      </Button>
                    </Tooltip>
                    <Tooltip content="Delete Device" classNames={{ content: "bg-slate-800 text-white border border-white/10 text-xs" }}>
                      <Button size="sm" variant="flat" color="danger" isIconOnly onPress={() => setConfirmDelete(d)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </Tooltip>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Register Modal ── */}
      <Modal isOpen={showAdd} onOpenChange={setShowAdd} classNames={modalClassNames}>
        <ModalContent>
          <ModalHeader>Register New Device</ModalHeader>
          <ModalBody className="space-y-3">
            <Input label="Device ID" placeholder="bluewatt-001" value={form.device_id}
              onValueChange={v => setForm(f => ({ ...f, device_id: v }))}
              description="Unique hardware identifier — must match the ESP32 config" />
            <Input label="Name" placeholder="Unit 1A Meter" value={form.device_name}
              onValueChange={v => setForm(f => ({ ...f, device_name: v }))} />
            <Input label="Location (optional)" placeholder="Room 101, Building A" value={form.location}
              onValueChange={v => setForm(f => ({ ...f, location: v }))} />
            <Textarea label="Description (optional)" value={form.description}
              onValueChange={v => setForm(f => ({ ...f, description: v }))} />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setShowAdd(false)}>Cancel</Button>
            <Button color="primary" isLoading={saving} onPress={handleRegister}>Register</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── Edit / Rename Modal ── */}
      <Modal isOpen={!!editTarget} onOpenChange={() => setEditTarget(null)} classNames={modalClassNames}>
        <ModalContent>
          <ModalHeader>Edit Device — {editTarget?.device_id}</ModalHeader>
          <ModalBody className="space-y-3">
            <Input label="Name" value={editForm.device_name}
              onValueChange={v => setEditForm(f => ({ ...f, device_name: v }))} />
            <Input label="Location" placeholder="Room 101, Building A" value={editForm.location}
              onValueChange={v => setEditForm(f => ({ ...f, location: v }))} />
            <Textarea label="Description" value={editForm.description}
              onValueChange={v => setEditForm(f => ({ ...f, description: v }))} />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setEditTarget(null)}>Cancel</Button>
            <Button color="primary" isLoading={editSaving} onPress={handleEdit}>Save Changes</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── Detail Modal ── */}
      <Modal isOpen={!!detailDevice} onOpenChange={() => setDetailDevice(null)} classNames={modalClassNames}>
        <ModalContent>
          <ModalHeader>Device Details</ModalHeader>
          <ModalBody className="space-y-4">
            {detailDevice && (() => {
              const padsForDevice = linkedPads(detailDevice);
              return (
                <>
                  <div className="space-y-2 text-sm">
                    {[
                      ["Device ID",   detailDevice.device_id],
                      ["Name",        detailDevice.device_name],
                      ["Location",    detailDevice.location ?? "—"],
                      ["Firmware",    detailDevice.firmware_version ?? "—"],
                      ["Relay",       detailDevice.relay_status ?? "unknown"],
                      ["Status",      detailDevice.is_active ? "Active" : "Inactive"],
                      ["Last Seen",   detailDevice.last_seen_at ? new Date(detailDevice.last_seen_at).toLocaleString() : "Never"],
                      ["Registered",  new Date(detailDevice.created_at).toLocaleDateString()],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between border-b border-default-100 pb-1.5">
                        <span className="text-default-400">{k}</span>
                        <span className="text-foreground font-medium font-mono text-xs text-right max-w-[60%] truncate">{v}</span>
                      </div>
                    ))}
                  </div>

                  <div>
                    <p className="text-xs text-default-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <Building2 className="w-3 h-3" /> Linked Pads ({padsForDevice.length})
                    </p>
                    {padsForDevice.length === 0 ? (
                      <p className="text-sm text-default-400 italic">Not assigned to any pad</p>
                    ) : (
                      <div className="space-y-2">
                        {padsForDevice.map(p => (
                          <div key={p.id} className="rounded-lg bg-default-50 border border-default-200 px-3 py-2">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="text-sm font-medium text-foreground">{p.name}</p>
                                <p className="text-xs text-default-400">
                                  ₱{Number(p.rate_per_kwh).toFixed(2)}/kWh
                                  {p.description ? ` · ${p.description}` : ""}
                                </p>
                              </div>
                              <Chip size="sm" variant="flat" color={p.is_active ? "success" : "default"}>
                                {p.is_active ? "Active" : "Inactive"}
                              </Chip>
                            </div>
                            {p.tenant_name && (
                              <p className="text-xs text-primary mt-1.5 flex items-center gap-1">
                                <User className="w-3 h-3" /> {p.tenant_name}
                                {p.tenant_email ? ` · ${p.tenant_email}` : ""}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setDetailDevice(null)}>Close</Button>
            <Button color="primary" variant="flat" onPress={() => { openEdit(detailDevice!); setDetailDevice(null); }}
              startContent={<Pencil className="w-4 h-4" />}>
              Edit
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      {/* ── Delete Confirm Modal ── */}
      <Modal isOpen={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)} classNames={modalClassNames}>
        <ModalContent>
          <ModalHeader>Delete Device</ModalHeader>
          <ModalBody>
            <p className="text-sm text-default-600">
              Are you sure you want to delete <span className="font-semibold text-foreground">{confirmDelete?.device_name}</span>?
            </p>
            <p className="text-xs text-warning mt-1">
              This will permanently remove the device and all associated data. This action cannot be undone.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setConfirmDelete(null)}>Cancel</Button>
            <Button color="danger" isLoading={deleting} onPress={handleDelete}>Delete</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
