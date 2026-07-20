"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Link2,
  Link2Off,
  RotateCcw,
  Bug,
} from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { shortHash } from "@/lib/trace/hash";
import {
  verifyChain,
  type LedgerRow,
  type ChainVerdict,
} from "@/lib/trace/ledger";

type Phase = "idle" | "running" | "done";

/**
 * Walks the hash chain link by link, on screen.
 *
 * The animation is not decoration — verification really is sequential (each
 * link depends on the one before it), so showing it advance is an honest
 * depiction of the work. We verify the whole chain in one synchronous call for
 * the verdict, then replay the walk visually at a readable speed.
 */
export function ChainVerifier({
  rows,
  tampered,
  onTamper,
  onReset,
}: {
  rows: LedgerRow[];
  tampered: boolean;
  onTamper: () => void;
  onReset: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [cursor, setCursor] = useState(0);
  const [verdict, setVerdict] = useState<ChainVerdict | null>(null);
  const raf = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (raf.current !== null) {
      cancelAnimationFrame(raf.current);
      raf.current = null;
    }
  }, []);

  // Any change to the underlying rows invalidates a prior verdict.
  useEffect(() => {
    stop();
    setPhase("idle");
    setCursor(0);
    setVerdict(null);
  }, [rows, stop]);

  useEffect(() => stop, [stop]);

  const run = useCallback(() => {
    stop();
    const result = verifyChain(rows);
    // Stop the walk at the break so the failing link is what stays on screen.
    const target = result.ok
      ? rows.length
      : Math.max(1, rows.findIndex((r) => r.id === result.brokenAt) + 1);

    setVerdict(null);
    setCursor(0);
    setPhase("running");

    const started = performance.now();
    const duration = Math.min(1600, 320 + target * 6);

    const tick = (t: number) => {
      const progress = Math.min(1, (t - started) / duration);
      // easeOutCubic — fast start, settles onto the answer
      const eased = 1 - Math.pow(1 - progress, 3);
      setCursor(Math.floor(eased * target));
      if (progress < 1) {
        raf.current = requestAnimationFrame(tick);
      } else {
        setCursor(target);
        setVerdict(result);
        setPhase("done");
        raf.current = null;
      }
    };
    raf.current = requestAnimationFrame(tick);
  }, [rows, stop]);

  const brokenIndex = verdict?.brokenAt
    ? rows.findIndex((r) => r.id === verdict.brokenAt)
    : -1;

  // A window of links around the cursor — the chain is 240 long, we show 24.
  const WINDOW = 24;
  const start = Math.max(0, Math.min(cursor - WINDOW + 4, rows.length - WINDOW));
  const window = rows.slice(start, start + WINDOW);

  const ok = verdict?.ok === true;
  const failed = verdict?.ok === false;

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-800/70 p-5">
        <div className="flex items-center gap-3">
          <motion.div
            animate={
              phase === "running"
                ? { scale: [1, 1.06, 1] }
                : { scale: 1 }
            }
            transition={{ repeat: phase === "running" ? Infinity : 0, duration: 1.1 }}
            className={`grid h-10 w-10 place-items-center rounded-xl border ${
              failed
                ? "border-high/30 bg-high/12"
                : ok
                  ? "border-optimal/30 bg-optimal/12"
                  : "border-ink-700 bg-ink-800/60"
            }`}
          >
            {phase === "running" ? (
              <Loader2 className="h-5 w-5 animate-spin text-ink-300" />
            ) : failed ? (
              <ShieldAlert className="h-5 w-5 text-high" />
            ) : (
              <ShieldCheck className={`h-5 w-5 ${ok ? "text-optimal" : "text-ink-400"}`} />
            )}
          </motion.div>
          <div>
            <p className="font-display text-body font-semibold text-ink-50">
              Chain integrity
            </p>
            <p className="text-detail text-ink-500">
              SHA-256 · {rows.length.toLocaleString()} linked records
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm" onClick={run} disabled={phase === "running"}>
            {phase === "running" ? "Verifying…" : "Verify chain"}
          </Button>
          {tampered ? (
            <Button variant="outline" size="sm" onClick={onReset}>
              <RotateCcw className="h-3.5 w-3.5" />
              Restore
            </Button>
          ) : (
            <Button variant="danger" size="sm" onClick={onTamper}>
              <Bug className="h-3.5 w-3.5" />
              Tamper with a record
            </Button>
          )}
        </div>
      </div>

      {/* ── Verdict banner ─────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {verdict && (
          <motion.div
            key={verdict.ok ? "ok" : `bad-${verdict.brokenAt}`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className={`overflow-hidden border-b ${
              verdict.ok ? "border-optimal/20 bg-optimal/8" : "border-high/20 bg-high/8"
            }`}
          >
            <div className="flex items-start gap-3 p-5">
              {verdict.ok ? (
                <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-optimal" />
              ) : (
                <Link2Off className="mt-0.5 h-4 w-4 shrink-0 text-high" />
              )}
              <div className="min-w-0">
                <p
                  className={`text-body font-semibold ${
                    verdict.ok ? "text-optimal" : "text-high"
                  }`}
                >
                  {verdict.ok
                    ? `Verified — all ${verdict.checked.toLocaleString()} links intact`
                    : `Tampering detected at ${verdict.brokenAt}`}
                </p>
                <p className="mt-1 text-detail leading-relaxed text-ink-400">
                  {verdict.ok ? (
                    <>
                      Every record still hashes to its stored digest, and every
                      digest matches the next record&apos;s <code className="font-mono text-ink-300">prevHash</code>.
                      Nothing has been edited, removed or reordered since it was written.
                    </>
                  ) : verdict.failure === "hash-mismatch" ? (
                    <>
                      Record {verdict.brokenAt} no longer hashes to its stored digest —
                      its contents were changed after it was written. Every record
                      after it is now unverifiable.
                    </>
                  ) : (
                    <>
                      Record {verdict.brokenAt} does not link to the previous
                      record&apos;s hash — a record was removed or reordered.
                    </>
                  )}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── The chain ──────────────────────────────────────────────── */}
      <div className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="label-eyebrow">
            Links {start + 1}–{start + window.length}
          </p>
          <p className="stat-mono text-micro text-ink-500">
            {phase === "idle" ? "not verified" : `${cursor.toLocaleString()} / ${rows.length.toLocaleString()}`}
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {window.map((row, i) => {
            const absolute = start + i;
            const reached = absolute < cursor;
            const isBroken = failed && absolute === brokenIndex;
            const isAfterBreak = failed && brokenIndex >= 0 && absolute > brokenIndex;

            return (
              <motion.div
                key={row.id}
                title={`${row.id} · ${shortHash(row.hash)}`}
                initial={false}
                animate={{
                  scale: isBroken ? 1.12 : 1,
                  opacity: isAfterBreak ? 0.28 : reached || phase === "idle" ? 1 : 0.3,
                }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                className={`h-8 flex-1 rounded-md border transition-colors ${
                  isBroken
                    ? "border-high bg-high/25"
                    : isAfterBreak
                      ? "border-ink-800 bg-ink-900"
                      : reached
                        ? "border-optimal/40 bg-optimal/15"
                        : "border-ink-700 bg-ink-800/50"
                }`}
                style={{ minWidth: 14 }}
              />
            );
          })}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <ChainFact label="Genesis" value={shortHash("0".repeat(64))} />
          <ChainFact label="Head" value={shortHash(rows[rows.length - 1]?.hash ?? "")} />
        </div>

        <p className="mt-4 text-micro leading-relaxed text-ink-600">
          Each record stores <code className="font-mono text-ink-500">hash = sha256(prevHash + canonicalJson(payload))</code>.
          Editing any field re-derives a different digest, so the break is
          detectable at the exact record — and everything downstream of it fails
          to link. In production the table also has UPDATE and DELETE revoked at
          the Postgres grant level.
        </p>
      </div>
    </div>
  );
}

function ChainFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink-800 bg-ink-900/50 px-3 py-2">
      <p className="label-eyebrow">{label}</p>
      <p className="stat-mono mt-0.5 truncate text-detail text-ink-200">{value}</p>
    </div>
  );
}
