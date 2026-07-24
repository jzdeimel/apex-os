"use client";

import * as React from "react";

import type { Escalation } from "@/lib/escalations/types";

export function useEscalations(query: { clientId?: string; raisedBy?: string } = {}) {
  const [items, setItems] = React.useState<Escalation[]>([]);
  const [now, setNow] = React.useState<string>(new Date().toISOString());
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const key = query.clientId
    ? `clientId=${encodeURIComponent(query.clientId)}`
    : query.raisedBy
      ? `raisedBy=${encodeURIComponent(query.raisedBy)}`
      : "";

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/escalations${key ? `?${key}` : ""}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) {
        setError(body.error || `The Medical queue is unavailable (HTTP ${response.status}).`);
        return;
      }
      setItems(Array.isArray(body.escalations) ? body.escalations : []);
      setNow(body.now || new Date().toISOString());
      setError(null);
    } catch {
      setError("The Medical queue could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, [key]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const update = React.useCallback((next: Escalation) => {
    setItems((current) => current.map((item) => (item.id === next.id ? next : item)));
  }, []);

  return { items, now, loading, error, refresh, update };
}
