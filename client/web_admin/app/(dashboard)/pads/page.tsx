"use client";

import { useState } from "react";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Input, Textarea } from "@heroui/input";
import { Building2, Plus, RefreshCw, UserPlus, UserMinus, Pencil } from "lucide-react";
import { padsApi, getErrorMessage } from "@/lib/api";
import { Pad } from "@/types";
import { TableSkeleton } from "@/components/shared/PageLoader";
import { toast } from "@/lib/toast";
import { modalClassNames } from "@/lib/modal-styles";
import { usePads, reloadPads } from "@/lib/use-api";

export default function PadsPage() {
  const { data: pads = [], isLoading: loading } = usePads();
  const [showAdd, setShowAdd] = useState(false);
  const [showAssign, setShowAssign] = useState<Pad | null>(null);
  const [editTarget, setEditTarget] = useState<Pad | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", rate_per_kwh: "8.50" });
  const [assignForm, setAssignForm] = useState({ tenant_id: "", device_id: "" });
  const [editForm, setEditForm] = useState({ name: "", description: "", rate_per_kwh: "" });

  async function handleCreate() {
    if (!form.name.trim()) { toast.warning("Name is required"); return; }
    setSaving(true);
    try {
      await padsApi.create({ ...form, rate_per_kwh: parseFloat(form.rate_per_kwh) });
      toast.success("Pad created");
      setShowAdd(false);
      setForm({ name: "", description: "", rate_per_kwh: "8.50" });
      reloadPads();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function openEdit(pad: Pad) {
    setEditTarget(pad);
    setEditForm({
      name: pad.name,
      description: pad.description ?? "",
      rate_per_kwh: String(pad.rate_per_kwh),
    });
  }

  async function handleEdit() {
    if (!editTarget) return;
    if (!editForm.name.trim()) { toast.warning("Name is required"); return; }
    const rate = parseFloat(editForm.rate_per_kwh);
    if (isNaN(rate) || rate <= 0) { toast.warning("Enter a valid rate"); return; }
    setSaving(true);
    try {
      await padsApi.update(editTarget.id, {
        name: editForm.name.trim(),
        description: editForm.description.trim() || null,
        rate_per_kwh: rate,
      });
      toast.success("Pad updated");
      setEditTarget(null);
      reloadPads();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleAssign() {
    if (!showAssign) return;
    setSaving(true);
    try {
      await padsApi.assign(showAssign.id, {
        tenant_id: assignForm.tenant_id ? parseInt(assignForm.tenant_id) : undefined,
        device_id: assignForm.device_id ? parseInt(assignForm.device_id) : undefined,
      });
      toast.success("Pad assigned");
      setShowAssign(null);
      setAssignForm({ tenant_id: "", device_id: "" });
      reloadPads();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleUnassign(pad: Pad) {
    try {
      await padsApi.unassign(pad.id);
      toast.info("Pad unassigned");
      reloadPads();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pads</h1>
          <p className="text-default-500 text-sm mt-0.5">{pads.length} total</p>
        </div>
        <div className="flex gap-2">
          <Button variant="flat" size="sm" startContent={<RefreshCw className="w-4 h-4" />} onPress={() => reloadPads()}>Refresh</Button>
          <Button color="primary" size="sm" startContent={<Plus className="w-4 h-4" />} onPress={() => setShowAdd(true)}>Add Pad</Button>
        </div>
      </div>

      <Card className="border border-default-200">
        <CardHeader className="flex items-center gap-2 pb-0">
          <Building2 className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-foreground">All Pads</h2>
        </CardHeader>
        <CardBody>
          {loading ? <TableSkeleton rows={4} cols={7} /> : pads.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Building2 className="w-10 h-10 text-default-300 mb-3" />
              <p className="text-default-400">No pads yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-default-200">
                    {["Pad", "Tenant", "Device", "Rate", "Status", "Actions"].map(h => (
                      <th key={h} className="text-left py-2 px-3 text-default-500 font-medium text-xs uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pads.map(p => (
                    <tr key={p.id} className="border-b border-default-100 hover:bg-default-50">
                      <td className="py-3 px-3 font-medium text-foreground">{p.name}</td>
                      <td className="py-3 px-3 text-default-500">{p.tenant_name ?? "—"}</td>
                      <td className="py-3 px-3">
                        {p.device_serial
                          ? <Chip size="sm" variant="flat" color="primary">{p.device_serial}</Chip>
                          : <span className="text-default-400">—</span>}
                      </td>
                      <td className="py-3 px-3 font-mono text-xs">₱{Number(p.rate_per_kwh).toFixed(2)}/kWh</td>
                      <td className="py-3 px-3">
                        <Chip size="sm" variant="flat" color={p.is_active ? "success" : "default"}>
                          {p.is_active ? "Active" : "Inactive"}
                        </Chip>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex gap-1">
                          <Button size="sm" variant="flat" color="default" isIconOnly title="Edit rate / name"
                            onPress={() => openEdit(p)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="flat" color="primary" isIconOnly title="Assign tenant/device"
                            onPress={() => { setShowAssign(p); setAssignForm({ tenant_id: String(p.tenant_id ?? ""), device_id: String(p.device_id ?? "") }); }}>
                            <UserPlus className="w-4 h-4" />
                          </Button>
                          {(p.tenant_id || p.device_id) && (
                            <Button size="sm" variant="flat" color="danger" isIconOnly title="Unassign" onPress={() => handleUnassign(p)}>
                              <UserMinus className="w-4 h-4" />
                            </Button>
                          )}
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

      {/* Add Pad */}
      <Modal isOpen={showAdd} onOpenChange={setShowAdd} classNames={modalClassNames}>
        <ModalContent>
          <ModalHeader>Add New Pad</ModalHeader>
          <ModalBody className="space-y-3">
            <Input label="Pad Name" placeholder="Unit 1A" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <Textarea label="Description (optional)" value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            <Input label="Rate per kWh (₱)" type="number" step="0.01" value={form.rate_per_kwh}
              onChange={e => setForm(f => ({ ...f, rate_per_kwh: e.target.value }))} />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setShowAdd(false)}>Cancel</Button>
            <Button color="primary" isLoading={saving} onPress={handleCreate}>Create</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Edit Pad */}
      <Modal isOpen={!!editTarget} onOpenChange={() => setEditTarget(null)} classNames={modalClassNames}>
        <ModalContent>
          <ModalHeader>Edit — {editTarget?.name}</ModalHeader>
          <ModalBody className="space-y-3">
            <Input label="Pad Name" value={editForm.name}
              onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
            <Textarea label="Description (optional)" value={editForm.description}
              onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
            <Input label="Rate per kWh (₱)" type="number" step="0.01" value={editForm.rate_per_kwh}
              onChange={e => setEditForm(f => ({ ...f, rate_per_kwh: e.target.value }))}
              description="Changing the rate only affects future billing calculations" />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setEditTarget(null)}>Cancel</Button>
            <Button color="primary" isLoading={saving} onPress={handleEdit}>Save Changes</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Assign */}
      <Modal isOpen={!!showAssign} onOpenChange={() => setShowAssign(null)} classNames={modalClassNames}>
        <ModalContent>
          <ModalHeader>Assign — {showAssign?.name}</ModalHeader>
          <ModalBody className="space-y-3">
            <Input label="Tenant ID" type="number" placeholder="Leave blank to keep current"
              value={assignForm.tenant_id} onChange={e => setAssignForm(f => ({ ...f, tenant_id: e.target.value }))} />
            <Input label="Device ID (integer)" type="number" placeholder="Leave blank to keep current"
              value={assignForm.device_id} onChange={e => setAssignForm(f => ({ ...f, device_id: e.target.value }))} />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setShowAssign(null)}>Cancel</Button>
            <Button color="primary" isLoading={saving} onPress={handleAssign}>Save</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
