"use client";

import { useEffect, useState, useCallback } from "react";
import { addToast } from "@heroui/toast";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Textarea } from "@heroui/input";
import { CreditCard, RefreshCw, CheckCircle, XCircle, ExternalLink } from "lucide-react";
import { paymentsApi, getErrorMessage } from "@/lib/api";
import { Payment } from "@/types";
import { TableSkeleton } from "@/components/shared/PageLoader";

const statusColor = (s: string) =>
  s === "paid" ? "success" : s === "failed" ? "danger" : s === "refunded" ? "secondary" : "warning";

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectTarget, setRejectTarget] = useState<Payment | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await paymentsApi.all();
      setPayments(res.data.data ?? []);
    } catch (err) {
      addToast({ title: "Failed to load payments", description: getErrorMessage(err), color: "danger" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleApprove(p: Payment) {
    setSaving(true);
    try {
      await paymentsApi.approve(p.id);
      addToast({ title: "Payment approved", color: "success" });
      load(true);
    } catch (err) {
      addToast({ title: "Approve failed", description: getErrorMessage(err), color: "danger" });
    } finally {
      setSaving(false);
    }
  }

  async function handleReject() {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) { addToast({ title: "Rejection reason required", color: "warning" }); return; }
    setSaving(true);
    try {
      await paymentsApi.reject(rejectTarget.id, rejectReason);
      addToast({ title: "Payment rejected", color: "default" });
      setRejectTarget(null);
      setRejectReason("");
      load(true);
    } catch (err) {
      addToast({ title: "Reject failed", description: getErrorMessage(err), color: "danger" });
    } finally {
      setSaving(false);
    }
  }

  const pending = payments.filter(p => p.status === "pending_verification");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Payments</h1>
          <p className="text-default-500 text-sm mt-0.5">{pending.length} pending verification</p>
        </div>
        <Button variant="flat" size="sm" startContent={<RefreshCw className="w-4 h-4" />} onPress={() => load(true)}>Refresh</Button>
      </div>

      <Card className="border border-default-200">
        <CardHeader className="flex items-center gap-2 pb-0">
          <CreditCard className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-foreground">All Payments</h2>
          {pending.length > 0 && <Chip size="sm" color="warning" className="ml-auto">{pending.length} pending</Chip>}
        </CardHeader>
        <CardBody>
          {loading ? <TableSkeleton rows={5} cols={7} /> : payments.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <CreditCard className="w-10 h-10 text-default-300 mb-3" />
              <p className="text-default-400">No payments yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-default-200">
                    {["Tenant", "Pad", "Amount", "Method", "Reference", "Status", "Receipt", "Actions"].map(h => (
                      <th key={h} className="text-left py-2 px-3 text-default-500 font-medium text-xs uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={p.id} className="border-b border-default-100 hover:bg-default-50">
                      <td className="py-3 px-3 font-medium text-foreground">{p.tenant_name ?? "—"}</td>
                      <td className="py-3 px-3 text-default-500">{p.pad_name ?? "—"}</td>
                      <td className="py-3 px-3 font-mono text-xs">₱{Number(p.amount).toFixed(2)}</td>
                      <td className="py-3 px-3 text-default-500 capitalize">{p.payment_method}</td>
                      <td className="py-3 px-3 font-mono text-xs text-default-400">{p.reference_number ?? "—"}</td>
                      <td className="py-3 px-3">
                        <Chip size="sm" variant="flat" color={statusColor(p.status)}>{p.status}</Chip>
                      </td>
                      <td className="py-3 px-3">
                        {p.receipt_url && (
                          <a href={p.receipt_url} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="flat" isIconOnly><ExternalLink className="w-3.5 h-3.5" /></Button>
                          </a>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {p.status === "pending_verification" && (
                          <div className="flex gap-1">
                            <Button size="sm" color="success" variant="flat" isIconOnly isLoading={saving}
                              onPress={() => handleApprove(p)} title="Approve">
                              <CheckCircle className="w-4 h-4" />
                            </Button>
                            <Button size="sm" color="danger" variant="flat" isIconOnly
                              onPress={() => setRejectTarget(p)} title="Reject">
                              <XCircle className="w-4 h-4" />
                            </Button>
                          </div>
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

      <Modal isOpen={!!rejectTarget} onOpenChange={() => setRejectTarget(null)}>
        <ModalContent>
          <ModalHeader>Reject Payment</ModalHeader>
          <ModalBody>
            <p className="text-sm text-default-500 mb-2">Payment from <strong>{rejectTarget?.tenant_name}</strong> — ₱{Number(rejectTarget?.amount).toFixed(2)}</p>
            <Textarea label="Rejection Reason" placeholder="e.g. Reference number not found" value={rejectReason}
              onChange={e => setRejectReason(e.target.value)} />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setRejectTarget(null)}>Cancel</Button>
            <Button color="danger" isLoading={saving} onPress={handleReject}>Reject</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
