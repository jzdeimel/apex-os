// =============================================================================
// Apex — documents
// =============================================================================
//
// THE ONE RULE: a document row is a POINTER, never a payload.
//
// The row holds `storageKey` — a path into blob storage (Azure Blob, private
// container, no public access, read through short-lived user-delegation SAS
// URLs) — plus `sizeBytes`, `mimeType` and `sha256`. The bytes never enter the
// database. Storing a 14MB lab PDF as a bytea column is how a clinic ends up
// with a 400GB Postgres instance that cannot be restored inside its RTO, and it
// puts PHI in every backup, every read replica and every `pg_dump` a developer
// ever takes home.
//
// WHY THE HASH IS NOT DECORATION: `sha256` is what lets you prove the file was
// not swapped. Blob storage and the database are two systems with two access
// control planes, and the one thing a pointer architecture cannot do on its own
// is notice when somebody replaces the object under a key it still trusts. The
// hash is computed once, on ingest, before the object is written — after that,
// any read can be verified against it. A lab report whose bytes no longer hash
// to the value recorded when the provider signed off on it is not a lab report,
// it is an incident. The same hash is what makes a document referenceable from
// the trace ledger: the ledger row names the digest, so "the provider reviewed
// THIS file" survives the file being replaced.

export type DocumentKind =
  | "Lab report"
  | "Signed consent"
  | "Plan of care"
  | "Receipt"
  | "Superbill"
  | "Body scan"
  | "ID"
  | "Other";

/**
 * How the document got here.
 *  - "Uploaded"        — staff put it in
 *  - "Generated"       — Apex produced it (receipts, superbills, plans of care)
 *  - "Member submitted" — the member uploaded it through the portal or intake
 */
export type DocumentSource = "Uploaded" | "Generated" | "Member submitted";

export interface Document {
  id: string;
  clientId: string;
  kind: DocumentKind;
  title: string;
  uploadedAt: string; // ISO datetime
  /** Absent when the member submitted it themselves. */
  uploadedByStaffId?: string;
  sizeBytes: number;
  mimeType: string;
  /** Hex digest of the object's bytes. See the header — this is the integrity proof. */
  sha256: string;
  /** Path into blob storage. Never a public URL; reads go through a signed, expiring link. */
  storageKey: string;
  source: DocumentSource;
  /**
   * Whether the member can see this in their portal.
   *
   * Defaults to false for anything a clinician has not released yet. A member
   * finding an abnormal result in the portal before their provider has called
   * them is a real harm, not a UX inconvenience — so visibility is an explicit
   * decision on every row rather than something inferred from kind.
   */
  visibleToClient: boolean;
}

/**
 * The kinds a member can hand to their HSA/FSA administrator.
 *
 * This matters commercially to Alpha Health: much of what they do is eligible
 * for HSA/FSA reimbursement, but only if the member can produce a document that
 * shows date of service, provider, and an itemised charge. A card receipt alone
 * usually is not enough — the superbill is.
 */
export const REIMBURSABLE_KINDS: DocumentKind[] = ["Receipt", "Superbill"];

export function isReimbursable(d: Document): boolean {
  return REIMBURSABLE_KINDS.includes(d.kind);
}

export const DOCUMENT_KINDS: DocumentKind[] = [
  "Lab report",
  "Signed consent",
  "Plan of care",
  "Receipt",
  "Superbill",
  "Body scan",
  "ID",
  "Other",
];

/** Human file size. Bytes are the stored unit; nobody reads bytes. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}
