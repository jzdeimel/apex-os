"use client";

import * as React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ListPlus,
  PhoneCall,
  Undo2,
  UserCog,
  X,
} from "lucide-react";
import { Button, Select } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { getClient, clientName } from "@/lib/mock/clients";
import { coaches, staffMap, staffName } from "@/lib/mock/staff";
import { appendLedger, type LedgerAction, type LedgerRow } from "@/lib/trace/ledger";
import { cn } from "@/lib/utils";

/**
 * BULK BAR — the fastest way to ruin a coach's afternoon.
 *
 * ── The two rules ─────────────────────────────────────────────────────────
 *  1. STATE THE COUNT BEFORE YOU RUN. Not "apply to selected" — "reassign 14
 *     members". The audited system's bulk actions say "Apply", and the number
 *     of records touched is discoverable only afterwards, by noticing that
 *     something is wrong. A count in the confirm step is the difference
 *     between an intended change and an accident that took four hours to find.
 *  2. EVERY BULK ACTION IS UNDOABLE. A single-record mistake is a single
 *     correction; a 200-record mistake with no undo is a support ticket and a
 *     day of somebody's life. The undo stays offered until the coach dismisses
 *     the bar, not for three seconds.
 *
 * ── One ledger row PER RECORD, never one per batch ────────────────────────
 * This is the part that looks like an optimisation opportunity and is not.
 * The audit question is never "what did the batch job do" — it is always
 * "who changed THIS member's coach, and when". A single batch row makes that
 * question answerable only by joining to a batch manifest that, in every
 * system I have seen, does not survive the migration. So: N appends for N
 * records. It is more rows and it is the correct number of rows.
 *
 * ── Undo is a compensating write, not a delete ────────────────────────────
 * The ledger is append-only and hash-chained (lib/trace/ledger.ts). Undo
 * therefore appends a second row per record with the diff reversed and a
 * reason naming the row it reverses. The mistake stays in the record — which
 * is right. "It was assigned wrongly for six minutes on the 12th" is a true
 * fact about that chart, and a system that can erase it is a system whose
 * audit log means nothing.
 */

export type BulkActionId = "assign" | "mark-contacted" | "add-task" | "export";

interface BulkActionDef {
  id: BulkActionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Verb phrase completed by the count: "Reassign" -> "Reassign 14 members". */
  verb: string;
  /** What actually changes, in the coach's words, shown in the confirm step. */
  consequence: string;
  ledgerAction: LedgerAction;
  /** Needs a target coach picked before it can run. */
  needsAssignee?: boolean;
  /** Destructive-ish actions get the louder confirm. */
  tone: "neutral" | "warn";
}

const ACTIONS: BulkActionDef[] = [
  {
    id: "assign",
    label: "Assign",
    icon: UserCog,
    verb: "Reassign",
    consequence:
      "Changes the owning coach on each record. Members are not notified; their next check-in simply comes from someone else.",
    ledgerAction: "update",
    needsAssignee: true,
    tone: "warn",
  },
  {
    id: "mark-contacted",
    label: "Mark contacted",
    icon: PhoneCall,
    verb: "Mark",
    consequence:
      "Logs a touch against each record today. It does not send anything — it records contact you have already made.",
    ledgerAction: "update",
    tone: "neutral",
  },
  {
    id: "add-task",
    label: "Add task",
    icon: ListPlus,
    verb: "Add a task for",
    consequence: "Creates one open task per member on your list. Nothing is sent to the member.",
    ledgerAction: "create",
    tone: "neutral",
  },
  {
    id: "export",
    label: "Export",
    icon: Download,
    verb: "Export",
    consequence:
      "Produces a file containing protected health information. Every member in it gets an export event on their access log, which they can see in their portal.",
    ledgerAction: "export",
    tone: "warn",
  },
];

const ACTION_BY_ID = Object.fromEntries(ACTIONS.map((a) => [a.id, a])) as Record<
  BulkActionId,
  BulkActionDef
>;

/** What the last run did, kept so undo can reverse it record by record. */
interface AppliedBatch {
  action: BulkActionDef;
  /** One committed row per affected member. */
  rows: LedgerRow[];
  assigneeId?: string;
  undone: boolean;
}

export interface BulkBarProps {
  /** Client ids currently selected. The bar hides itself when empty. */
  selectedIds: string[];
  /** Acting staff member — every ledger row is attributed to them. */
  staffId: string;
  onClearSelection: () => void;
  /** Fired after a successful run, so a parent can refresh or clear. */
  onApplied?: (info: { action: BulkActionId; count: number }) => void;
  className?: string;
}

export function BulkBar({
  selectedIds,
  staffId,
  onClearSelection,
  onApplied,
  className,
}: BulkBarProps) {
  const { toast } = useToast();
  const reduceMotion = useReducedMotion();

  const [pending, setPending] = React.useState<BulkActionId | null>(null);
  const [assigneeId, setAssigneeId] = React.useState<string>(coaches[0]?.id ?? "");
  const [applied, setApplied] = React.useState<AppliedBatch | null>(null);

  const count = selectedIds.length;
  const actor = staffMap[staffId];

  // Selection changing invalidates a half-open confirm. A confirm that says
  // "14 members" while the selection has become 3 is worse than no confirm.
  React.useEffect(() => {
    setPending(null);
  }, [selectedIds]);

  const pendingAction = pending ? ACTION_BY_ID[pending] : null;

  function ledgerBase(clientId: string) {
    const client = getClient(clientId);
    return {
      actorId: staffId,
      actorName: actor?.name ?? "Unknown",
      actorRole: actor?.role ?? "Coach",
      subjectId: clientId,
      subjectName: client ? clientName(client) : clientId,
      locationId: client?.locationId,
    };
  }

  function diffFor(action: BulkActionDef, clientId: string) {
    const client = getClient(clientId);
    switch (action.id) {
      case "assign":
        return {
          before: { coachId: client?.coachId ?? null },
          after: { coachId: assigneeId },
        };
      case "mark-contacted":
        return {
          before: { lastTouchLoggedBy: null },
          after: { touchLoggedBy: staffId, channel: "Logged manually" },
        };
      case "add-task":
        return { after: { task: "Follow up", status: "Open", owner: staffId } };
      case "export":
        return { after: { fields: "roster summary", format: "CSV" } };
      default:
        return {};
    }
  }

  function run() {
    if (!pendingAction || count === 0) return;

    // N rows for N records — see the module docblock.
    const rows: LedgerRow[] = selectedIds.map((clientId) =>
      appendLedger({
        ...ledgerBase(clientId),
        action: pendingAction.ledgerAction,
        entity: pendingAction.id === "add-task" ? "note" : "chart",
        entityId: `bulk-${pendingAction.id}-${clientId}`,
        reason: `Bulk ${pendingAction.label.toLowerCase()} across ${count} member${count === 1 ? "" : "s"}`,
        ...diffFor(pendingAction, clientId),
      }),
    );

    setApplied({ action: pendingAction, rows, assigneeId, undone: false });
    setPending(null);
    toast(`${pendingAction.verb} — ${count} member${count === 1 ? "" : "s"}`, {
      desc: `${rows.length} ledger row${rows.length === 1 ? "" : "s"} written. Undo is available until you dismiss this bar.`,
    });
    onApplied?.({ action: pendingAction.id, count });
  }

  function undo() {
    if (!applied || applied.undone) return;

    // A compensating row per original row: same subject, reversed diff, and a
    // reason that names the row being reversed so the pair is joinable.
    for (const row of applied.rows) {
      appendLedger({
        ...ledgerBase(row.subjectId ?? ""),
        action: "update",
        entity: row.entity,
        entityId: row.entityId,
        reason: `Undo of ${row.id} — bulk ${applied.action.label.toLowerCase()} reversed`,
        before: row.after,
        after: row.before ?? { reverted: true },
      });
    }

    setApplied({ ...applied, undone: true });
    toast("Undone", {
      desc: `${applied.rows.length} record${applied.rows.length === 1 ? "" : "s"} reverted. The original entries stay on the ledger.`,
      tone: "info",
    });
  }

  if (count === 0 && !applied) return null;

  const enter = reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 };
  const settled = reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 };

  return (
    <AnimatePresence>
      <motion.div
        initial={enter}
        animate={settled}
        exit={enter}
        transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          "fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-3xl rounded-2xl border border-ink-700 bg-ink-850/95 p-3 shadow-card backdrop-blur sm:inset-x-6",
          className,
        )}
        role="region"
        aria-label="Bulk actions"
      >
        {/* ── Applied: the undo state ─────────────────────────────────── */}
        {applied ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm text-ink-200">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-optimal" />
              <span>
                {applied.undone ? "Reverted" : applied.action.verb}{" "}
                <span className="stat-mono text-ink-50">{applied.rows.length}</span>{" "}
                member{applied.rows.length === 1 ? "" : "s"}
                {applied.action.id === "assign" && applied.assigneeId
                  ? ` → ${staffName(applied.assigneeId)}`
                  : ""}
                .
              </span>
            </p>
            <div className="flex items-center gap-2">
              {!applied.undone && (
                <Button size="sm" variant="outline" onClick={undo}>
                  <Undo2 className="h-3.5 w-3.5" />
                  Undo all {applied.rows.length}
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setApplied(null);
                  onClearSelection();
                }}
              >
                Done
              </Button>
            </div>
          </div>
        ) : pendingAction ? (
          /* ── Confirm: the count, stated, before anything runs ───────── */
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0",
                  pendingAction.tone === "warn" ? "text-watch" : "text-ink-400",
                )}
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-50">
                  {pendingAction.verb}{" "}
                  <span className="stat-mono text-gold-300">{count}</span> member
                  {count === 1 ? "" : "s"}
                  {pendingAction.needsAssignee ? ` → ${staffName(assigneeId)}` : ""}?
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-400">
                  {pendingAction.consequence} One audit entry is written per member, and this can
                  be undone.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {pendingAction.needsAssignee && (
                <Select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  aria-label="Assign to coach"
                  className="h-8 w-full text-xs sm:w-56"
                >
                  {coaches.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              )}
              <Button
                size="sm"
                variant={pendingAction.tone === "warn" ? "danger" : "primary"}
                onClick={run}
                disabled={pendingAction.needsAssignee && !assigneeId}
              >
                Yes — {pendingAction.verb.toLowerCase()} {count}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPending(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          /* ── Idle: selection + the four actions ─────────────────────── */
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-200">
              <span className="stat-mono text-gold-300">{count}</span> selected
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {ACTIONS.map((a) => {
                const Icon = a.icon;
                return (
                  <Button key={a.id} size="sm" variant="outline" onClick={() => setPending(a.id)}>
                    <Icon className="h-3.5 w-3.5" />
                    {a.label}
                  </Button>
                );
              })}
              <Button size="sm" variant="ghost" onClick={onClearSelection} aria-label="Clear selection">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

export default BulkBar;
