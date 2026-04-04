"use client";

import { useEffect, useState, useCallback } from "react";
import { Avatar } from "@heroui/avatar";
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Input } from "@heroui/input";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import {
  Users, Plus, RefreshCw, Cpu, Trash2, MapPin,
  Wifi, WifiOff, ChevronRight,
} from "lucide-react";
import { adminApi, devicesApi, getErrorMessage } from "@/lib/api";
import { Tenant, Device } from "@/types";
import { toast } from "@/lib/toast";
import { modalClassNames } from "@/lib/modal-styles";
import { TableSkeleton } from "@/components/shared/PageLoader";

// ── Helpers ───────────────────────────────────────────────────────────────────

function isDeviceOnline(lastSeen?: string) {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 2 * 60 * 1000;
}

function initials(name: string) {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ── Device card picker ────────────────────────────────────────────────────────

function DeviceCard({
  device,
  selected,
  onSelect,
}: {
  device: Device;
  selected: boolean;
  onSelect: () => void;
}) {
  const online = isDeviceOnline(device.last_seen_at);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "w-full text-left p-4 rounded-xl border-2 transition-all duration-150",
        selected
          ? "border-primary bg-primary/10 shadow-md shadow-primary/20"
          : "border-default-200 bg-content2 hover:border-primary/50 hover:bg-content2/80",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div
          className={[
            "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
            selected ? "bg-primary/20" : "bg-default-200",
          ].join(" ")}
        >
          <Cpu className={["w-5 h-5", selected ? "text-primary" : "text-default-400"].join(" ")} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-foreground text-sm truncate">{device.device_name}</p>
            <span
              className={[
                "w-2 h-2 rounded-full shrink-0",
                online ? "bg-success" : "bg-default-400",
              ].join(" ")}
            />
          </div>
          <p className="text-xs text-default-400 font-mono mt-0.5">{device.device_id}</p>
          {device.location && (
            <div className="flex items-center gap-1 mt-1">
              <MapPin className="w-3 h-3 text-default-400 shrink-0" />
              <p className="text-xs text-default-400 truncate">{device.location}</p>
            </div>
          )}
        </div>

        <div className="shrink-0">
          {online ? (
            <Wifi className="w-4 h-4 text-success" />
          ) : (
            <WifiOff className="w-4 h-4 text-default-400" />
          )}
        </div>
      </div>

      {selected && (
        <div className="mt-2 pt-2 border-t border-primary/20">
          <p className="text-xs text-primary font-medium">Selected — this tenant will be linked to this ESP</p>
        </div>
      )}
    </button>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Tenant | null>(null);

  // Create form
  const [form, setForm] = useState({
    email: "",
    full_name: "",
    password: "",
    pad_name: "",
    rate_per_kwh: "11.50",
  });
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const [step, setStep] = useState<1 | 2>(1);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [tRes, dRes] = await Promise.all([
        adminApi.listTenants(),
        devicesApi.list(),
      ]);
      setTenants(tRes.data.data?.tenants ?? []);
      setDevices(dRes.data.data?.devices ?? []);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function resetCreate() {
    setForm({ email: "", full_name: "", password: "", pad_name: "", rate_per_kwh: "11.50" });
    setSelectedDeviceId(null);
    setStep(1);
    setShowCreate(false);
  }

  function handleField(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function handleCreate() {
    if (!form.email.trim() || !form.full_name.trim() || !form.password) {
      toast.warning("Email, name and password are required");
      return;
    }
    if (form.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setSaving(true);
    try {
      await adminApi.createTenant({
        email: form.email.trim(),
        full_name: form.full_name.trim(),
        password: form.password,
        pad_name: form.pad_name.trim() || undefined,
        rate_per_kwh: form.pad_name.trim() ? parseFloat(form.rate_per_kwh) : undefined,
        device_id: selectedDeviceId ?? undefined,
      });
      toast.success(`Tenant "${form.full_name}" created`);
      resetCreate();
      load(true);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(tenant: Tenant) {
    try {
      await adminApi.deleteTenant(tenant.id);
      toast.info(`${tenant.full_name} removed`);
      setConfirmDelete(null);
      load(true);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  // Step 1 validation
  const step1Valid = form.email.trim() && form.full_name.trim() && form.password.length >= 8;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tenants</h1>
          <p className="text-default-500 text-sm mt-0.5">{tenants.length} account{tenants.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="flat" size="sm" startContent={<RefreshCw className="w-4 h-4" />} onPress={() => load(true)}>
            Refresh
          </Button>
          <Button color="primary" size="sm" startContent={<Plus className="w-4 h-4" />} onPress={() => setShowCreate(true)}>
            Create Tenant
          </Button>
        </div>
      </div>

      {/* Tenant list */}
      <Card className="border border-default-200">
        <CardHeader className="flex items-center gap-2 pb-0">
          <Users className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-foreground">All Tenants</h2>
        </CardHeader>
        <CardBody>
          {loading ? (
            <TableSkeleton rows={4} cols={5} />
          ) : tenants.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Users className="w-10 h-10 text-default-300 mb-3" />
              <p className="text-default-400 font-medium">No tenants yet</p>
              <p className="text-default-300 text-sm mt-1">Create your first tenant account above</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tenants.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 p-3 rounded-xl border border-default-100 hover:bg-default-50 transition-colors"
                >
                  <Avatar name={t.full_name} src={t.profile_image_url} color="primary" size="sm" />

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground text-sm truncate">{t.full_name}</p>
                    <p className="text-xs text-default-400 truncate">{t.email}</p>
                  </div>

                  {/* Pad */}
                  <div className="hidden sm:flex flex-col items-end gap-0.5 min-w-0">
                    {t.pad_name ? (
                      <>
                        <Chip size="sm" variant="flat" color="primary" className="text-xs">{t.pad_name}</Chip>
                        <p className="text-[10px] text-default-400">₱{Number(t.rate_per_kwh).toFixed(2)}/kWh</p>
                      </>
                    ) : (
                      <Chip size="sm" variant="flat" color="default" className="text-xs">No pad</Chip>
                    )}
                  </div>

                  {/* Device */}
                  <div className="hidden md:flex items-center gap-1.5 min-w-[120px]">
                    {t.device_serial ? (
                      <>
                        <Cpu className="w-3.5 h-3.5 text-primary shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs text-foreground truncate">{t.device_name}</p>
                          <p className="text-[10px] font-mono text-default-400 truncate">{t.device_serial}</p>
                        </div>
                        <span
                          className={[
                            "w-2 h-2 rounded-full shrink-0",
                            isDeviceOnline(undefined) ? "bg-success" : "bg-default-400",
                          ].join(" ")}
                        />
                      </>
                    ) : (
                      <span className="text-xs text-default-400">No device</span>
                    )}
                  </div>

                  {/* Last login */}
                  <div className="hidden lg:block text-right shrink-0">
                    <p className="text-[10px] text-default-400">
                      {t.last_login_at
                        ? new Date(t.last_login_at).toLocaleDateString()
                        : "Never logged in"}
                    </p>
                  </div>

                  <Button
                    size="sm" isIconOnly variant="light" color="danger"
                    title="Delete tenant"
                    onPress={() => setConfirmDelete(t)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* ── Create Tenant Modal ── */}
      <Modal
        isOpen={showCreate}
        onOpenChange={(open) => { if (!open) resetCreate(); }}
        size="2xl"
        scrollBehavior="inside"
        classNames={modalClassNames}
      >
        <ModalContent>
          <ModalHeader>
            <div className="flex items-center gap-2">
              <span>Create Tenant</span>
              <Chip size="sm" variant="flat" color="primary">Step {step} of 2</Chip>
            </div>
          </ModalHeader>

          <ModalBody>
            {step === 1 ? (
              /* ── Step 1: Account details ── */
              <div className="space-y-4">
                <p className="text-sm text-default-400">Enter the tenant&apos;s account credentials.</p>
                <Input
                  label="Full Name"
                  placeholder="Juan dela Cruz"
                  value={form.full_name}
                  onChange={handleField("full_name")}
                  variant="bordered"
                  autoFocus
                />
                <Input
                  label="Email Address"
                  type="email"
                  placeholder="tenant@example.com"
                  value={form.email}
                  onChange={handleField("email")}
                  variant="bordered"
                />
                <Input
                  label="Password"
                  type="password"
                  placeholder="Min. 8 characters"
                  value={form.password}
                  onChange={handleField("password")}
                  variant="bordered"
                  isInvalid={!!form.password && form.password.length < 8}
                  errorMessage="At least 8 characters"
                />

                <div className="border-t border-default-200 pt-4">
                  <p className="text-sm text-default-500 font-medium mb-3">Unit / Pad (optional)</p>
                  <p className="text-xs text-default-400 mb-3">
                    Fill this in to create a unit for this tenant. Leave blank to assign later from the Pads page.
                  </p>
                  <Input
                    label="Unit Name"
                    placeholder="e.g. Unit 2A"
                    value={form.pad_name}
                    onChange={handleField("pad_name")}
                    variant="bordered"
                  />
                  {form.pad_name.trim() && (
                    <Input
                      className="mt-3"
                      label="Rate per kWh (₱)"
                      type="number"
                      step="0.01"
                      value={form.rate_per_kwh}
                      onChange={handleField("rate_per_kwh")}
                      variant="bordered"
                    />
                  )}
                </div>
              </div>
            ) : (
              /* ── Step 2: ESP Device picker ── */
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-default-400">
                    Select which ESP meter to link <span className="text-foreground font-medium">{form.full_name}</span> to.
                    {" "}Multiple tenants can share the same device.
                  </p>
                  {selectedDeviceId && (
                    <p className="text-xs text-primary mt-1">
                      ✓ Device selected — tenant will monitor readings from this ESP
                    </p>
                  )}
                </div>

                {/* No device option */}
                <button
                  type="button"
                  onClick={() => setSelectedDeviceId(null)}
                  className={[
                    "w-full text-left p-4 rounded-xl border-2 transition-all",
                    selectedDeviceId === null
                      ? "border-default-400 bg-default-100"
                      : "border-default-200 bg-content2 hover:border-default-400",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-default-200 flex items-center justify-center">
                      <WifiOff className="w-5 h-5 text-default-400" />
                    </div>
                    <div>
                      <p className="font-medium text-sm text-foreground">No device for now</p>
                      <p className="text-xs text-default-400">Assign an ESP later from the Pads page</p>
                    </div>
                  </div>
                </button>

                {/* Device cards */}
                {devices.length === 0 ? (
                  <div className="flex flex-col items-center py-8 text-center border border-default-200 rounded-xl">
                    <Cpu className="w-8 h-8 text-default-300 mb-2" />
                    <p className="text-default-400 text-sm">No devices registered yet</p>
                    <p className="text-default-300 text-xs mt-1">Register an ESP first from the Devices page</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {devices.map((d) => (
                      <DeviceCard
                        key={d.id}
                        device={d}
                        selected={selectedDeviceId === d.id}
                        onSelect={() => setSelectedDeviceId(d.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </ModalBody>

          <ModalFooter>
            <Button variant="flat" onPress={step === 1 ? resetCreate : () => setStep(1)}>
              {step === 1 ? "Cancel" : "Back"}
            </Button>

            {step === 1 ? (
              <Button
                color="primary"
                isDisabled={!step1Valid}
                endContent={<ChevronRight className="w-4 h-4" />}
                onPress={() => setStep(2)}
              >
                Next — Link ESP
              </Button>
            ) : (
              <Button color="primary" isLoading={saving} onPress={handleCreate}>
                {selectedDeviceId ? "Create & Link ESP" : "Create Tenant"}
              </Button>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── Confirm Delete Modal ── */}
      <Modal
        isOpen={!!confirmDelete}
        onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}
        size="sm"
        classNames={modalClassNames}
      >
        <ModalContent>
          <ModalHeader>Remove Tenant</ModalHeader>
          <ModalBody>
            <p className="text-default-400 text-sm">
              Are you sure you want to remove{" "}
              <span className="text-foreground font-semibold">{confirmDelete?.full_name}</span>?
              Their account will be deleted and unassigned from all pads.
              This cannot be undone.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setConfirmDelete(null)}>Cancel</Button>
            <Button color="danger" onPress={() => confirmDelete && handleDelete(confirmDelete)}>
              Delete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
