"use client";

/**
 * Consents — what you've agreed to, and how to take it back.
 *
 * Consent in most clinic software is a checkbox on an intake form that nobody
 * can find again afterwards, and revoking it means calling the front desk and
 * hoping. Modelling each grant as its own scoped, dated, revocable record does
 * two things: it lets a member actually exercise the right they were given, and
 * it makes the blast radius of revoking explicit.
 *
 * That last part is the important one. The reason people never revoke marketing
 * consent is that they are quietly afraid it will affect their care. It does
 * not, and this page says so on every card rather than burying it in a policy.
 */

import { useState } from "react";
import { Card, CardContent, Badge, Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { Stagger, StaggerItem } from "@/components/portal/still";
import { formatDate, cn } from "@/lib/utils";
import { useMe, useMeClient, PortalPageHeader } from "@/components/portal/PortalHeader";
import { ShieldCheck, Stethoscope, Megaphone, Building2, Undo2, Lock } from "lucide-react";

type Scope = "clinical" | "operational" | "marketing";

interface ConsentGrant {
  id: string;
  scope: Scope;
  title: string;
  /** What this actually permits, in the second person. */
  permits: string[];
  /** What it explicitly does NOT permit — the part that builds trust. */
  neverPermits: string;
  grantedOn: string;
  /** Required consents cannot be revoked without ending care; say so honestly. */
  required: boolean;
  /** Plain-English consequence of revoking, shown before and after the action. */
  ifRevoked: string;
}

/**
 * Fallback grants.
 *
 * The brief points at `grantsForClient` / `consentSummary` from
 * `lib/comms/consent.ts`; that module is not in the tree, and a portal page
 * should not fail to build because a sibling module is late. Swap the array for
 * `grantsForClient(meId)` when it lands — the shape below is intentionally the
 * one that module should expose.
 *
 * Static dates, no `new Date()`, so the demo is identical on every render.
 */
const GRANTS: ConsentGrant[] = [
  {
    id: "con-clinical",
    scope: "clinical",
    title: "Treatment and care",
    permits: [
      "Your coach and your provider can see your full record — labs, plan, notes and messages.",
      "Your provider can prescribe, adjust and sign your protocol.",
      "A covering clinician can read your chart if yours is unavailable and you need care.",
    ],
    neverPermits:
      "Nobody outside your care team sees your chart on this consent, and every look is written to the log on your privacy page.",
    grantedOn: "2026-01-08",
    required: true,
    ifRevoked:
      "This one is what lets us treat you at all. Withdrawing it ends your care with Alpha Health — we would rather talk it through first.",
  },
  {
    id: "con-ops",
    scope: "operational",
    title: "Appointments, refills and billing",
    permits: [
      "We can text and email you about visits, lab draws and shipments.",
      "We can share the minimum necessary with the pharmacy and lab that fill your orders.",
      "We can run your card for your membership and anything you order.",
    ],
    neverPermits: "This never covers promotions, offers or anything a partner company sends.",
    grantedOn: "2026-01-08",
    required: false,
    ifRevoked:
      "You would stop getting reminders and shipping updates, and would need to check this portal for them instead. Your care is unaffected.",
  },
  {
    id: "con-marketing",
    scope: "marketing",
    title: "Promotions and clinic news",
    permits: [
      "We can email you about new services, events and member offers.",
      "We can include you in general clinic announcements.",
    ],
    neverPermits: "We never sell your information, and we never share your health data with advertisers.",
    grantedOn: "2026-02-14",
    required: false,
    ifRevoked:
      "You stop hearing about offers and events. Nothing else changes — not your plan, not your visits, not how quickly your coach replies.",
  },
  {
    id: "con-research",
    scope: "operational",
    title: "De-identified outcomes reporting",
    permits: [
      "Your results can be counted in aggregate statistics about how our programs perform.",
      "Your numbers are stripped of your name, contact details and record number first.",
    ],
    neverPermits: "Nothing that could identify you leaves Alpha Health under this consent.",
    grantedOn: "2026-03-12",
    required: false,
    ifRevoked: "Your results are excluded from all program statistics going forward. Your care is unaffected.",
  },
];

const SCOPE_META: Record<Scope, { label: string; icon: typeof Stethoscope; tone: "optimal" | "gold" | "neutral"; blurb: string }> = {
  clinical: {
    label: "Care",
    icon: Stethoscope,
    tone: "optimal",
    blurb: "Everything needed to actually treat you.",
  },
  operational: {
    label: "Running your account",
    icon: Building2,
    tone: "neutral",
    blurb: "Scheduling, shipping, billing — the logistics of being a member.",
  },
  marketing: {
    label: "Marketing",
    icon: Megaphone,
    tone: "gold",
    blurb: "Optional, always. Turning this off never touches your care.",
  },
};

export default function PortalConsentsPage() {
  // Audit fix (GAP_ANALYSIS.md, "Portal renderable as a woman"): this was the
  // module constant ME, which pinned the portal to one male member.
  const meId = useMe();
  const client = useMeClient();
  const { toast } = useToast();
  // Revocations are local-only in the demo. In production this writes a
  // `consent` ledger event with the member as actor — a member revoking their
  // own consent is exactly as auditable as a clinician changing a protocol.
  const [revoked, setRevoked] = useState<string[]>([]);

  function revoke(g: ConsentGrant) {
    setRevoked((r) => [...r, g.id]);
    toast(`${g.title} turned off`, {
      desc: g.ifRevoked,
      tone: "info",
    });
  }

  function restore(g: ConsentGrant) {
    setRevoked((r) => r.filter((id) => id !== g.id));
    toast(`${g.title} turned back on`, { desc: "Effective immediately." });
  }

  const activeCount = GRANTS.length - revoked.length;

  return (
    <div className="space-y-6">
      <PortalPageHeader
        eyebrow="Consents"
        title="What you've agreed to"
        subtitle="Every permission you've given us, what it actually allows, and a switch to take it back."
      />

      <div className="rounded-panel border border-optimal/20 bg-optimal/[0.06] p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-optimal" />
          <div>
            <p className="text-detail font-medium text-ink-50">
              Turning off marketing does not affect your care. Ever.
            </p>
            <p className="mt-2 max-w-3xl text-detail leading-relaxed text-ink-300">
              These are separate permissions on purpose, so that saying no to one thing never quietly costs you
              another. {client.firstName}, you currently have{" "}
              <span className="stat-mono text-ink-100">{activeCount}</span> of{" "}
              <span className="stat-mono text-ink-100">{GRANTS.length}</span> permissions on. Changes take
              effect immediately and are recorded in the same log you can read on your privacy page — including
              the fact that <span className="text-ink-100">you</span> made the change, not us.
            </p>
          </div>
        </div>
      </div>

      <Stagger className="space-y-3">
        {GRANTS.map((g) => {
          const isRevoked = revoked.includes(g.id);
          const meta = SCOPE_META[g.scope];
          const Icon = meta.icon;
          return (
            <StaggerItem key={g.id}>
              <Card className={cn(isRevoked && "opacity-70")}>
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className={cn(
                          "grid h-10 w-10 shrink-0 place-items-center rounded-panel",
                          isRevoked ? "bg-ink-800 text-ink-500" : "bg-optimal/12 text-optimal",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-display text-body font-semibold text-ink-50">{g.title}</h2>
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                          {g.required && (
                            <Badge tone="neutral">
                              <Lock className="h-3 w-3" />
                              Required for care
                            </Badge>
                          )}
                          {isRevoked ? (
                            <Badge tone="high">Turned off</Badge>
                          ) : (
                            <Badge tone="optimal">On</Badge>
                          )}
                        </div>
                        <p className="mt-1 text-micro text-ink-500">
                          {meta.blurb} · Agreed{" "}
                          <span className="stat-mono text-ink-400">{formatDate(g.grantedOn)}</span>
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {isRevoked ? (
                        <Button variant="outline" size="sm" onClick={() => restore(g)}>
                          <Undo2 className="h-3.5 w-3.5" />
                          Turn back on
                        </Button>
                      ) : g.required ? (
                        <Button variant="ghost" size="sm" disabled title="Talk to your provider first">
                          Cannot be turned off here
                        </Button>
                      ) : (
                        <Button variant="danger" size="sm" onClick={() => revoke(g)}>
                          Turn this off
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <p className="label-eyebrow">What this allows</p>
                      <ul className="mt-2 space-y-1.5">
                        {g.permits.map((p, i) => (
                          <li key={i} className="flex gap-2 text-micro leading-relaxed text-ink-300">
                            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-optimal" />
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="label-eyebrow">What it never allows</p>
                      <p className="mt-2 text-micro leading-relaxed text-ink-300">{g.neverPermits}</p>
                      <p className="mt-3 rounded-control border border-ink-700/70 bg-ink-900/60 p-2.5 text-micro leading-relaxed text-ink-400">
                        <span className="text-ink-200">If you turn this off: </span>
                        {g.ifRevoked}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>
          );
        })}
      </Stagger>

      <p className="text-micro leading-relaxed text-ink-500">
        Demo build — changes here stay in this browser and are not sent anywhere. In the live system each
        change is written to your record as a dated event you can see on your privacy page, with you named as
        the person who made it. Member <span className="stat-mono">{meId}</span>.
      </p>
    </div>
  );
}
