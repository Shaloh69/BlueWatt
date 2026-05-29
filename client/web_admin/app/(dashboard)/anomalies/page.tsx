"use client";

import { useState, useEffect } from "react";
import { toast } from "@/lib/toast";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import { AlertTriangle, CheckCircle, Trash2 } from "lucide-react";
import { Tooltip } from "@heroui/tooltip";
import { Select, SelectItem } from "@heroui/select";
import { anomalyApi, getErrorMessage } from "@/lib/api";
import { AnomalyEvent } from "@/types";
import { TableSkeleton } from "@/components/shared/PageLoader";
import {
  useDevices,
  useAnomalyEvents,
  reloadAnomalyEvents,
} from "@/lib/use-api";

const severityColor = (s: string) =>
  s === "critical"
    ? "danger"
    : s === "high"
      ? "warning"
      : s === "medium"
        ? "secondary"
        : "default";

export default function AnomaliesPage() {
  const { data: devices = [] } = useDevices();
  const [selectedDevice, setSelectedDevice] = useState<number | null>(null);
  const [resolving, setResolving] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);
  const { data: events = [], isLoading: loading } =
    useAnomalyEvents(selectedDevice);

  useEffect(() => {
    if (devices.length > 0 && !selectedDevice) setSelectedDevice(devices[0].id);
  }, [devices, selectedDevice]);

  // Unique types present in the current list for the clear dropdown
  const presentTypes = [...new Set((events as AnomalyEvent[]).map((e) => e.anomaly_type))];

  async function handleResolve(event: AnomalyEvent) {
    setResolving(event.id);
    try {
      await anomalyApi.resolve(event.id);
      toast.success("Anomaly resolved");
      if (selectedDevice) reloadAnomalyEvents(selectedDevice);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setResolving(null);
    }
  }

  async function handleDelete(event: AnomalyEvent) {
    setDeleting(event.id);
    try {
      await anomalyApi.delete(event.id);
      toast.success("Anomaly deleted");
      if (selectedDevice) reloadAnomalyEvents(selectedDevice);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDeleting(null);
    }
  }

  async function handleClearByType(type: string) {
    if (!selectedDevice || !type) return;
    setClearing(true);
    try {
      const res = await anomalyApi.deleteByType(selectedDevice, type);
      const count = res.data.data?.deleted ?? 0;
      toast.success(`Deleted ${count} ${type.replace(/_/g, " ")} event${count !== 1 ? "s" : ""}`);
      reloadAnomalyEvents(selectedDevice);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setClearing(false);
    }
  }

  const unresolved = events.filter((e) => !e.is_resolved).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Anomalies</h1>
          <p className="text-default-500 text-sm mt-0.5">
            {unresolved} unresolved
          </p>
        </div>
      </div>

      {/* Device selector */}
      <div className="flex gap-2 flex-wrap">
        {devices.map((d) => (
          <Button
            key={d.id}
            size="sm"
            variant={selectedDevice === d.id ? "solid" : "flat"}
            color={selectedDevice === d.id ? "primary" : "default"}
            onPress={() => setSelectedDevice(d.id)}
          >
            {d.device_name}
          </Button>
        ))}
      </div>

      <Card className="border border-default-200">
        <CardHeader className="flex items-center gap-2 pb-0 flex-wrap">
          <AlertTriangle className="w-5 h-5 text-warning" />
          <h2 className="font-semibold text-foreground">Anomaly Events</h2>
          {unresolved > 0 && (
            <Chip size="sm" color="danger">
              {unresolved} unresolved
            </Chip>
          )}
          {presentTypes.length > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <Select
                size="sm"
                aria-label="Clear by type"
                placeholder="Clear by type..."
                className="w-44"
                isDisabled={clearing || !selectedDevice}
                onSelectionChange={(k) => {
                  const type = String([...k][0] ?? "");
                  if (type) handleClearByType(type);
                }}
              >
                {presentTypes.map((t) => (
                  <SelectItem key={t}>
                    {t.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </Select>
            </div>
          )}
        </CardHeader>
        <CardBody>
          {loading ? (
            <TableSkeleton rows={5} cols={5} />
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <AlertTriangle className="w-10 h-10 text-default-300 mb-3" />
              <p className="text-default-400">
                {selectedDevice ? "No anomalies recorded" : "Select a device"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-default-200">
                    {[
                      "Time",
                      "Type",
                      "Severity",
                      "Relay Tripped",
                      "Status",
                      "Actions",
                    ].map((h) => (
                      <th
                        key={h}
                        className="text-left py-2 px-3 text-default-500 font-medium text-xs uppercase tracking-wide"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr
                      key={e.id}
                      className="border-b border-default-100 hover:bg-default-50"
                    >
                      <td className="py-3 px-3 text-xs text-default-400">
                        {new Date(e.timestamp).toLocaleString()}
                      </td>
                      <td className="py-3 px-3 font-medium text-foreground capitalize">
                        {e.anomaly_type.replace(/_/g, " ")}
                      </td>
                      <td className="py-3 px-3">
                        <Chip
                          size="sm"
                          variant="flat"
                          color={severityColor(e.severity)}
                        >
                          {e.severity}
                        </Chip>
                      </td>
                      <td className="py-3 px-3">
                        <Chip
                          size="sm"
                          variant="flat"
                          color={e.relay_tripped ? "danger" : "default"}
                        >
                          {e.relay_tripped ? "Yes" : "No"}
                        </Chip>
                      </td>
                      <td className="py-3 px-3">
                        <Chip
                          size="sm"
                          variant="flat"
                          color={e.is_resolved ? "success" : "warning"}
                        >
                          {e.is_resolved ? "Resolved" : "Open"}
                        </Chip>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex gap-1">
                          <Tooltip
                            delay={3000}
                            content={
                              e.is_resolved
                                ? "Already resolved"
                                : "Mark this anomaly as resolved"
                            }
                            placement="left"
                            color={e.is_resolved ? "default" : "success"}
                          >
                            <span>
                              <Button
                                size="sm"
                                variant="flat"
                                color="success"
                                isIconOnly
                                isDisabled={e.is_resolved}
                                isLoading={resolving === e.id}
                                onPress={() =>
                                  !e.is_resolved && handleResolve(e)
                                }
                                className={
                                  e.is_resolved
                                    ? "opacity-30 cursor-not-allowed"
                                    : ""
                                }
                              >
                                <CheckCircle className="w-4 h-4" />
                              </Button>
                            </span>
                          </Tooltip>
                          <Tooltip
                            delay={3000}
                            content="Delete this record permanently"
                            placement="left"
                            color="danger"
                          >
                            <Button
                              size="sm"
                              variant="flat"
                              color="danger"
                              isIconOnly
                              isLoading={deleting === e.id}
                              onPress={() => handleDelete(e)}
                            >
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
    </div>
  );
}
