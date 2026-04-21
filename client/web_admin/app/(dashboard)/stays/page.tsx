"use client";

import { useState } from "react";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Input, Textarea } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { CalendarCheck, Plus, RefreshCw, LogOut, Trash2, Clock, Receipt } from "lucide-react";
import { staysApi, getErrorMessage } from "@/lib/api";
import { Stay } from "@/types";
import { TableSkeleton } from "@/components/shared/PageLoader";
import { toast } from "@/lib/toast";
import { modalClassNames } from "@/lib/modal-styles";
import { useStays, reloadStays, usePads, useTenants } from "@/lib/use-api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDt(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-PH", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function cycleColor(c?: string) {
  return c === "daily" ? "secondary" : "primary";
}

function statusColor(s?: string) {
  return s === "active" ? "success" : "default";
}

/** Duration string from check-in (or check-in → check-out) */
function durationLabel(stay: Stay): string {
  const start = new Date(stay.check_in_at).getTime();
  const end   = stay.check_out_at ? new Date(stay.check_out_at).getTime() : Date.now();
  const mins  = Math.floor((end - start) / 60_000);
  if (mins < 60)  return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  const days = Math.floor(mins / 1440);
  const hrs  = Math.floor((mins % 1440) / 60);
  return hrs > 0 ? `${days}d ${hrs}h` : `${days}d`;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StaysPage() {
  const { data: stays = [], isLoading: loading, isValidating, mutate } = useStays();
  const { data: pads  = [] } = usePads();
  const { data: tenants = [] } = useTenants();

  const [showCheckIn, setShowCheckIn]     = useState(false);
  const [checkOutTarget, setCheckOutTarget] = useState<Stay | null>(null);
  const [deleteTarget, setDeleteTarget]   = useState<Stay | null>(null);
  const [genBillTarget, setGenBillTarget] = useState<Stay | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    pad_id: "",
    tenant_id: "",
    billing_cycle: "monthly" as "daily" | "monthly",
    flat_rate_per_cycle: "0",
    notes: "",
    check_in_at: "",
  });

  // ── Filter ──────────────────────────────────────────────────────────────────
  const [filter, setFilter] = useState<"all" | "active" | "ended">("all");
  const visible = stays.filter((s: Stay) => filter === "all" || s.status === filter);

  const activeCount = stays.filter((s: Stay) => s.status === "active").length;

  // ── Check-in ────────────────────────────────────────────────────────────────
  async function handleCheckIn() {
    if (!form.pad_id || !form.tenant_id) {
      toast.warning("Pad and tenant are required");
      return;
    }
    setSaving(true);
    try {
      await staysApi.checkIn({
        pad_id:              parseInt(form.pad_id),
        tenant_id:           parseInt(form.tenant_id),
        billing_cycle:       form.billing_cycle,
        flat_rate_per_cycle: parseFloat(form.flat_rate_per_cycle) || 0,
        notes:               form.notes || undefined,
        check_in_at:         form.check_in_at || undefined,
      });
      toast.success("Tenant checked in");
      setShowCheckIn(false);
      setForm({ pad_id: "", tenant_id: "", billing_cycle: "monthly", flat_rate_per_cycle: "0", notes: "", check_in_at: "" });
      reloadStays();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  // ── Check-out ────────────────────────────────────────────────────────────────
  async function handleCheckOut() {
    if (!checkOutTarget) return;
    setSaving(true);
    try {
      await staysApi.checkOut(checkOutTarget.id);
      toast.success("Tenant checked out — prorated bill generated");
      setCheckOutTarget(null);
      reloadStays();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  // ── Generate bill ─────────────────────────────────────────────────────────────
  async function handleGenerateBill() {
    if (!genBillTarget) return;
    setSaving(true);
    try {
      const res = await staysApi.generateBill(genBillTarget.id);
      const count = res.data.data?.bills_created as number ?? 0;
      toast.success(count > 0 ? `Generated ${count} bill(s)` : "No new bills — all cycles already billed");
      setGenBillTarget(null);
      reloadStays();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await staysApi.delete(deleteTarget.id);
      toast.success("Stay deleted");
      setDeleteTarget(null);
      reloadStays();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Stays</h1>
          <p className="text-default-500 text-sm mt-0.5">
            {activeCount} active · {stays.length} total
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="flat" size="sm"
            startContent={<RefreshCw className={`w-4 h-4 ${isValidating ? "animate-spin" : ""}`} />}
            onPress={() => mutate()} isDisabled={isValidating}
          >
            Refresh
          </Button>
          <Button color="primary" size="sm" startContent={<Plus className="w-4 h-4" />}
            onPress={() => setShowCheckIn(true)}>
            Check In
          </Button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(["all", "active", "ended"] as const).map(f => (
          <Button key={f} size="sm"
            variant={filter === f ? "solid" : "flat"}
            color={filter === f ? "primary" : "default"}
            onPress={() => setFilter(f)}
            className="capitalize"
          >
            {f}
          </Button>
        ))}
      </div>

      {/* Table */}
      <Card className="border border-default-200">
        <CardHeader className="flex items-center gap-2 pb-0">
          <CalendarCheck className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-foreground">Stay History</h2>
          {activeCount > 0 && (
            <Chip size="sm" color="success" className="ml-auto">{activeCount} active</Chip>
          )}
        </CardHeader>
        <CardBody>
          {loading ? (
            <TableSkeleton rows={4} cols={7} />
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <CalendarCheck className="w-10 h-10 text-default-300 mb-3" />
              <p className="text-default-400">No stays found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-default-200">
                    {["Pad", "Tenant", "Check-in", "Check-out", "Cycle", "Flat Rate", "Duration", "Status", "Actions"].map(h => (
                      <th key={h} className="text-left py-2 px-3 text-default-500 font-medium text-xs uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((s: Stay) => (
                    <tr key={s.id} className="border-b border-default-100 hover:bg-default-50 transition-colors">
                      <td className="py-3 px-3 font-medium text-foreground">{s.pad_name ?? `#${s.pad_id}`}</td>
                      <td className="py-3 px-3 text-default-500">
                        <div>
                          <p className="text-foreground text-xs font-medium">{s.tenant_name ?? "—"}</p>
                          {s.tenant_email && <p className="text-default-400 text-xs">{s.tenant_email}</p>}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-xs text-default-500 whitespace-nowrap">{fmtDt(s.check_in_at)}</td>
                      <td className="py-3 px-3 text-xs text-default-500 whitespace-nowrap">{fmtDt(s.check_out_at)}</td>
                      <td className="py-3 px-3">
                        <Chip size="sm" variant="flat" color={cycleColor(s.billing_cycle)} className="capitalize">
                          {s.billing_cycle}
                        </Chip>
                      </td>
                      <td className="py-3 px-3 font-mono text-xs">
                        {Number(s.flat_rate_per_cycle) > 0
                          ? `₱${Number(s.flat_rate_per_cycle).toFixed(2)}`
                          : <span className="text-default-400">—</span>}
                      </td>
                      <td className="py-3 px-3 text-xs text-default-500">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {durationLabel(s)}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <Chip size="sm" variant="flat" color={statusColor(s.status)} className="capitalize">
                          {s.status}
                        </Chip>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex gap-1">
                          {s.status === "active" && (
                            <>
                              <Button size="sm" variant="flat" color="success" isIconOnly title="Generate bill now"
                                onPress={() => setGenBillTarget(s)}>
                                <Receipt className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="sm" variant="flat" color="warning"
                                startContent={<LogOut className="w-3.5 h-3.5" />}
                                onPress={() => setCheckOutTarget(s)}>
                                Check Out
                              </Button>
                            </>
                          )}
                          <Button size="sm" variant="flat" color="danger" isIconOnly title="Delete stay"
                            onPress={() => setDeleteTarget(s)}>
                            <Trash2 className="w-4 h-4" />
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

      {/* ── Check-in modal ─────────────────────────────────────────────────── */}
      <Modal isOpen={showCheckIn} onOpenChange={setShowCheckIn} classNames={modalClassNames} size="md">
        <ModalContent>
          <ModalHeader>Check In Tenant</ModalHeader>
          <ModalBody className="space-y-3">
            <Select
              label="Pad"
              placeholder="Select a pad"
              selectedKeys={form.pad_id ? [form.pad_id] : []}
              onSelectionChange={(keys) => setForm(f => ({ ...f, pad_id: String([...keys][0] ?? "") }))}
            >
              {pads.map((p: { id: number; name: string }) => (
                <SelectItem key={String(p.id)}>{p.name}</SelectItem>
              ))}
            </Select>

            <Select
              label="Tenant"
              placeholder="Select a tenant"
              selectedKeys={form.tenant_id ? [form.tenant_id] : []}
              onSelectionChange={(keys) => setForm(f => ({ ...f, tenant_id: String([...keys][0] ?? "") }))}
            >
              {tenants.map((t: { id: number; full_name: string; email: string }) => (
                <SelectItem key={String(t.id)}>{t.full_name} — {t.email}</SelectItem>
              ))}
            </Select>

            <Select
              label="Billing Cycle"
              selectedKeys={[form.billing_cycle]}
              onSelectionChange={(keys) =>
                setForm(f => ({ ...f, billing_cycle: String([...keys][0] ?? "monthly") as "daily" | "monthly" }))
              }
            >
              <SelectItem key="daily">Daily</SelectItem>
              <SelectItem key="monthly">Monthly</SelectItem>
            </Select>

            <Input
              label="Flat Rate per Cycle (₱)"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={form.flat_rate_per_cycle}
              onChange={e => setForm(f => ({ ...f, flat_rate_per_cycle: e.target.value }))}
              description="Fixed charge per cycle on top of energy cost (e.g. ₱2000/day)"
            />

            <Input
              label="Check-in Date & Time (optional)"
              type="datetime-local"
              value={form.check_in_at}
              onChange={e => setForm(f => ({ ...f, check_in_at: e.target.value }))}
              description="Leave blank to use current time"
            />

            <Textarea
              label="Notes (optional)"
              placeholder="e.g. Move-in notes"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              minRows={2}
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setShowCheckIn(false)}>Cancel</Button>
            <Button color="primary" isLoading={saving} onPress={handleCheckIn}>Check In</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── Check-out confirmation ─────────────────────────────────────────── */}
      <Modal isOpen={!!checkOutTarget} onOpenChange={() => setCheckOutTarget(null)} classNames={modalClassNames}>
        <ModalContent>
          <ModalHeader>Check Out Tenant</ModalHeader>
          <ModalBody>
            <p className="text-default-600">
              Check out <span className="font-semibold text-foreground">{checkOutTarget?.tenant_name}</span>{" "}
              from <span className="font-semibold text-foreground">{checkOutTarget?.pad_name}</span>?
            </p>
            <p className="text-sm text-default-500 mt-1">
              A prorated final bill will be generated immediately for the partial {checkOutTarget?.billing_cycle} cycle.
            </p>
            {checkOutTarget && (
              <p className="text-xs text-default-400 mt-1">
                Stay duration: <span className="font-mono">{durationLabel(checkOutTarget)}</span>
              </p>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setCheckOutTarget(null)}>Cancel</Button>
            <Button color="warning" isLoading={saving} onPress={handleCheckOut}>Check Out</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── Generate bill confirmation ────────────────────────────────────── */}
      <Modal isOpen={!!genBillTarget} onOpenChange={() => setGenBillTarget(null)} classNames={modalClassNames}>
        <ModalContent>
          <ModalHeader>Generate Bill Now</ModalHeader>
          <ModalBody>
            <p className="text-default-600">
              Manually generate any outstanding bills for{" "}
              <span className="font-semibold text-foreground">{genBillTarget?.tenant_name}</span>{" "}
              at <span className="font-semibold text-foreground">{genBillTarget?.pad_name}</span>?
            </p>
            <p className="text-sm text-default-500 mt-1">
              Only cycles that have not yet been billed will be generated. Already-billed cycles are skipped.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setGenBillTarget(null)}>Cancel</Button>
            <Button color="success" isLoading={saving} onPress={handleGenerateBill}
              startContent={<Receipt className="w-4 h-4" />}>
              Generate
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── Delete confirmation ────────────────────────────────────────────── */}
      <Modal isOpen={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)} classNames={modalClassNames}>
        <ModalContent>
          <ModalHeader>Delete Stay</ModalHeader>
          <ModalBody>
            <p className="text-default-600">
              Delete the stay record for{" "}
              <span className="font-semibold text-foreground">{deleteTarget?.tenant_name}</span>{" "}
              at <span className="font-semibold text-foreground">{deleteTarget?.pad_name}</span>?
            </p>
            {deleteTarget?.status === "active" && (
              <p className="text-sm text-warning mt-1">This stay is still active. Deleting it will not check them out — bills already generated will remain.</p>
            )}
            <p className="text-xs text-default-400 mt-1">This action cannot be undone.</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setDeleteTarget(null)}>Cancel</Button>
            <Button color="danger" isLoading={saving} onPress={handleDelete}>Delete</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
