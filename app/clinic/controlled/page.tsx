"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Pill,
  ShieldAlert,
  ShieldCheck,
  PackageSearch,
  BadgeAlert,
  ClipboardCheck,
  ChevronRight,
  Copy,
  Check,
} from "lucide-react";
import { usePortal } from "@/lib/portalStore";
import { staffIdForPortal } from "@/lib/access/clientScope";
import { scopeFor } from "@/lib/frontdesk/scope";
import {
  controlledPrescriptions,
  dispenseGate,
  controlledSummary,
  dispensedLots,
  recallForLot,
  REFILLS_AUTHORISED,
  type DispenseGate,
} from "@/lib/clinical/controlled";
import { getClient, clientName } from "@/lib/mock/clients";
import { locationName } from "@/lib/mock/locations";
import { staff } from "@/lib/mock/staff";
import { formatDate } from "@/lib/utils";

/**
 * The controlled-substance board.
 *
 * This is the surface a testosterone clinic keeps because it has to, and the one
 * a general booking tool cannot offer at all. It answers three questions a
 * Schedule-III programme is judged on: which scripts cannot be dispensed right
 * now and why, whose credentials are lapsing, and — if a lot is recalled — who
 * received it.
 *
 * It is location-scoped exactly like the rest of the app: a clinic persona sees
 * the controlled scripts at the locations they are assigned to; the owner sees
 * every site. The scope decision is reused, not re-derived.
 */

export default function ControlledPage() {
  const { portal } = usePortal();
  const staffId = staffIdForPortal(portal.id);
  const scope = useMemo(() => scopeFor(staffId), [staffId]);

  // Only a medical or owner surface has any business here.
  const allowed = portal.id === "clinic" || portal.id === "exec";

  const visibleRx = useMemo(() => {
    if (!allowed) return [];
    return controlledPrescriptions.filter((rx) => {
      const c = getClient(rx.clientId);
      if (!c) return false;
      return scope.unrestricted || scope.allowed.includes(c.locationId);
    });
  }, [allowed, scope]);

  const gates = useMemo(
    () => visibleRx.map((rx) => dispenseGate(rx)).filter(Boolean) as DispenseGate[],
    [visibleRx],
  );
  const summary = useMemo(() => controlledSummary(), []);

  if (!allowed) {
    return (
      <div className="mx-auto max-w-md rounded-panel border border-ink-800 bg-ink-900/40 px-6 py-10 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-watch" aria-hidden />
        <h1 className="mt-3 text-heading text-ink-50">Restricted</h1>
        <p className="mt-2 text-detail leading-relaxed text-ink-400">
          The controlled-substance board is for the medical team and ownership.
        </p>
      </div>
    );
  }

  const blocked = gates.filter((g) => !g.canDispense);
  const clear = gates.filter((g) => g.canDispense);

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <Pill className="h-5 w-5 text-gold-400" aria-hidden />
          <h1 className="font-display text-title font-bold tracking-tight text-ink-50">Controlled substances</h1>
        </div>
        <p className="mt-1 text-detail text-ink-400">
          Schedule III oversight — testosterone. {scope.unrestricted ? "All locations." : scope.reason}
        </p>
      </header>

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Controlled scripts" value={visibleRx.length} tone="neutral" icon={Pill} />
        <Stat label="Cannot dispense" value={blocked.length} tone={blocked.length ? "high" : "good"} icon={ShieldAlert} />
        <Stat
          label="PDMP gaps"
          value={gates.filter((g) => g.blockers.some((b) => b.kind === "pdmp-missing" || b.kind === "pdmp-stale")).length}
          tone="watch"
          icon={ClipboardCheck}
        />
        <Stat label="Credential alerts" value={summary.credentialIssues.length} tone={summary.credentialIssues.length ? "watch" : "good"} icon={BadgeAlert} />
      </div>

      {/* Credential alerts */}
      {summary.credentialIssues.length > 0 && (
        <section className="rounded-panel border border-watch/30 bg-watch/5 p-4">
          <div className="flex items-center gap-2">
            <BadgeAlert className="h-4 w-4 text-watch" aria-hidden />
            <h2 className="text-heading text-ink-50">Prescriber credentials</h2>
          </div>
          <ul className="mt-3 space-y-1.5">
            {summary.credentialIssues.map((c, i) => (
              <li key={i} className="flex items-center justify-between text-detail">
                <span className="text-ink-200">{c.name}</span>
                <span className="text-watch">
                  {c.issue} · {formatDate(c.date)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-micro leading-relaxed text-ink-600">
            A controlled dispense cannot be backed by a lapsed licence or DEA. These block the affected
            prescriber&apos;s scripts below until renewed.
          </p>
        </section>
      )}

      {/* Dispense gate — blocked first, loud */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-heading text-ink-50">
          <ShieldAlert className="h-4 w-4 text-high" aria-hidden /> Dispense gate
        </h2>
        {gates.length === 0 ? (
          <p className="rounded-panel border border-ink-800 bg-ink-900/40 px-5 py-6 text-center text-detail text-ink-500">
            No controlled scripts at your locations.
          </p>
        ) : (
          <div className="space-y-2.5">
            {[...blocked, ...clear].map((g) => (
              <GateRow key={g.rxId} gate={g} />
            ))}
          </div>
        )}
      </section>

      {/* Lot recall */}
      <LotRecall />
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone: "neutral" | "good" | "watch" | "high";
  icon: typeof Pill;
}) {
  const toneCls =
    tone === "high"
      ? "text-high"
      : tone === "watch"
        ? "text-gold-300"
        : tone === "good"
          ? "text-emerald"
          : "text-ink-100";
  return (
    <div className="rounded-panel border border-ink-800 bg-ink-900/40 p-3.5">
      <div className="flex items-center gap-1.5 text-micro uppercase tracking-[0.12em] text-ink-500">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </div>
      <p className={"stat-mono mt-1 text-title font-semibold " + toneCls}>{value}</p>
    </div>
  );
}

function GateRow({ gate }: { gate: DispenseGate }) {
  const client = getClient(gate.clientId);
  const rx = [...controlledPrescriptions].find((r) => r.id === gate.rxId);
  const prescriber = rx ? staff.find((s) => s.id === rx.signedByStaffId)?.name : undefined;
  const [open, setOpen] = useState(!gate.canDispense);

  return (
    <div
      className={
        "rounded-panel border " +
        (gate.canDispense ? "border-ink-800 bg-ink-900/40" : "border-high/30 bg-high/5")
      }
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="focus-ring flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {gate.canDispense ? (
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald" aria-hidden />
            ) : (
              <ShieldAlert className="h-4 w-4 shrink-0 text-high" aria-hidden />
            )}
            <Link
              href={`/clients/${gate.clientId}`}
              onClick={(e) => e.stopPropagation()}
              className="truncate text-body font-medium text-ink-50 hover:text-gold-200"
            >
              {client ? clientName(client) : gate.clientId}
            </Link>
            <span className="rounded-full border border-ink-700 px-2 py-0.5 text-micro text-ink-400">Sch {gate.schedule}</span>
          </div>
          <p className="mt-0.5 truncate text-micro text-ink-500">
            {rx?.name} · {gate.fillsUsed}/{gate.refillsAuthorised + 1} fills · {prescriber ?? "—"}
            {client ? ` · ${locationName(client.locationId)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={"text-micro font-medium " + (gate.canDispense ? "text-emerald" : "text-high")}>
            {gate.canDispense ? "Clear to dispense" : `${gate.blockers.length} blocker${gate.blockers.length === 1 ? "" : "s"}`}
          </span>
          <ChevronRight className={"h-4 w-4 text-ink-600 transition-transform " + (open ? "rotate-90" : "")} aria-hidden />
        </div>
      </button>

      {open && (gate.blockers.length > 0 || gate.pdmp) && (
        <div className="space-y-2 border-t border-ink-800/70 px-4 py-3">
          {gate.blockers.map((b, i) => (
            <div key={i} className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-high" aria-hidden />
              <div>
                <p className="text-detail font-medium text-high">{b.label}</p>
                <p className="text-micro leading-relaxed text-ink-400">{b.detail}</p>
              </div>
            </div>
          ))}
          {gate.canDispense && (
            <p className="flex items-center gap-1.5 text-detail text-emerald">
              <Check className="h-3.5 w-3.5" aria-hidden /> PDMP current, refills available, prescriber credentials in
              force.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function LotRecall() {
  const lots = useMemo(() => dispensedLots(), []);
  const [lot, setLot] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const result = useMemo(() => (lot ? recallForLot(lot) : null), [lot]);

  return (
    <section className="rounded-panel border border-ink-700/70 bg-ink-850/60">
      <header className="flex items-center gap-2 border-b border-ink-800/70 px-5 py-4">
        <PackageSearch className="h-4 w-4 text-gold-400" aria-hidden />
        <h2 className="text-heading text-ink-50">Lot recall</h2>
      </header>
      <div className="space-y-4 px-5 py-5">
        <p className="text-detail leading-relaxed text-ink-400">
          Pick a dispensed lot to see every patient who received it — the query a recall notice demands
          and a spreadsheet cannot answer.
        </p>
        <div className="flex flex-wrap gap-2">
          {lots.map((l) => (
            <button
              key={l.lotNumber}
              type="button"
              onClick={() => {
                setLot(l.lotNumber);
                setCopied(false);
              }}
              className={
                "rounded-control border px-3 py-1.5 text-detail transition-colors " +
                (lot === l.lotNumber
                  ? "border-gold-400/50 bg-gold-400/10 text-gold-200"
                  : "border-ink-700 text-ink-400 hover:text-ink-100")
              }
            >
              <span className="stat-mono">{l.lotNumber}</span>
              <span className="ml-1.5 text-micro text-ink-600">{l.productName} · {l.count}</span>
            </button>
          ))}
        </div>

        {result && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-detail text-ink-300">
                Lot <span className="stat-mono text-ink-50">{result.lotNumber}</span>
                {result.productName ? ` · ${result.productName}` : ""}
              </p>
              <p className="text-detail font-medium text-high">
                {new Set(result.hits.map((h) => h.clientId)).size} patient
                {new Set(result.hits.map((h) => h.clientId)).size === 1 ? "" : "s"} affected
              </p>
            </div>

            {result.hits.length > 0 && (
              <div className="overflow-hidden rounded-control border border-ink-800">
                <table className="w-full text-detail">
                  <thead className="bg-ink-900/60 text-micro uppercase tracking-wide text-ink-500">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Patient</th>
                      <th className="px-3 py-2 text-left font-medium">Location</th>
                      <th className="px-3 py-2 text-left font-medium">Dispensed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.hits.map((h, i) => (
                      <tr key={i} className="border-t border-ink-800/70">
                        <td className="px-3 py-2">
                          <Link href={`/clients/${h.clientId}`} className="text-ink-100 hover:text-gold-200">
                            {h.clientName}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-ink-400">{locationName(h.locationId)}</td>
                        <td className="px-3 py-2 text-ink-400">{formatDate(h.dispensedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="rounded-control border border-ink-800 bg-ink-900/40 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-micro uppercase tracking-[0.12em] text-ink-500">Drafted outreach</p>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(result.outreachDraft).then(() => setCopied(true)).catch(() => {});
                  }}
                  className="focus-ring inline-flex items-center gap-1.5 rounded-control border border-ink-700 px-2 py-1 text-micro text-ink-400 hover:text-ink-100"
                >
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <pre className="whitespace-pre-wrap font-sans text-micro leading-relaxed text-ink-300">{result.outreachDraft}</pre>
            </div>
          </motion.div>
        )}
      </div>
    </section>
  );
}
