"use client";

import * as React from "react";
import Link from "next/link";
import {
  Search,
  Upload,
  FileText,
  Eye,
  EyeOff,
  Download,
  ShieldCheck,
  Sparkles,
  FolderOpen,
} from "lucide-react";
import type { Document, DocumentKind } from "@/lib/documents/types";
import {
  DOCUMENT_KINDS,
  formatBytes,
  isReimbursable,
} from "@/lib/documents/types";
import { documents } from "@/lib/mock/documents";
import { clientMap, clientName } from "@/lib/mock/clients";
import { staffName } from "@/lib/mock/staff";
import { shortHash } from "@/lib/trace/hash";
import { Button, Input, Select, Badge, EmptyState } from "@/components/ui/primitives";
import { FadeIn } from "@/components/motion";
import { useToast } from "@/components/ui/Toast";
import { cn, formatDate } from "@/lib/utils";

/**
 * Coach · Documents
 *
 * Every file attached to a member, in one place, with the three columns that
 * actually get used and are usually missing:
 *
 *  - HASH. The row shows `sha256` (shortened). A document store without a
 *    visible integrity digest cannot answer "is this the same file the provider
 *    signed off on," and that question only ever gets asked on the worst day.
 *    See lib/documents/types.ts for why the row is a pointer, not a payload.
 *  - VISIBLE TO MEMBER. Explicit per row, never inferred from kind. A member
 *    discovering an abnormal result in their portal before their provider has
 *    called them is a real harm.
 *  - HSA/FSA. Alpha Health's members reimburse a lot of this, and a card receipt
 *    usually is not enough — the itemised superbill is. Both kinds get a
 *    one-click download affordance so a coach never has to explain the
 *    difference over the phone.
 *
 * Demo-shaped: no upload, no download, no signed URL. Every action toasts what
 * would happen and stops.
 */

type SortKey = "date" | "member" | "kind" | "size";

const KIND_TONE: Record<DocumentKind, "gold" | "optimal" | "watch" | "info" | "neutral"> = {
  "Lab report": "gold",
  "Signed consent": "optimal",
  "Plan of care": "info",
  Receipt: "neutral",
  Superbill: "neutral",
  "Body scan": "watch",
  ID: "neutral",
  Other: "neutral",
};

export default function DocumentsPage() {
  const { toast } = useToast();
  const [q, setQ] = React.useState("");
  const [kind, setKind] = React.useState<DocumentKind | "all">("all");
  const [memberId, setMemberId] = React.useState("all");
  const [visibility, setVisibility] = React.useState<"all" | "visible" | "hidden">("all");
  const [sort, setSort] = React.useState<SortKey>("date");

  // Members who actually have files. Offering the full 500-person roster in a
  // filter that would return nothing for most of them is a worse control than
  // no control at all.
  const members = React.useMemo(() => {
    const ids = Array.from(new Set(documents.map((d) => d.clientId)));
    return ids
      .map((id) => clientMap[id])
      .filter(Boolean)
      .sort((a, b) => a.lastName.localeCompare(b.lastName));
  }, []);

  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = documents.filter((d) => {
      if (kind !== "all" && d.kind !== kind) return false;
      if (memberId !== "all" && d.clientId !== memberId) return false;
      if (visibility === "visible" && !d.visibleToClient) return false;
      if (visibility === "hidden" && d.visibleToClient) return false;
      if (!needle) return true;
      const c = clientMap[d.clientId];
      // Hash is searchable on purpose — "is this digest in our store" is the
      // exact question you ask when reconciling an export against a subpoena.
      return (
        d.title.toLowerCase().includes(needle) ||
        d.kind.toLowerCase().includes(needle) ||
        d.sha256.includes(needle.toLowerCase()) ||
        d.storageKey.toLowerCase().includes(needle) ||
        (c ? clientName(c).toLowerCase().includes(needle) || c.mrn.toLowerCase().includes(needle) : false)
      );
    });

    out = [...out].sort((a, b) => {
      switch (sort) {
        case "member":
          return clientName(clientMap[a.clientId]).localeCompare(
            clientName(clientMap[b.clientId]),
          );
        case "kind":
          return a.kind.localeCompare(b.kind) || (a.uploadedAt < b.uploadedAt ? 1 : -1);
        case "size":
          return b.sizeBytes - a.sizeBytes;
        default:
          return a.uploadedAt < b.uploadedAt ? 1 : -1;
      }
    });

    return out;
  }, [q, kind, memberId, visibility, sort]);

  const totalBytes = rows.reduce((s, d) => s + d.sizeBytes, 0);
  const hiddenCount = rows.filter((d) => !d.visibleToClient).length;
  const reimbursable = rows.filter(isReimbursable).length;

  return (
    <div className="space-y-6">
      <div>
        <p className="label-eyebrow">DOCUMENTS</p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink-50">
          Member documents
        </h1>
        <p className="mt-1.5 text-sm text-ink-400">
          Every file on a member's record — what it is, who put it there, whether they can
          see it, and the hash that proves it hasn't been swapped.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Documents" value={String(rows.length)} />
        <Stat label="Storage" value={formatBytes(totalBytes)} />
        <Stat
          label="Not released"
          value={String(hiddenCount)}
          hint="Member cannot see these yet"
          tone={hiddenCount ? "watch" : undefined}
        />
        <Stat label="HSA/FSA eligible" value={String(reimbursable)} hint="Receipts & superbills" />
      </div>

      {/* Upload affordance */}
      <UploadPanel />

      {/* Filters */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title, member, MRN, hash…"
            className="pl-9"
          />
        </div>
        <Select value={kind} onChange={(e) => setKind(e.target.value as DocumentKind | "all")}>
          <option value="all">All kinds</option>
          {DOCUMENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </Select>
        <Select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          <option value="all">All members</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {clientName(m)}
            </option>
          ))}
        </Select>
        <Select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as "all" | "visible" | "hidden")}
        >
          <option value="all">Any visibility</option>
          <option value="visible">Member can see</option>
          <option value="hidden">Not released</option>
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="date">Newest first</option>
          <option value="member">By member</option>
          <option value="kind">By kind</option>
          <option value="size">Largest first</option>
        </Select>
      </div>

      {/* Table. Scrolls sideways rather than reflowing — eight columns stacked
          into cards on a phone stops being a table exactly when a coach is
          scanning one column. */}
      {rows.length === 0 ? (
        <EmptyState
          icon={<FolderOpen className="h-6 w-6" />}
          title="No documents match"
          hint="Try clearing a filter, or search by member name or MRN."
        />
      ) : (
        <FadeIn>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-ink-700/70 text-left">
                    <Th>Document</Th>
                    <Th>Member</Th>
                    <Th>Kind</Th>
                    <Th>Added</Th>
                    <Th align="right">Size</Th>
                    <Th>Source</Th>
                    <Th>Integrity</Th>
                    <Th>Member sees</Th>
                    <Th align="right">&nbsp;</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 120).map((d) => (
                    <Row key={d.id} doc={d} onAction={toast} />
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 120 && (
              <p className="border-t border-ink-700/70 px-4 py-2.5 text-xs text-ink-500">
                Showing the newest 120 of {rows.length}. Narrow the filters to see the rest.
              </p>
            )}
          </div>
        </FadeIn>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "watch";
}) {
  return (
    <div className="card p-4">
      <p className="label-eyebrow">{label}</p>
      <p
        className={cn(
          "stat-mono mt-1.5 text-xl font-semibold",
          tone === "watch" ? "text-watch" : "text-ink-50",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={cn(
        "whitespace-nowrap px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-500",
        align === "right" && "text-right",
      )}
    >
      {children}
    </th>
  );
}

function Row({
  doc,
  onAction,
}: {
  doc: Document;
  onAction: (title: string, opts?: { desc?: string; tone?: "success" | "info" | "warn" }) => void;
}) {
  const client = clientMap[doc.clientId];

  return (
    <tr className="border-b border-ink-800/70 last:border-0 hover:bg-ink-800/30">
      <td className="px-4 py-3">
        <div className="flex items-start gap-2.5">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-100">{doc.title}</p>
            {/* The storage key, not a URL. Reads go through a short-lived signed
                link minted per request; there is no durable URL to leak. */}
            <p className="stat-mono truncate text-[11px] text-ink-600">{doc.storageKey}</p>
          </div>
        </div>
      </td>

      <td className="whitespace-nowrap px-4 py-3">
        {client ? (
          <Link href={`/clients/${client.id}`} className="text-ink-200 hover:text-gold-300">
            {clientName(client)}
          </Link>
        ) : (
          <span className="text-ink-500">—</span>
        )}
        {client && <p className="stat-mono text-[11px] text-ink-600">{client.mrn}</p>}
      </td>

      <td className="whitespace-nowrap px-4 py-3">
        <Badge tone={KIND_TONE[doc.kind]}>{doc.kind}</Badge>
      </td>

      <td className="whitespace-nowrap px-4 py-3">
        <p className="stat-mono text-xs text-ink-300">{formatDate(doc.uploadedAt)}</p>
        <p className="text-[11px] text-ink-600">
          {doc.uploadedByStaffId ? staffName(doc.uploadedByStaffId) : "Member"}
        </p>
      </td>

      <td className="stat-mono whitespace-nowrap px-4 py-3 text-right text-xs text-ink-300">
        {formatBytes(doc.sizeBytes)}
      </td>

      <td className="whitespace-nowrap px-4 py-3 text-xs text-ink-400">{doc.source}</td>

      <td className="whitespace-nowrap px-4 py-3">
        <span
          className="stat-mono flex items-center gap-1.5 text-[11px] text-ink-400"
          title={`sha256 ${doc.sha256}`}
        >
          <ShieldCheck className="h-3.5 w-3.5 text-optimal" />
          {shortHash(doc.sha256)}
        </span>
      </td>

      <td className="whitespace-nowrap px-4 py-3">
        {doc.visibleToClient ? (
          <span className="flex items-center gap-1.5 text-xs text-optimal">
            <Eye className="h-3.5 w-3.5" />
            Yes
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-watch">
            <EyeOff className="h-3.5 w-3.5" />
            Not released
          </span>
        )}
      </td>

      <td className="whitespace-nowrap px-4 py-3 text-right">
        <div className="flex justify-end gap-1.5">
          {isReimbursable(doc) && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() =>
                onAction("HSA/FSA copy prepared", {
                  desc: `${doc.title} — demo only. In production this mints a 5-minute signed URL and appends an \`export\` row to the trace ledger.`,
                  tone: "info",
                })
              }
            >
              <Download className="h-3.5 w-3.5" />
              HSA/FSA
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              onAction("Read logged", {
                desc: `Opening ${doc.id} would append a \`view\` row naming digest ${shortHash(doc.sha256)}. Demo — no file was opened.`,
                tone: "info",
              })
            }
          >
            Open
          </Button>
        </div>
      </td>
    </tr>
  );
}

/**
 * Upload affordance.
 *
 * Honestly labelled: it uploads nothing. What it does do is describe the real
 * pipeline, because the interesting part of "upload a lab PDF" here is not the
 * upload — it is that a real ingest runs Azure Document Intelligence over the
 * PDF to extract biomarkers into structured rows, so a coach never re-keys 100
 * markers by hand. That adapter lives at lib/azure/documentIntelligence.ts and
 * is built elsewhere; nothing on this page calls it.
 */
function UploadPanel() {
  const { toast } = useToast();
  return (
    <div className="card border-dashed p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold-500/12 text-gold-300">
            <Upload className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-medium text-ink-100">
              Add a document
              <Badge tone="gold">Demo — no upload</Badge>
            </p>
            <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-400">
              A real ingest hashes the file first, writes the bytes to a private blob
              container, stores only the pointer and digest, then runs{" "}
              <span className="text-ink-200">Azure Document Intelligence</span> over lab
              PDFs to extract biomarkers into structured rows — so a coach never re-keys
              100 markers off a scan. Extraction is proposed, never auto-filed: a provider
              confirms before anything reaches the chart.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="shrink-0 gap-1.5"
          onClick={() =>
            toast("Nothing was uploaded", {
              desc: "This build has no storage account attached and makes no network calls.",
              tone: "warn",
            })
          }
        >
          <Sparkles className="h-4 w-4" />
          Choose file
        </Button>
      </div>
    </div>
  );
}
