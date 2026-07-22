"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/primitives";

export default function PatientSignInPage() {
  const [state, setState] = useState<"working" | "failed">("working");
  const [message, setMessage] = useState("Securing your patient portal…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get("token");
    window.history.replaceState(null, "", window.location.pathname);
    if (!token) {
      setState("failed");
      setMessage("This sign-in link is incomplete. Ask Alpha Health for a new link.");
      return;
    }
    void fetch("/api/patient-auth/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? "This sign-in link could not be used.");
        }
        window.location.replace("/portal");
      })
      .catch((error) => {
        setState("failed");
        setMessage(error instanceof Error ? error.message : "This sign-in link could not be used.");
      });
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-5 py-12">
      <Card className="w-full">
        <CardContent className="p-8 text-center">
          <p className="label-eyebrow">Alpha Health</p>
          <h1 className="mt-3 font-display text-title text-ink-50">
            {state === "working" ? "Signing you in" : "Link unavailable"}
          </h1>
          <p className="mt-4 text-body leading-relaxed text-ink-400" role={state === "failed" ? "alert" : "status"}>
            {message}
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
