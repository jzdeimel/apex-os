"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Eye,
  PenLine,
  ShieldAlert,
  Siren,
  Download,
  LogIn,
  Check,
  X,
  ChevronRight,
  Filter,
  History,
} from "lucide-react";
import {
  ledger,
  ledgerNewestFirst,
  ledgerStats,
  tamperedLedger,
  type LedgerRow,
  type LedgerAction,
} from "@/lib/trace/ledger";
import { shortHash } from "@/lib/trace/hash";
import { ChainVerifier } from "@/components/trace/ChainVerifier";
import { Card, CardContent, Badge, Button, EmptyState } from "@/components/ui/primitives";
import { Stagger, StaggerItem } from "@/components/motion";
import { locationName } from "@/lib/mock/locations";
import { formatDateTime } from "@/lib/utils";

const ACTION_META: Record<
  LedgerAction,
  { icon: typeof Eye; tone: "neutral" | "optimal" | "watch" | "high" | "low" | "gold"; label: string }
> = {
  view: { icon: Eye, tone: "low", label: "Viewed" },
  create: { icon: PenLine, tone: "neutral", label: "Created" },
  update: { icon: PenLine, tone: "neutral", label: "Updated" },
  sign: { icon: Check, tone: "optimal", label: "Signed" },
  approve: { icon: Check, tone: "optimal", label: "Approved" },
  decline: { icon: X, tone: "watch", label: "Declined" },
  deny: { icon: ShieldAlert, tone: "high", label: "Access denied" },
  export: { icon: Download, tone: "watch", label: "Exported" },
  login: { icon: LogIn, tone: "neutral", label: "Signed in" },
  "break-glass": { icon: Siren, tone: "high", label: "Break-glass" },
};

type Lens = "all" | "reads" | "writes" | "security";

const LENSES: { id: Lens; label: string; hint: string }[] = [
  { id: "all", label: "Everything", hint: "every event, reads included" },
  { id: "reads", label: "Reads", hint: "who looked at what" },
  { id: "writes", label: "Writes", hint: "what changed" },
  { id: "security", label: "Security", hint: "denials & break-glass" },
];

export default function LedgerPage() {
  const [tampered, setTampered] = useState(false);
  const [lens, setLens] = useState<Lens>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  // The verifier walks the chain in written order; the table reads newest first.
  const rows = useMemo(
    () => (tampered ? tamperedLedger(ledger, 96) : ledger),
    [tampered],
  );
  const stats = useMemo(() => ledgerStats(ledger), []);

  const visible = useMemo(() => {
    const desc = tampered ? [...rows].reverse() : ledgerNewestFirst();
    if (lens === "reads") return desc.filter((r) => r.action === "view" || r.action === "export");
    if (lens === "writes")
      return desc.filter((r) =>
        ["create", "update", "sign", "approve", "decline"].includes(r.action),
      );
    if (lens === "security")
      return desc.filter((r) => r.action === "deny" || r.action === "break-glass");
    return desc;
  }, [lens, rows, tampered]);

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div>
        <p className="label-eyebrow">Governance</p>
        <h1 className="mt-1 font-display text-title font-semibold tracking-tight text-ink-50">
          Audit Ledger
        </h1>
        <p className="mt-2 max-w-2xl text-body leading-relaxed text-ink-400">
          Append-only and hash-chained. Every read, write, denial and
          break-glass event is a link in one chain — so the record can prove it
          hasn&apos;t been edited, not merely assert it.
        </p>
      </div>

      {/* ── Stat row ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div>
          <StatTile label="Events" value={stats.total} hint="this window" />
        </div>
        <div>
          <StatTile label="Reads logged" value={stats.reads} hint="most systems log none" tone="low" />
        </div>
        <div>
          <StatTile label="Writes" value={stats.writes} hint="with before/after" />
        </div>
        <div>
          <StatTile label="Denials" value={stats.denials} hint="blocked attempts" tone="high" />
        </div>
        <div>
          <StatTile label="Break-glass" value={stats.breakGlass} hint="emergency access" tone="high" />
        </div>
      </div>

      {/* ── Verifier ───────────────────────────────────────────────── */}
      <ChainVerifier
        rows={rows}
        tampered={tampered}
        onTamper={() => setTampered(true)}
        onReset={() => setTampered(false)}
      />

      {/* ── Lens filter ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-ink-500" />
        {LENSES.map((l) => (
          <button
            key={l.id}
            onClick={() => setLens(l.id)}
            title={l.hint}
            className={`relative rounded-full px-3 py-1.5 text-detail font-medium transition-colors focus-ring ${
              lens === l.id ? "text-ink-50" : "text-ink-400 hover:text-ink-200"
            }`}
          >
            {lens === l.id && (
              <motion.span
                layoutId="ledger-lens"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-full border border-gold-400/30 bg-gold-400/12"
              />
            )}
            <span className="relative">{l.label}</span>
          </button>
        ))}
        <span className="ml-auto stat-mono text-micro text-ink-500">
          {visible.length.toLocaleString()} records
        </span>
      </div>

      {/* ── Event stream ───────────────────────────────────────────── */}
      {visible.length === 0 ? (
        <EmptyState icon={<History className="h-6 w-6" />} title="No events in this lens" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-ink-800/60">
              {visible.slice(0, 60).map((row) => (
                <LedgerRowItem
                  key={row.id}
                  row={row}
                  open={openId === row.id}
                  onToggle={() => setOpenId((v) => (v === row.id ? null : row.id))}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <p className="text-micro text-ink-600">
        Showing the 60 most recent records in this lens. Demo ledger — synthetic
        events over synthetic patients.
      </p>
    </div>
  );
}

function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: number;
  hint: string;
  tone?: "neutral" | "low" | "high";
}) {
  const toneClass =
    tone === "low" ? "text-low" : tone === "high" ? "text-high" : "text-ink-50";
  return (
    <div className="card p-4">
      <p className="label-eyebrow">{label}</p>
      <p className={`stat-mono mt-1 text-title font-semibold ${toneClass}`}>
        {value.toLocaleString()}
      </p>
      <p className="mt-0.5 text-micro text-ink-600">{hint}</p>
    </div>
  );
}

function LedgerRowItem({
  row,
  open,
  onToggle,
}: {
  row: LedgerRow;
  open: boolean;
  onToggle: () => void;
}) {
  const meta = ACTION_META[row.action];
  const Icon = meta.icon;
  const hasDiff = Boolean(row.before || row.after);

  return (
    <li>
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-ink-800/40 focus-ring"
      >
        <span
          className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border ${
            meta.tone === "high"
              ? "border-high/30 bg-high/12 text-high"
              : meta.tone === "optimal"
                ? "border-optimal/30 bg-optimal/12 text-optimal"
                : meta.tone === "watch"
                  ? "border-watch/30 bg-watch/12 text-watch"
                  : meta.tone === "low"
                    ? "border-low/30 bg-low/12 text-low"
                    : "border-ink-700 bg-ink-800 text-ink-400"
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            <span className="text-body font-medium text-ink-100">{row.actorName}</span>
            <span className="text-detail text-ink-500">{meta.label.toLowerCase()}</span>
            <span className="text-body text-ink-300">{row.entity}</span>
            {row.subjectName && (
              <>
                <span className="text-detail text-ink-600">for</span>
                <span className="text-body text-ink-200">{row.subjectName}</span>
              </>
            )}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-ink-600">
            <span className="stat-mono">{formatDateTime(row.at)}</span>
            <span>{row.actorRole}</span>
            {row.locationId && <span>{locationName(row.locationId)}</span>}
            <span className="stat-mono text-ink-700">{shortHash(row.hash)}</span>
          </span>
          {row.reason && (
            <span className="mt-1.5 block text-micro italic text-ink-500">
              “{row.reason}”
            </span>
          )}
        </span>

        <ChevronRight
          className={`mt-1 h-4 w-4 shrink-0 text-ink-600 transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-3 border-t border-ink-800/60 bg-ink-900/40 p-4">
              {hasDiff ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <DiffPane label="Before" data={row.before} tone="high" />
                  <DiffPane label="After" data={row.after} tone="optimal" />
                </div>
              ) : (
                <p className="text-detail text-ink-500">
                  Read event — no state changed. Logged because knowing who
                  looked is the point.
                </p>
              )}

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Fact label="Record" value={row.id} />
                <Fact label="Entity id" value={row.entityId} />
                <Fact label="prevHash" value={shortHash(row.prevHash)} />
                <Fact label="hash" value={shortHash(row.hash)} />
              </div>

              {row.subjectId && (
                <Link
                  href={`/clients/${row.subjectId}`}
                  className="inline-flex items-center gap-1 text-detail text-gold-300 underline-offset-4 hover:underline focus-ring"
                >
                  Open {row.subjectName}&apos;s chart
                  <ChevronRight className="h-3 w-3" />
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

function DiffPane({
  label,
  data,
  tone,
}: {
  label: string;
  data?: Record<string, unknown>;
  tone: "high" | "optimal";
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        tone === "high" ? "border-high/20 bg-high/5" : "border-optimal/20 bg-optimal/5"
      }`}
    >
      <p className="label-eyebrow">{label}</p>
      {data ? (
        <dl className="mt-1.5 space-y-1">
          {Object.entries(data).map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3">
              <dt className="text-micro text-ink-500">{k}</dt>
              <dd className="stat-mono truncate text-micro text-ink-200">
                {v === null ? "—" : String(v)}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-1.5 text-micro text-ink-600">— (record did not exist)</p>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink-800 bg-ink-950/40 px-3 py-1.5">
      <p className="text-micro uppercase tracking-wide text-ink-600">{label}</p>
      <p className="stat-mono truncate text-micro text-ink-300">{value}</p>
    </div>
  );
}
