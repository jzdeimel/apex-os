"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui/primitives";

export function PatientCheckIn({ date }: { date: string }) {
  const router = useRouter();
  const [weight, setWeight] = useState("");
  const [feeling, setFeeling] = useState("3");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  async function save() {
    const weightLb = weight.trim() ? Number(weight) : undefined;
    if (
      weightLb !== undefined &&
      (!Number.isFinite(weightLb) || weightLb < 50 || weightLb > 800)
    ) {
      setState("error");
      return;
    }
    setState("saving");
    const response = await fetch("/api/member/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        op: "day",
        date,
        weightLb,
        feel: { overall: Number(feeling) },
      }),
    });
    if (!response.ok) {
      setState("error");
      return;
    }
    setState("saved");
    router.refresh();
  }

  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label className="space-y-2 text-detail text-ink-300">
        <span>Weight (optional)</span>
        <Input
          inputMode="decimal"
          value={weight}
          onChange={(event) => setWeight(event.target.value)}
          placeholder="lb"
          aria-label="Weight in pounds"
        />
      </label>
      <label className="space-y-2 text-detail text-ink-300">
        <span>How do you feel today?</span>
        <select
          value={feeling}
          onChange={(event) => setFeeling(event.target.value)}
          className="focus-ring h-11 w-full rounded-control border border-ink-700 bg-ink-900 px-3 text-ink-100"
        >
          <option value="1">1 · Rough</option>
          <option value="2">2 · Below average</option>
          <option value="3">3 · Steady</option>
          <option value="4">4 · Good</option>
          <option value="5">5 · Excellent</option>
        </select>
      </label>
      <Button onClick={() => void save()} disabled={state === "saving"}>
        {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Save check-in"}
      </Button>
      {state === "error" && (
        <p className="text-detail text-high sm:col-span-3">
          The check-in was not saved. Check the weight and try again.
        </p>
      )}
    </div>
  );
}
