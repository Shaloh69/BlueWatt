"use client";

import { useEffect, useRef, useCallback } from "react";
import { SseEventType } from "@/types";
import { getStoredToken } from "./useAuth";

type SseHandler = (data: Record<string, unknown>) => void;

export function useSSE(handlers: Partial<Record<SseEventType, SseHandler>>) {
  const esRef = useRef<EventSource | null>(null);
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  const connect = useCallback(() => {
    const token = getStoredToken();
    if (!token) return;

    const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";
    const url = `${base}/sse/events?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    esRef.current = es;

    const eventTypes: SseEventType[] = [
      "anomaly",
      "power_reading",
      "relay_state",
      "relay_command_issued",
      "payment_submitted",
      "payment_received",
      "payment_rejected",
    ];

    eventTypes.forEach((type) => {
      es.addEventListener(type, (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as Record<string, unknown>;
          handlersRef.current[type]?.(data);
        } catch {
          // ignore parse errors
        }
      });
    });

    es.onerror = () => {
      es.close();
      // Reconnect after 5 seconds
      setTimeout(connect, 5000);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
    };
  }, [connect]);
}
