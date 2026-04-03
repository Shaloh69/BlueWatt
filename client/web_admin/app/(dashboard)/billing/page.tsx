"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "@/lib/toast";
import { modalClassNames } from "@/lib/modal-styles";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Input } from "@heroui/input";
import { Receipt, Plus, RefreshCw } from "lucide-react";
import { billingApi, getErrorMessage } from "@/lib/api";
import { BillingPeriod } from "@/types";
import { TableSkeleton } from "@/components/shared/PageLoader";

const statusColor = (s: string) =>
  s === "paid" ? "success" : s === "overdue" ? "danger" : s === "waived" ? "default" : "warning";

export default function BillingPage() {
  const [bills, setBills] = useState<BillingPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGen, setShowGen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ pad_id: "", period_start: "", period_end: "", due_date: "" });

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await billingApi.list();
      setBills(res.data.data?.bills ?? []);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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
      load(true);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleWaive(bill: BillingPeriod) {
    try {
      await billingApi.waive(bill.id);
      toast.info("Bill waived");
      load(true);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Billing</h1>
          <p className="text-default-500 text-sm mt-0.5">{bills.length} billing periods</p>
        </div>
        <div className="flex gap-2">
          <Button variant="flat" size="sm" startContent={<RefreshCw className="w-4 h-4" />} onPress={() => load(true)}>Refresh</Button>
          <Button color="primary" size="sm" startContent={<Plus className="w-4 h-4" />} onPress={() => setShowGen(true)}>Generate Bill</Button>
        </div>
      </div>

      <Card className="border border-default-200">
        <CardHeader className="flex items-center gap-2 pb-0">
          <Receipt className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-foreground">All Billing Periods</h2>
        </CardHeader>
        <CardBody>
          {loading ? <TableSkeleton rows={5} cols={6} /> : bills.length === 0 ? (
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
                  {bills.map(b => (
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
                        {b.status === "unpaid" && (
                          <Button size="sm" variant="flat" color="default" onPress={() => handleWaive(b)}>Waive</Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Modal isOpen={showGen} onOpenChange={setShowGen} classNames={modalClassNames}>
        <ModalContent>
          <ModalHeader>Generate Billing Period</ModalHeader>
          <ModalBody className="space-y-3">
            <Input label="Pad ID" type="number" placeholder="1" value={form.pad_id}
              onChange={e => setForm(f => ({ ...f, pad_id: e.target.value }))} />
            <Input label="Period Start" type="date" value={form.period_start}
              onChange={e => setForm(f => ({ ...f, period_start: e.target.value }))} />
            <Input label="Period End" type="date" value={form.period_end}
              onChange={e => setForm(f => ({ ...f, period_end: e.target.value }))} />
            <Input label="Due Date" type="date" value={form.due_date}
              onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setShowGen(false)}>Cancel</Button>
            <Button color="primary" isLoading={saving} onPress={handleGenerate}>Generate</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
