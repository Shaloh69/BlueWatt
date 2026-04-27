"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SWRConfig } from "swr";
import { Sidebar } from "@/components/layout/Sidebar";
import { getStoredToken } from "@/hooks/useAuth";
import { useSSE } from "@/hooks/useSSE";
import { reloadDevices, reloadPayments, reloadPendingPayments, reloadAnomalyEvents } from "@/lib/use-api";
import { toast } from "@/lib/toast";

function SSEListener() {
  useSSE({
    relay_state:       () => { reloadDevices(); },
    device_heartbeat:  () => { reloadDevices(); },
    anomaly: (d) => {
      const type = (d.anomaly_type as string ?? "anomaly").replace(/_/g, " ");
      toast.warning(`Anomaly: ${type} on device ${d.device_id}`);
      if (typeof d.device_id === "number") reloadAnomalyEvents(d.device_id);
    },
    anomaly_resolved: (d) => {
      if (typeof d.device_id === "number") reloadAnomalyEvents(d.device_id);
    },
    payment_submitted: () => { reloadPayments(); reloadPendingPayments(); },
    payment_received:  () => { reloadPayments(); reloadPendingPayments(); },
  });
  return null;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    if (!getStoredToken()) {
      router.replace("/login");
    }
  }, [router]);

  return (
    <SWRConfig value={{ revalidateOnFocus: false, shouldRetryOnError: false }}>
      <SSEListener />
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="page-enter p-6 min-h-full">
            {children}
          </div>
        </main>
      </div>
    </SWRConfig>
  );
}
