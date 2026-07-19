import { sha256, canonicalJson } from "@/lib/trace/hash";
import { ledger, type LedgerRow } from "@/lib/trace/ledger";
import { adapterFail, adapterOk, AZURE_NOW, type AdapterResult } from "@/lib/azure/types";

/**
 * AZURE CONFIDENTIAL LEDGER — anchoring the Apex hash chain.
 *
 * WHAT THE REAL SERVICE DOES
 *   Azure Confidential Ledger is an append-only ledger running inside hardware
 *   enclaves (Intel SGX / AMD SEV-SNP) on a permissioned blockchain. Writes are
 *   committed by a consensus of enclave nodes whose code is remotely attestable,
 *   and each write returns a signed *receipt*: a Merkle proof plus a signature
 *   chaining back to the service identity certificate. Microsoft operators
 *   cannot alter a committed entry, and neither can we.
 *
 * WHAT THIS FILE DOES INSTEAD
 *   Nothing is transmitted. `anchorBatch` computes a real SHA-256 Merkle root
 *   over real ledger rows and returns a deterministic receipt shaped like the
 *   service's. The hashing is genuine; the attestation is simulated. A receipt
 *   from this module proves arithmetic, not custody — which is precisely the
 *   distinction the whole feature exists to close.
 *
 * WHAT WOULD HAVE TO CHANGE TO MAKE IT REAL
 *   1. Provision a Confidential Ledger instance and grant the anchoring job's
 *      managed identity the Contributor role on it.
 *   2. Replace `simulateReceipt` with `ConfidentialLedgerClient.postLedgerEntry`
 *      from @azure/confidential-ledger, awaiting the transaction id.
 *   3. Replace `verifyAnchor` with `getReceipt(transactionId)` plus local Merkle
 *      proof verification against the service identity cert fetched from the
 *      identity endpoint — verification must be done client-side, or we are
 *      trusting the same party we asked to be untrusted.
 *   Nothing else in Apex changes. That is deliberate: the chain is already real.
 *
 * WHY THIS IS THE STANDOUT
 *   lib/trace/ledger.ts already hash-chains every event, and `verifyChain`
 *   genuinely breaks when a row is tampered with. But a self-verifying chain
 *   answers a narrow question: "is this data internally consistent?" Anyone with
 *   write access to the database can rewrite a row *and* recompute every
 *   downstream hash. The chain then verifies perfectly and says nothing true.
 *
 *   Anchoring fixes exactly that. Once the chain head at sequence N is committed
 *   to hardware we do not control, rewriting any row at or before N produces a
 *   head that no longer matches the anchored one. The claim upgrades from
 *   "we verify our own arithmetic" to "hardware outside our control attests that
 *   we did not edit this" — which is the only version of the claim that is worth
 *   anything in an audit, a subpoena, or a breach investigation.
 *
 * WHY ANCHOR PERIODICALLY RATHER THAN PER ROW
 *   Per-row writes are the obvious design and the wrong one. A busy clinic day
 *   is thousands of ledger rows, mostly chart views; per-row anchoring puts a
 *   network call with real latency and a real failure mode inside the write path
 *   of every read event, which means the first outage makes the system choose
 *   between refusing to work and dropping audit rows. Both answers are bad.
 *
 *   Anchoring the *head* on a schedule inherits the chain's own property: one
 *   anchored head attests every row beneath it, because each row's hash is an
 *   input to every subsequent hash. The cost is a bounded window — a tamper
 *   inside the current unanchored batch is not yet attested — which is why
 *   `ANCHOR_INTERVAL_MINUTES` is short and `unanchoredDepth()` is surfaced
 *   rather than hidden. The exposure is a number on a screen, not a surprise.
 */

/** How often the anchoring job runs in production. Bounds the tamper window. */
export const ANCHOR_INTERVAL_MINUTES = 15;

/** Rows per anchored batch in this demo's reconstruction of past anchors. */
export const ANCHOR_BATCH_SIZE = 60;

export interface LedgerAnchor {
  /** Maps to the Confidential Ledger transaction id (e.g. "2.114"). */
  anchorId: string;
  /** Merkle root over the batch — the value actually committed. */
  receiptHash: string;
  anchoredAt: string;
  blockCount: number;
  /** Sequence range covered, inclusive. Makes coverage auditable at a glance. */
  fromSeq: number;
  toSeq: number;
  /** The Apex chain head this anchor attests. */
  chainHead: string;
  /**
   * Enclave measurement the service reported. In production this is compared
   * against the published MRENCLAVE for the code version we expect to be
   * running — an attestation you do not check is decoration.
   */
  attestationQuote: string;
}

export interface AnchorVerification {
  anchorId: string;
  /** Did the recomputed Merkle root match the receipt? */
  ok: boolean;
  /** Did the anchored chain head still match the live ledger at that sequence? */
  chainHeadMatches: boolean;
  verifiedAt: string;
  detail: string;
}

// ---------------------------------------------------------------------------
// Merkle construction — genuinely computed
// ---------------------------------------------------------------------------

/**
 * Standard binary Merkle root. Odd nodes are promoted, not duplicated: the
 * duplicate-last-node variant admits a known second-preimage ambiguity where two
 * different trees produce the same root. For an integrity feature, picking the
 * variant without the footgun costs one line.
 */
export function merkleRoot(leaves: string[]): string {
  if (leaves.length === 0) return "0".repeat(64);
  let level = leaves.slice();
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length ? sha256(level[i] + level[i + 1]) : level[i]);
    }
    level = next;
  }
  return level[0];
}

/**
 * Deterministic stand-in for the service's signed receipt.
 *
 * Named to be unmistakable in a stack trace or a grep. If this identifier ever
 * appears in a screenshot presented as evidence, the screenshot is wrong.
 */
function simulateReceipt(root: string, toSeq: number): { anchorId: string; quote: string } {
  return {
    // Confidential Ledger transaction ids are "view.seqno".
    anchorId: `2.${toSeq}`,
    quote: `sgx-demo-${sha256(`attestation:${root}`).slice(0, 32)}`,
  };
}

// ---------------------------------------------------------------------------
// Anchoring
// ---------------------------------------------------------------------------

/**
 * Anchor a batch of ledger rows.
 *
 * Pure and synchronous, matching the rest of lib/trace. In production this
 * becomes async and can fail — and when it fails the correct behaviour is to
 * leave the batch unanchored and raise, never to mark it anchored optimistically.
 * An anchor that lies is worse than no anchor, for the same reason this whole
 * module is commented the way it is.
 */
export function anchorBatch(
  rows: LedgerRow[],
  at: string = AZURE_NOW,
): AdapterResult<LedgerAnchor> {
  if (rows.length === 0) {
    return adapterFail("Nothing to anchor — empty batch.");
  }

  // Leaves are the rows' own chain hashes. Re-deriving them from payloads here
  // would let a batch anchor a value the chain never actually held.
  const leaves = rows.map((r) => r.hash);
  const root = merkleRoot(leaves);
  const { anchorId, quote } = simulateReceipt(root, rows[rows.length - 1].seq);

  return adapterOk({
    anchorId,
    receiptHash: root,
    anchoredAt: at,
    blockCount: rows.length,
    fromSeq: rows[0].seq,
    toSeq: rows[rows.length - 1].seq,
    chainHead: rows[rows.length - 1].hash,
    attestationQuote: quote,
  });
}

/**
 * Anchors already committed, oldest first.
 *
 * THIS ARRAY IS THE WHOLE POINT AND MUST NOT BE RECOMPUTED FROM THE LEDGER.
 *
 * The obvious implementation — derive anchors on read from whatever rows are
 * currently in the chain — produces a verifier that can never fail. It would
 * hash the tampered rows into a receipt and then compare that receipt against
 * itself. Every check passes, including the ones that should not, and the
 * feature becomes an expensive way to render a green checkmark.
 *
 * A receipt is only evidence if it was fixed BEFORE the data it describes could
 * be altered, and if it lives somewhere the altering party cannot reach. In
 * production that somewhere is the Confidential Ledger's enclaves. Here it is
 * this closed-over array, captured once at module load and appended to only by
 * `anchorPending`. That is a far weaker guarantee — it is in the same process as
 * the data — but it preserves the one property that makes the demo mean
 * anything: the receipt does not move when the rows do.
 */
const committedAnchors: LedgerAnchor[] = (() => {
  const out: LedgerAnchor[] = [];
  const complete = Math.floor(ledger.length / ANCHOR_BATCH_SIZE);
  for (let b = 0; b < complete; b++) {
    const batch = ledger.slice(b * ANCHOR_BATCH_SIZE, (b + 1) * ANCHOR_BATCH_SIZE);
    const result = anchorBatch(batch, batch[batch.length - 1].at);
    if (result.ok && result.value) out.push(result.value);
  }
  return out;
})();

/**
 * Commit any batches that have filled up since the last anchoring run.
 *
 * This is the 15-minute job, called explicitly rather than lazily from a getter:
 * anchoring is a write, and a read that silently writes is how the tail ends up
 * anchored at the exact moment someone looks at it, which would restore the
 * self-fulfilling verification this module just went to some trouble to avoid.
 *
 * Idempotent — batches already committed are skipped, so calling it twice is a
 * no-op rather than a duplicate anchor.
 */
export function anchorPending(rows: LedgerRow[] = ledger): LedgerAnchor[] {
  const added: LedgerAnchor[] = [];
  const complete = Math.floor(rows.length / ANCHOR_BATCH_SIZE);
  for (let b = committedAnchors.length; b < complete; b++) {
    const batch = rows.slice(b * ANCHOR_BATCH_SIZE, (b + 1) * ANCHOR_BATCH_SIZE);
    const result = anchorBatch(batch, batch[batch.length - 1].at);
    if (result.ok && result.value) {
      committedAnchors.push(result.value);
      added.push(result.value);
    }
  }
  return added;
}

/** Committed anchors, newest first, like every other feed in Apex. */
export function getAnchors(): LedgerAnchor[] {
  return [...committedAnchors].reverse();
}

/** Rows written since the last anchor — the current, bounded exposure window. */
export function unanchoredDepth(rows: LedgerRow[] = ledger): number {
  return Math.max(0, rows.length - committedAnchors.length * ANCHOR_BATCH_SIZE);
}

/** The rows an anchor covers, resolved out of the live chain. */
export function rowsForAnchor(anchor: LedgerAnchor, rows: LedgerRow[] = ledger): LedgerRow[] {
  return rows.filter((r) => r.seq >= anchor.fromSeq && r.seq <= anchor.toSeq);
}

/**
 * Verify an anchor against the live ledger.
 *
 * Two independent checks, deliberately reported separately because they fail for
 * different reasons and imply different incidents:
 *
 *   `ok`               — the rows currently in that range still Merkle-hash to
 *                        the committed receipt. False means the data changed.
 *   `chainHeadMatches` — the row at `toSeq` still carries the anchored head.
 *                        False on its own means reordering or truncation.
 *
 * In production the first check additionally validates the service's signature
 * over the receipt using the ledger identity certificate, fetched from the
 * identity endpoint rather than from the ledger itself. Verifying a receipt
 * using a key the ledger handed you proves nothing.
 */
export function verifyAnchor(
  anchorId: string,
  rows: LedgerRow[] = ledger,
  at: string = AZURE_NOW,
): AdapterResult<AnchorVerification> {
  // The anchor comes from the committed list; the rows come from the caller.
  // Those two must be separate sources or the check is circular — see the note
  // on `committedAnchors`.
  const anchor = committedAnchors.find((a) => a.anchorId === anchorId);
  if (!anchor) {
    return adapterFail(`No anchor ${anchorId}. It was never written, or the chain has been truncated beneath it.`);
  }

  const covered = rowsForAnchor(anchor, rows);
  const recomputed = merkleRoot(covered.map((r) => r.hash));
  const ok = recomputed === anchor.receiptHash;
  const head = covered[covered.length - 1];
  const chainHeadMatches = head?.hash === anchor.chainHead;

  return adapterOk({
    anchorId,
    ok,
    chainHeadMatches,
    verifiedAt: at,
    detail: ok && chainHeadMatches
      ? `Merkle root over seq ${anchor.fromSeq}–${anchor.toSeq} matches the committed receipt. ${anchor.blockCount} events attested.`
      : !ok
        ? `Merkle root mismatch: recomputed ${recomputed.slice(0, 12)}…, receipt holds ${anchor.receiptHash.slice(0, 12)}…. At least one event in seq ${anchor.fromSeq}–${anchor.toSeq} was altered after it was anchored.`
        : `Merkle root matches but the chain head at seq ${anchor.toSeq} has moved. Rows were reordered or removed.`,
  });
}

/**
 * A short, honest sentence for the UI. Kept here rather than in a component so
 * the wording cannot drift away from what the code actually proves.
 */
export function anchorClaim(anchor: LedgerAnchor): string {
  return `${anchor.blockCount} events, sequence ${anchor.fromSeq}–${anchor.toSeq}, committed as transaction ${anchor.anchorId}. Altering any one of them changes this root.`;
}

/**
 * The one-line disclosure that must accompany any anchoring UI in this build.
 * Exported so a surface cannot render the feature without rendering the caveat.
 */
export const ANCHOR_DEMO_DISCLOSURE =
  "Demo build: the hash chain and Merkle roots are genuinely computed, but no entry is committed to Azure Confidential Ledger. The receipts below prove arithmetic, not custody.";

/** Canonical payload we would post per anchor. Exported for the go-live diff. */
export function anchorEntryBody(anchor: LedgerAnchor): string {
  return canonicalJson({
    kind: "apex-ledger-anchor",
    fromSeq: anchor.fromSeq,
    toSeq: anchor.toSeq,
    merkleRoot: anchor.receiptHash,
    chainHead: anchor.chainHead,
    anchoredAt: anchor.anchoredAt,
  });
}
