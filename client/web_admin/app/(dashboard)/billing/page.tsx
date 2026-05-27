"use client";

import { useState, useMemo } from "react";
import { toast } from "@/lib/toast";
import { modalClassNames } from "@/lib/modal-styles";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import { Switch } from "@heroui/switch";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Input } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Receipt, Plus, RefreshCw, Trash2, CheckCircle, Download, CalendarClock, StopCircle, Info } from "lucide-react";
import { Tooltip } from "@heroui/tooltip";
import { billingApi, billingSchedulesApi, getErrorMessage } from "@/lib/api";
import { BillingPeriod, BillingSchedule } from "@/types";
import { TableSkeleton } from "@/components/shared/PageLoader";
import { useBilling, usePads, reloadBilling, useSchedules, reloadSchedules, useStays } from "@/lib/use-api";

const statusColor = (s: string) =>
  s === "paid" ? "success" : s === "overdue" ? "danger" : s === "waived" ? "default" : "warning";

const freqLabel = (f: string) => ({ daily: "Daily", weekly: "Weekly", monthly: "Monthly" }[f] ?? f);
const typeLabel = (t: string) => t === "electricity" ? "⚡ Electricity" : "🏠 Rent";

export default function BillingPage() {
  const { data: bills = [], isLoading: loadingBills } = useBilling();
  const { data: pads = [] } = usePads();
  const { data: stays = [] } = useStays();
  const { data: schedules = [], isLoading: loadingSchedules } = useSchedules();

  // ── One-time bill ──────────────────────────────────────────────────────────
  const [showGen, setShowGen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BillingPeriod | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ pad_id: "", period_start: "", period_end: "", due_date: "" });

  // ── Create Bill type selector ─────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);

  // ── Schedule creation ──────────────────────────────────────────────────────
  const [showSched, setShowSched] = useState(false);
  const [stopTarget, setStopTarget] = useState<BillingSchedule | null>(null);
  const [deleteSchedTarget, setDeleteSchedTarget] = useState<BillingSchedule | null>(null);
  const [schedForm, setSchedForm] = useState({
    pad_id: "",
    bill_type: "electricity" as "electricity" | "rent",
    frequency: "monthly" as "daily" | "weekly" | "monthly",
    due_date_offset_days: "7",
    flat_amount: "",
    start_date: "",
  });

  // Find the active stay's flat rate for the selected pad (for rent schedules)
  const activeFlatRate = (() => {
    if (!schedForm.pad_id || schedForm.bill_type !== "rent") return null;
    const stay = stays.find((s: any) => String(s.pad_id) === schedForm.pad_id && s.status === "active");
    return stay ? Number(stay.flat_rate_per_cycle) : null;
  })();

  // ── One-time handlers ──────────────────────────────────────────────────────
  async function handleGenerate() {
    if (!form.pad_id || !form.period_start || !form.period_end) {
      toast.warning("Please fill in all required fields");
      return;
    }
    setSaving(true);
    try {
      await billingApi.generate({ ...form, pad_id: parseInt(form.pad_id) });
      toast.success("Billing period generated");
      setShowGen(false);
      setForm({ pad_id: "", period_start: "", period_end: "", due_date: "" });
      reloadBilling();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await billingApi.delete(deleteTarget.id);
      toast.success("Bill deleted");
      setDeleteTarget(null);
      reloadBilling();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkPaid(bill: BillingPeriod) {
    try {
      await billingApi.markPaid(bill.id);
      toast.success("Bill marked as paid");
      reloadBilling();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  async function handleWaive(bill: BillingPeriod) {
    try {
      await billingApi.waive(bill.id);
      toast.info("Bill waived");
      reloadBilling();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  // ── Schedule handlers ──────────────────────────────────────────────────────
  async function handleCreateSchedule() {
    if (!schedForm.pad_id || !schedForm.bill_type || !schedForm.frequency || !schedForm.start_date) {
      toast.warning("Please fill in all required fields");
      return;
    }
    setSaving(true);
    try {
      await billingSchedulesApi.create({
        ...schedForm,
        pad_id: parseInt(schedForm.pad_id),
        due_date_offset_days: parseInt(schedForm.due_date_offset_days || "7"),
        flat_amount:
          schedForm.bill_type === "rent" && activeFlatRate === null && schedForm.flat_amount
            ? parseFloat(schedForm.flat_amount)
            : null,
      });
      toast.success("Billing schedule created");
      setShowSched(false);
      setSchedForm({ pad_id: "", bill_type: "electricity", frequency: "monthly", due_date_offset_days: "7", flat_amount: "", start_date: "" });
      reloadSchedules();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleStopSchedule() {
    if (!stopTarget) return;
    setSaving(true);
    try {
      await billingSchedulesApi.stop(stopTarget.id);
      toast.success("Schedule stopped");
      setStopTarget(null);
      reloadSchedules();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteSchedule() {
    if (!deleteSchedTarget) return;
    setSaving(true);
    try {
      await billingSchedulesApi.delete(deleteSchedTarget.id);
      toast.success("Schedule deleted");
      setDeleteSchedTarget(null);
      reloadSchedules();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const activeSchedules = schedules.filter((s: BillingSchedule) => s.status === "active");

  const nextUpdate = useMemo(() => {
    const now = new Date();
    const next = new Date(now);
    next.setMinutes(55, 0, 0);
    if (now.getMinutes() >= 55) next.setHours(next.getHours() + 1);
    return next.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Billing</h1>
          <p className="text-default-500 text-sm mt-0.5">
            {bills.length} billing period{bills.length !== 1 ? "s" : ""} · {activeSchedules.length} active schedule{activeSchedules.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Tooltip delay={3000}content="Reload bills and schedules" placement="bottom">
            <Button variant="flat" size="sm" startContent={<RefreshCw className="w-4 h-4" />}
              onPress={() => { reloadBilling(); reloadSchedules(); }}>
              Refresh
            </Button>
          </Tooltip>
          <Tooltip delay={3000}content="Generate a one-time bill or set up an automated schedule" placement="bottom">
            <Button color="primary" size="sm" startContent={<Plus className="w-4 h-4" />}
              onPress={() => setShowCreate(true)}>
              Create Bill
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* ── Next update banner ───────────────────────────────────────────────── */}
      {activeSchedules.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary-50 border border-secondary-200 text-secondary-700 text-sm">
          <Info className="w-4 h-4 shrink-0" />
          <span>
            Automated bills are processed at <span className="font-semibold">:55 of every hour</span>.
            Next run: <span className="font-semibold">{nextUpdate}</span>.
          </span>
        </div>
      )}

      {/* ── Automated Billing Schedules ─────────────────────────────────────── */}
      <Card className="border border-default-200">
        <CardHeader className="flex items-center gap-2 pb-0">
          <CalendarClock className="w-5 h-5 text-secondary" />
          <h2 className="font-semibold text-foreground">Automated Billing</h2>
          {activeSchedules.length > 0 && (
            <Chip size="sm" color="secondary" className="ml-auto">{activeSchedules.length} active</Chip>
          )}
        </CardHeader>
        <CardBody>
          {loadingSchedules ? (
            <TableSkeleton rows={2} cols={6} />
          ) : schedules.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <CalendarClock className="w-8 h-8 text-default-300 mb-2" />
              <p className="text-default-400 text-sm">No billing schedules yet</p>
              <p className="text-default-300 text-xs mt-1">
                Create a schedule to auto-generate bills daily, weekly, or monthly.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-default-200">
                    {["Pad", "Tenant", "Type", "Frequency", "Next Bill", "Due Offset", "Active", "Actions"].map(h => (
                      <th key={h} className="text-left py-2 px-3 text-default-500 font-medium text-xs uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((s: BillingSchedule) => (
                    <tr key={s.id} className="border-b border-default-100 hover:bg-default-50">
                      <td className="py-3 px-3 font-medium text-foreground">{s.pad_name ?? `#${s.pad_id}`}</td>
                      <td className="py-3 px-3 text-default-500 text-xs">{s.tenant_name ?? "—"}</td>
                      <td className="py-3 px-3 text-xs">{typeLabel(s.bill_type)}</td>
                      <td className="py-3 px-3">
                        <Chip size="sm" variant="flat" color="secondary" className="capitalize">
                          {freqLabel(s.frequency)}
                        </Chip>
                      </td>
                      <td className="py-3 px-3 font-mono text-xs">
        {new Date(s.next_period_start).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}
      </td>
                      <td className="py-3 px-3 text-xs text-default-500">+{s.due_date_offset_days}d</td>
                      <td className="py-3 px-3">
                        <Tooltip
                          content={s.status === "stopped" ? "Schedule is stopped" : "Turn off to stop auto-billing for this pad"}
                          placement="left"
                        >
                          <span>
                            <Switch
                              size="sm"
                              isSelected={s.status === "active"}
                              isDisabled={saving || s.status === "stopped"}
                              onValueChange={(val) => { if (!val) setStopTarget(s); }}
                              color="success"
                            />
                          </span>
                        </Tooltip>
                      </td>
                      <td className="py-3 px-3">
                        <Tooltip delay={3000}content="Permanently delete this schedule" placement="left" color="danger">
                          <Button size="sm" variant="flat" color="danger" isIconOnly
                            onPress={() => setDeleteSchedTarget(s)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </Tooltip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* ── All Bills ─────────────────────────────────────────────────────────── */}
      <Card className="border border-default-200">
        <CardHeader className="flex items-center gap-2 pb-0">
          <Receipt className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-foreground">All Billing Periods</h2>
        </CardHeader>
        <CardBody>
          {loadingBills ? <TableSkeleton rows={5} cols={7} /> : bills.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Receipt className="w-10 h-10 text-default-300 mb-3" />
              <p className="text-default-400">No billing periods yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-default-200">
                    {["Pad", "Tenant", "Period", "Energy", "Amount", "Status", "Actions"].map(h => (
                      <th key={h} className="text-left py-2 px-3 text-default-500 font-medium text-xs uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bills.map((b: BillingPeriod) => (
                    <tr key={b.id} className="border-b border-default-100 hover:bg-default-50">
                      <td className="py-3 px-3 font-medium text-foreground">{b.pad_name ?? `#${b.pad_id}`}</td>
                      <td className="py-3 px-3 text-default-500">{b.tenant_name ?? "—"}</td>
                      <td className="py-3 px-3 text-xs text-default-500">
                        {new Date(b.period_start).toLocaleDateString()} – {new Date(b.period_end).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-3 font-mono text-xs">{Number(b.energy_kwh).toFixed(2)} kWh</td>
                      <td className="py-3 px-3 font-mono text-xs">₱{Number(b.amount_due).toFixed(2)}</td>
                      <td className="py-3 px-3">
                        <Chip size="sm" variant="flat" color={statusColor(b.status)}>
                          {b.status}
                        </Chip>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex gap-1 flex-wrap">
                          {(b.status === "unpaid" || b.status === "overdue") && (
                            <Tooltip delay={3000}content="Record that this bill has been paid" placement="top" color="success">
                              <Button size="sm" variant="flat" color="success"
                                startContent={<CheckCircle className="w-3 h-3" />}
                                onPress={() => handleMarkPaid(b)}>
                                Mark Paid
                              </Button>
                            </Tooltip>
                          )}
                          {b.status === "unpaid" && (
                            <Tooltip delay={3000}content="Waive this bill — tenant won't need to pay it" placement="top">
                              <Button size="sm" variant="flat" color="default"
                                onPress={() => handleWaive(b)}>
                                Waive
                              </Button>
                            </Tooltip>
                          )}
                          {(b as any).receipt_url && (
                            <Tooltip delay={3000}content="Download receipt" placement="top" color="primary">
                              <Button size="sm" variant="flat" color="primary" isIconOnly
                                as="a" href={(b as any).receipt_url} target="_blank" rel="noopener noreferrer">
                                <Download className="w-3 h-3" />
                              </Button>
                            </Tooltip>
                          )}
                          <Tooltip delay={3000}content="Delete this billing record permanently" placement="left" color="danger">
                            <Button size="sm" variant="flat" color="danger" isIconOnly
                              onPress={() => setDeleteTarget(b)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </Tooltip>
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

      {/* ── Create Bill type selector ────────────────────────────────────────── */}
      <Modal isOpen={showCreate} onOpenChange={setShowCreate} classNames={modalClassNames} size="sm">
        <ModalContent>
          <ModalHeader>Create Bill</ModalHeader>
          <ModalBody className="space-y-3 pb-2">
            <p className="text-default-500 text-sm">How do you want to bill?</p>
            <button
              className="w-full text-left rounded-xl border border-default-200 hover:border-primary hover:bg-primary-50 transition-colors px-4 py-3 group"
              onClick={() => { setShowCreate(false); setShowGen(true); }}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary-100 flex items-center justify-center shrink-0 group-hover:bg-primary-200 transition-colors">
                  <Receipt className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-foreground text-sm">One-time Bill</p>
                  <p className="text-xs text-default-400 mt-0.5">Generate a single bill for a specific period</p>
                </div>
              </div>
            </button>
            <button
              className="w-full text-left rounded-xl border border-default-200 hover:border-secondary hover:bg-secondary-50 transition-colors px-4 py-3 group"
              onClick={() => { setShowCreate(false); setShowSched(true); }}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-secondary-100 flex items-center justify-center shrink-0 group-hover:bg-secondary-200 transition-colors">
                  <CalendarClock className="w-4 h-4 text-secondary" />
                </div>
                <div>
                  <p className="font-semibold text-foreground text-sm">Automated Schedule</p>
                  <p className="text-xs text-default-400 mt-0.5">Auto-generate bills daily, weekly, or monthly</p>
                </div>
              </div>
            </button>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setShowCreate(false)}>Cancel</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── Delete Bill modal ────────────────────────────────────────────────── */}
      <Modal isOpen={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)} classNames={modalClassNames}>
        <ModalContent>
          <ModalHeader>Delete Bill</ModalHeader>
          <ModalBody>
            <p className="text-default-600">
              Delete the bill for <span className="font-semibold text-foreground">{deleteTarget?.pad_name ?? `#${deleteTarget?.pad_id}`}</span>
              {deleteTarget?.tenant_name && <> — tenant <span className="font-semibold text-foreground">{deleteTarget.tenant_name}</span></>}?
            </p>
            {deleteTarget?.status === "paid" && (
              <p className="text-sm text-warning mt-1">This bill is already paid. Deleting it will remove the payment record.</p>
            )}
            <p className="text-xs text-default-400 mt-1">This action cannot be undone.</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setDeleteTarget(null)}>Cancel</Button>
            <Button color="danger" isLoading={saving} onPress={handleDelete}>Delete</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── One-time Bill modal ──────────────────────────────────────────────── */}
      <Modal isOpen={showGen} onOpenChange={setShowGen} classNames={modalClassNames}>
        <ModalContent>
          <ModalHeader>Generate One-time Bill</ModalHeader>
          <ModalBody className="space-y-3">
            <Select
              label="Pad"
              placeholder="Select a pad"
              selectedKeys={form.pad_id ? [form.pad_id] : []}
              onSelectionChange={keys => setForm(f => ({ ...f, pad_id: String([...keys][0] ?? "") }))}>
              {pads.map((p: { id: number; name: string; tenant_name?: string }) => (
                <SelectItem key={String(p.id)} textValue={p.name}>
                  <span className="font-medium">{p.name}</span>
                  {p.tenant_name && <span className="text-default-400 ml-2 text-xs">{p.tenant_name}</span>}
                </SelectItem>
              ))}
            </Select>
            <Input label="Period Start" type="date" value={form.period_start}
              onChange={e => setForm(f => ({ ...f, period_start: e.target.value }))} />
            <Input label="Period End" type="date" value={form.period_end}
              onChange={e => setForm(f => ({ ...f, period_end: e.target.value }))} />
            <Input
              label="Due Date (bill visible to tenant from this date)"
              type="date"
              value={form.due_date}
              description="Tenant sees this bill starting on the due date."
              onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setShowGen(false)}>Cancel</Button>
            <Button color="primary" isLoading={saving} onPress={handleGenerate}>Generate</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── New Schedule modal ───────────────────────────────────────────────── */}
      <Modal isOpen={showSched} onOpenChange={setShowSched} classNames={modalClassNames}>
        <ModalContent>
          <ModalHeader>New Billing Schedule</ModalHeader>
          <ModalBody className="space-y-3">
            <Select
              label="Pad"
              placeholder="Select a pad"
              selectedKeys={schedForm.pad_id ? [schedForm.pad_id] : []}
              onSelectionChange={keys => setSchedForm(f => ({ ...f, pad_id: String([...keys][0] ?? "") }))}>
              {pads.map((p: { id: number; name: string; tenant_name?: string }) => (
                <SelectItem key={String(p.id)} textValue={p.name}>
                  <span className="font-medium">{p.name}</span>
                  {p.tenant_name && <span className="text-default-400 ml-2 text-xs">{p.tenant_name}</span>}
                </SelectItem>
              ))}
            </Select>
            <Select
              label="Bill Type"
              selectedKeys={[schedForm.bill_type]}
              onSelectionChange={keys => setSchedForm(f => ({ ...f, bill_type: String([...keys][0] ?? "electricity") as "electricity" | "rent" }))}>
              <SelectItem key="electricity">⚡ Electricity</SelectItem>
              <SelectItem key="rent">🏠 Rent</SelectItem>
            </Select>
            <Select
              label="Frequency"
              selectedKeys={[schedForm.frequency]}
              onSelectionChange={keys => setSchedForm(f => ({ ...f, frequency: String([...keys][0] ?? "monthly") as "daily" | "weekly" | "monthly" }))}>
              <SelectItem key="daily">Daily</SelectItem>
              <SelectItem key="weekly">Weekly</SelectItem>
              <SelectItem key="monthly">Monthly</SelectItem>
            </Select>
            <Input
              label="First Period Start Date"
              type="date"
              value={schedForm.start_date}
              onChange={e => setSchedForm(f => ({ ...f, start_date: e.target.value }))} />
            <Input
              label="Due Date Offset (days after period end)"
              type="number"
              min="0"
              value={schedForm.due_date_offset_days}
              description="e.g. 7 = tenant sees bill 7 days after each period closes"
              onChange={e => setSchedForm(f => ({ ...f, due_date_offset_days: e.target.value }))} />
            {schedForm.bill_type === "rent" && (
              activeFlatRate !== null ? (
                <div className="rounded-lg bg-secondary-50 border border-secondary-200 px-3 py-2.5 text-sm">
                  <p className="text-secondary-700">
                    Flat rate: <span className="font-semibold">₱{activeFlatRate.toFixed(2)}</span> per cycle
                  </p>
                  <p className="text-xs text-secondary-500 mt-0.5">
                    Pulled from the active stay on this pad. Edit it in the Stays page.
                  </p>
                </div>
              ) : (
                <Input
                  label="Flat Rent Amount per Cycle (₱)"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={schedForm.flat_amount}
                  description="No active stay on this pad — enter the rent amount manually."
                  onChange={e => setSchedForm(f => ({ ...f, flat_amount: e.target.value }))} />
              )
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setShowSched(false)}>Cancel</Button>
            <Button color="secondary" isLoading={saving} onPress={handleCreateSchedule}>
              Create Schedule
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── Stop Schedule confirmation ─────────────────────────────────────── */}
      <Modal isOpen={!!stopTarget} onOpenChange={() => setStopTarget(null)} classNames={modalClassNames}>
        <ModalContent>
          <ModalHeader>Stop Schedule</ModalHeader>
          <ModalBody>
            <p className="text-default-600">
              Stop the <span className="font-semibold text-foreground capitalize">{stopTarget?.frequency}</span>{" "}
              {stopTarget?.bill_type} schedule for{" "}
              <span className="font-semibold text-foreground">{stopTarget?.pad_name}</span>?
            </p>
            <p className="text-sm text-default-500 mt-1">
              No new bills will be generated. Already-created bills are not affected.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setStopTarget(null)}>Cancel</Button>
            <Button color="warning" isLoading={saving}
              startContent={<StopCircle className="w-4 h-4" />}
              onPress={handleStopSchedule}>
              Stop
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── Delete Schedule confirmation ───────────────────────────────────── */}
      <Modal isOpen={!!deleteSchedTarget} onOpenChange={() => setDeleteSchedTarget(null)} classNames={modalClassNames}>
        <ModalContent>
          <ModalHeader>Delete Schedule</ModalHeader>
          <ModalBody>
            <p className="text-default-600">
              Permanently delete the <span className="font-semibold text-foreground capitalize">{deleteSchedTarget?.frequency}</span>{" "}
              {deleteSchedTarget?.bill_type} schedule for{" "}
              <span className="font-semibold text-foreground">{deleteSchedTarget?.pad_name}</span>?
            </p>
            <p className="text-xs text-default-400 mt-1">This action cannot be undone. Already-created bills remain.</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setDeleteSchedTarget(null)}>Cancel</Button>
            <Button color="danger" isLoading={saving} onPress={handleDeleteSchedule}>Delete</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
