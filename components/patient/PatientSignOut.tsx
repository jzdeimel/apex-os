"use client";

import { useState } from "react";

export function PatientSignOut() {
  const [working, setWorking] = useState(false);

  return (
    <button
      type="button"
      disabled={working}
      className="rounded-control border border-ink-600 px-4 py-2 text-detail font-medium text-ink-200 transition hover:border-ink-400 hover:text-ink-50 disabled:cursor-wait disabled:opacity-60"
      onClick={() => {
        setWorking(true);
        void fetch("/api/patient-auth/logout", { method: "POST" }).finally(() => {
          window.location.replace("/patient-sign-in");
        });
      }}
    >
      {working ? "Signing out…" : "Sign out"}
    </button>
  );
}
