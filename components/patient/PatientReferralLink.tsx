"use client";

import { useState } from "react";
import { Button } from "@/components/ui/primitives";

export function PatientReferralLink() {
  const [link, setLink] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");

  async function issue() {
    setState("saving");
    const response = await fetch("/api/patient/referrals", { method: "POST" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      setState("error");
      return;
    }
    setLink(payload.shareUrl);
    setState("idle");
  }

  async function copy() {
    if (link) await navigator.clipboard.writeText(link);
  }

  return (
    <div>
      <Button onClick={() => void issue()} disabled={state === "saving"}>
        {state === "saving" ? "Creating…" : "Create a referral link"}
      </Button>
      {link && (
        <div className="mt-4 rounded-control border border-teal-400/30 bg-teal-400/5 p-4">
          <p className="break-all text-detail text-ink-200">{link}</p>
          <p className="mt-2 text-micro text-ink-500">
            This raw link is shown once. Apex stores only its hash.
          </p>
          <Button className="mt-3" size="sm" variant="outline" onClick={() => void copy()}>
            Copy link
          </Button>
        </div>
      )}
      {state === "error" && (
        <p className="mt-3 text-detail text-high">The referral link was not created.</p>
      )}
    </div>
  );
}
