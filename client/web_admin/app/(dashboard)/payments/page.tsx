"use client";

import { useState, useRef, useEffect } from "react";
import { toast } from "@/lib/toast";
import { modalClassNames } from "@/lib/modal-styles";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Textarea } from "@heroui/input";
import { CreditCard, RefreshCw, CheckCircle, XCircle, ExternalLink, QrCode, Upload, Trash2, Eye, EyeOff } from "lucide-react";
import { paymentsApi, getErrorMessage } from "@/lib/api";
import { Payment } from "@/types";
import { TableSkeleton } from "@/components/shared/PageLoader";
import { useAllPayments, reloadPayments } from "@/lib/use-api";
import Image from "next/image";
import useSWR from "swr";

const statusColor = (s: string) =>
  s === "paid" ? "success" : s === "failed" ? "danger" : s === "refunded" ? "secondary" : "warning";

interface QrCode {
  id: number;
  label: string;
  image_url: string;
  is_active: boolean;
  created_at: string;
}

export default function PaymentsPage() {
  const { data: payments = [], isLoading: loading } = useAllPayments();
  const { data: qrCodes = [], mutate: reloadQr } = useSWR<QrCode[]>(
    "qr-codes",
    () => paymentsApi.qrCodesAll().then(r => r.data.data?.qr_codes ?? []),
    { revalidateOnFocus: false }
  );

  const [rejectTarget, setRejectTarget] = useState<Payment | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [qrLabel, setQrLabel] = useState("GCash / Maya");
  const fileRef = useRef<HTMLInputElement>(null);

  const pending = payments.filter(p => p.status === "pending_verification");
  const activeQr = qrCodes.find(q => q.is_active);

  async function handleApprove(p: Payment) {
    setSaving(true);
    try {
      await paymentsApi.approve(p.id);
      toast.success("Payment approved");
      reloadPayments();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleReject() {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) { toast.warning("Rejection reason required"); return; }
    setSaving(true);
    try {
      await paymentsApi.reject(rejectTarget.id, rejectReason);
      toast.info("Payment rejected");
      setRejectTarget(null);
      setRejectReason("");
      reloadPayments();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleQrUpload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      fd.append("label", qrLabel);
      await paymentsApi.uploadQr(fd);
      toast.success("QR code uploaded");
      reloadQr();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  async function handleToggleQr(qr: QrCode) {
    try {
      await paymentsApi.toggleQr(qr.id);
      reloadQr();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  async function handleDeleteQr(qr: QrCode) {
    try {
      await paymentsApi.deleteQr(qr.id);
      toast.info("QR code deleted");
      reloadQr();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Payments</h1>
          <p className="text-default-500 text-sm mt-0.5">{pending.length} pending verification</p>
        </div>
        <Button variant="flat" size="sm" startContent={<RefreshCw className="w-4 h-4" />} onPress={() => reloadPayments()}>Refresh</Button>
      </div>

      {/* ── QR Code section ─────────────────────────────────────── */}
      <Card className="border border-default-200">
        <CardHeader className="flex items-center gap-2 pb-0">
          <QrCode className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-foreground">Payment QR Code</h2>
          {activeQr && <Chip size="sm" color="success" variant="flat" className="ml-auto">Active</Chip>}
        </CardHeader>
        <CardBody>
          <div className="flex flex-col lg:flex-row gap-6 items-start">
            {/* Active QR preview */}
            <div className="flex flex-col items-center gap-3">
              {activeQr ? (
                <>
                  <div className="relative w-48 h-48 rounded-xl overflow-hidden border-2 border-success/40 bg-white">
                    <Image src={activeQr.image_url} alt="Payment QR" fill className="object-contain p-2" unoptimized />
                  </div>
                  <p className="text-xs text-default-400">{activeQr.label}</p>
                  <p className="text-xs text-success font-medium">Shown to tenants during payment</p>
                </>
              ) : (
                <div className="w-48 h-48 rounded-xl border-2 border-dashed border-default-300 flex flex-col items-center justify-center text-center p-4">
                  <QrCode className="w-10 h-10 text-default-300 mb-2" />
                  <p className="text-xs text-default-400">No active QR code</p>
                </div>
              )}
            </div>

            {/* Upload + manage */}
            <div className="flex-1 space-y-4">
              <div>
                <p className="text-sm font-medium text-foreground mb-1">Upload new QR code</p>
                <p className="text-xs text-default-400 mb-3">Upload your GCash, Maya, or bank QR image. Only one can be active at a time.</p>
                <div className="flex gap-2 items-center">
                  <input
                    ref={fileRef}
                    type="text"
                    placeholder="Label (e.g. GCash)"
                    value={qrLabel}
                    onChange={e => setQrLabel(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-content2 border border-default-200 text-sm text-foreground focus:outline-none focus:border-primary flex-1 max-w-[180px]"
                  />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    id="qr-upload"
                    onChange={e => { if (e.target.files?.[0]) handleQrUpload(e.target.files[0]); }}
                  />
                  <Button
                    as="label"
                    htmlFor="qr-upload"
                    color="primary"
                    variant="flat"
                    size="sm"
                    isLoading={uploading}
                    startContent={<Upload className="w-4 h-4" />}
                  >
                    Upload Image
                  </Button>
                </div>
              </div>

              {/* All QR codes */}
              {qrCodes.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-default-400 uppercase tracking-wide">Saved QR Codes</p>
                  {qrCodes.map(qr => (
                    <div key={qr.id} className="flex items-center gap-3 p-3 rounded-xl bg-default-50 border border-default-200">
                      <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-white border border-default-200 shrink-0">
                        <Image src={qr.image_url} alt={qr.label} fill className="object-contain p-1" unoptimized />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{qr.label}</p>
                        <p className="text-xs text-default-400">{new Date(qr.created_at).toLocaleDateString()}</p>
                      </div>
                      <Chip size="sm" variant="flat" color={qr.is_active ? "success" : "default"}>
                        {qr.is_active ? "Active" : "Inactive"}
                      </Chip>
                      <Button size="sm" variant="flat" isIconOnly title={qr.is_active ? "Deactivate" : "Activate"}
                        onPress={() => handleToggleQr(qr)}>
                        {qr.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                      <Button size="sm" variant="flat" color="danger" isIconOnly title="Delete"
                        onPress={() => handleDeleteQr(qr)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* ── All Payments ─────────────────────────────────────────── */}
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

      <Modal isOpen={!!rejectTarget} onOpenChange={() => setRejectTarget(null)} classNames={modalClassNames}>
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
