"use client";

import * as React from "react";
import Link from "next/link";
import { UserPlus, Check, Copy, ArrowRight, AlertTriangle, Tablet } from "lucide-react";
import { Button, Card, Badge } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { locations } from "@/lib/mock/locations";
import { useDeskScope } from "@/lib/frontdesk/useDesk";

/**
 * WALK-IN — someone is standing at the desk who is not in the system.
 *
 * This is the single most common front-desk event that Apex previously had no
 * answer for: every other desk surface assumes the person already exists. The
 * receptionist's actual job here is thirty seconds long — take a name and a
 * number so the person is not lost, hand them a tablet, and get back to the
 * phone — so this page is one short form and nothing else.
 *
 * It writes the SAME durable lead + single-use intake invite as the public
 * booking form, through an authenticated, capability-gated endpoint, with
 * `source` recording that they walked in. That matters twice over: the person
 * exists in the funnel immediately (rather than on a sticky note), and the
 * owner console can finally tell walk-ins apart from web leads when judging
 * where new patients actually come from.
 *
 * Nothing here is optimistic. If the write fails, the desk is told, because a
 * receptionist who believes a walk-in was captured will not write it down.
 */
export default function WalkInPage() {
  const { toast } = useToast();
  const [scope] = useDeskScope();

  const [form, setForm] = React.useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    track: "male" as "male" | "female",
    reason: "",
    source: "walk-in" as "walk-in" | "phone" | "referral" | "event",
  });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<null | { leadId: string; intakePath: string }>(null);
  const [copied, setCopied] = React.useState(false);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // A desk belongs to one building; "all" only happens in the multi-site view,
  // where the flagship is the sane default to capture against.
  const siteId = scope === "all" ? "raleigh" : scope;
  const site = locations.find((l) => l.id === siteId);

  const submit = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError("We need a name.");
      return;
    }
    if (form.phone.replace(/\D/g, "").length < 10) {
      setError("We need a phone number — it is how we reach them.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const r = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, locationId: siteId }),
      });
      const res = await r.json().catch(() => ({}));
      if (r.ok && res.ok) {
        setDone({ leadId: res.leadId, intakePath: res.intakePath });
        toast("Walk-in captured", { desc: `${res.leadId} · intake link ready` });
      } else {
        setError(res.error || "Could not save this walk-in. Take their number on paper.");
      }
    } catch {
      setError("Could not reach the server. Take their number on paper.");
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-optimal/15 text-optimal">
              <Check className="h-5 w-5" />
            </span>
            <div>
              <p className="text-heading font-semibold text-ink-50">
                {form.firstName} {form.lastName} is in the system
              </p>
              <p className="stat-mono text-detail text-ink-500">{done.leadId}</p>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-ink-700 bg-ink-950/50 p-4">
            <p className="label-eyebrow">Hand them the tablet</p>
            <p className="mt-1.5 text-detail leading-relaxed text-ink-400">
              This link opens their intake. It expires in 72 hours and can only be used once.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link href={done.intakePath} className="flex-1">
                <Button variant="primary" className="w-full gap-1.5">
                  <Tablet className="h-4 w-4" /> Start intake on this device
                </Button>
              </Link>
              <Button
                variant="outline"
                onClick={() => {
                  if (typeof navigator !== "undefined" && navigator.clipboard) {
                    navigator.clipboard
                      .writeText(`${window.location.origin}${done.intakePath}`)
                      .catch(() => undefined);
                  }
                  setCopied(true);
                }}
                className="gap-1.5"
              >
                <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy link"}
              </Button>
            </div>
          </div>

          <Button
            variant="ghost"
            className="mt-4 w-full"
            onClick={() => {
              setDone(null);
              setForm({
                firstName: "",
                lastName: "",
                phone: "",
                email: "",
                track: "male",
                reason: "",
                source: "walk-in",
              });
              setCopied(false);
            }}
          >
            Add another <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <p className="label-eyebrow">Front desk</p>
        <h1 className="mt-0.5 font-display text-title font-semibold tracking-tight text-ink-50">
          New walk-in
        </h1>
        <p className="mt-1 text-detail text-ink-500">
          Thirty seconds. Name and number is enough — the rest they fill in themselves.
          {site && <> Capturing for <span className="text-ink-300">{site.short ?? site.name}</span>.</>}
        </p>
      </div>

      <Card className="space-y-4 p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="First name" value={form.firstName} onChange={(v) => set("firstName", v)} autoFocus />
          <Field label="Last name" value={form.lastName} onChange={(v) => set("lastName", v)} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Phone" value={form.phone} onChange={(v) => set("phone", v)} type="tel" />
          <Field label="Email (optional)" value={form.email} onChange={(v) => set("email", v)} type="email" />
        </div>

        <div>
          <p className="label-eyebrow mb-1.5">Care track</p>
          <div className="flex gap-2">
            {(["male", "female"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set("track", t)}
                className={`focus-ring flex-1 rounded-lg border px-3 py-2 text-detail transition-colors ${
                  form.track === t
                    ? "border-gold-400/60 bg-gold-400/10 text-gold-200"
                    : "border-ink-700 text-ink-400 hover:border-ink-600"
                }`}
              >
                {t === "male" ? "Men's health" : "Women's health"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="label-eyebrow mb-1.5">How did they reach us</p>
          <div className="flex flex-wrap gap-2">
            {(["walk-in", "phone", "referral", "event"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => set("source", s)}
                className={`focus-ring rounded-full border px-3 py-1.5 text-micro capitalize transition-colors ${
                  form.source === s
                    ? "border-gold-400/60 bg-gold-400/10 text-gold-200"
                    : "border-ink-700 text-ink-400 hover:border-ink-600"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-micro text-ink-600">
            Recorded on the lead — this is what tells the owner console which channels
            actually bring people in.
          </p>
        </div>

        <Field
          label="What brought them in (optional)"
          value={form.reason}
          onChange={(v) => set("reason", v)}
        />

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-critical/40 bg-critical/10 p-2.5 text-detail text-critical">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Button variant="primary" className="h-11 w-full" disabled={saving} onClick={() => void submit()}>
          <UserPlus className="h-4 w-4" />
          {saving ? "Saving…" : "Capture walk-in"}
        </Button>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoFocus?: boolean;
}) {
  const id = React.useId();
  return (
    <div>
      <label htmlFor={id} className="label-eyebrow mb-1.5 block">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        className="focus-ring h-10 w-full rounded-lg border border-ink-700 bg-ink-950/60 px-3 text-body text-ink-100 placeholder:text-ink-600"
      />
    </div>
  );
}
