"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Lock, Phone, ShieldCheck } from "lucide-react";
import { IntakeWizard } from "@/components/intake/IntakeWizard";
import { BRAND } from "@/lib/brand";
import type { IntakeInvite } from "@/lib/intake/types";
import { Button, Card, CardContent } from "@/components/ui/primitives";

type EntryState =
  | { status: "loading" }
  | { status: "invalid" }
  | { status: "ready"; invite: IntakeInvite };

interface ResolvePayload {
  ok?: boolean;
  prefill?: Record<string, string | null>;
  expiresAt?: string;
}

function inviteFrom(payload: ResolvePayload, token: string): IntakeInvite | null {
  if (!payload.ok || !payload.prefill || !payload.expiresAt) return null;
  const prefill = payload.prefill;
  return {
    id: "live-intake-invite",
    bookingId: "live-intake",
    token,
    tokenSha256: "",
    shortCode: "",
    status: "Sent",
    createdAt: new Date().toISOString(),
    expiresAt: payload.expiresAt,
    prefill: {
      firstName: prefill.firstName ?? "",
      lastName: prefill.lastName ?? "",
      email: prefill.email ?? "",
      phone: prefill.phone ?? "",
      locationId: (prefill.locationId ?? "raleigh") as IntakeInvite["prefill"]["locationId"],
      track: prefill.track === "female" ? "female" : "male",
    },
  };
}

/**
 * Resolve a fragment-carried intake credential without exposing it to the
 * server request URL. The fragment is removed before the API call, and the raw
 * token remains only in this component's memory until submission.
 */
export function SecureIntakeEntry() {
  const [state, setState] = useState<EntryState>({ status: "loading" });

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const token = fragment.get("token");
    window.history.replaceState(null, "", window.location.pathname);
    if (!token) {
      setState({ status: "invalid" });
      return;
    }

    const controller = new AbortController();
    void fetch("/api/public/intake", {
      method: "GET",
      headers: { "x-apex-intake-token": token },
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("invalid");
        const payload = (await response.json()) as ResolvePayload;
        const invite = inviteFrom(payload, token);
        if (!invite) throw new Error("invalid");
        setState({ status: "ready", invite });
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "invalid" });
      });
    return () => controller.abort();
  }, []);

  if (state.status === "ready") return <IntakeWizard invite={state.invite} />;

  return (
    <Card className="mx-auto w-full max-w-xl">
      <CardContent className="p-6 sm:p-8">
        <span
          className={`grid h-10 w-10 place-items-center rounded-full ${
            state.status === "loading" ? "bg-gold-400/15 text-gold-300" : "bg-high/15 text-high"
          }`}
        >
          {state.status === "loading" ? <Lock className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
        </span>
        <h1 className="mt-4 font-display text-title font-semibold tracking-tight text-ink-50">
          {state.status === "loading" ? "Opening your intake" : "This link isn't valid"}
        </h1>
        <p className="mt-2 text-body leading-relaxed text-ink-400" role={state.status === "invalid" ? "alert" : "status"}>
          {state.status === "loading"
            ? "Checking the secure, single-use link…"
            : "Ask Alpha Health for a new link. Expired, used, and unknown links all receive this same response."}
        </p>
        {state.status === "invalid" && (
          <a href={`tel:${BRAND.telehealthPhone}`} className="mt-5 inline-block">
            <Button variant="primary" className="gap-1.5">
              <Phone className="h-4 w-4" />
              Call {BRAND.telehealthPhone}
            </Button>
          </a>
        )}
        <div className="mt-6 flex items-start gap-2.5 border-t border-ink-700/70 pt-4">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" />
          <p className="text-detail leading-relaxed text-ink-500">
            The link credential is removed from the address bar before your intake is loaded.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
