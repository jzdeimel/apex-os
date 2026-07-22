import { sha256 } from "@/lib/trace/hash";

/**
 * DIGITAL SIGNATURES — what makes one mean something.
 *
 * Zack Deimel committed to this on the 2026-07-21 sync, and stated the two
 * requirements plainly:
 *
 *   "It's like the document cannot be altered. And then that signature has to
 *    be connected to that exact document."
 *
 * Paul Kennard added the third, from the other side of the table:
 *
 *   "Do we know if a patient is required to get a printed out copy of the thing
 *    that they just signed? I don't think I've ever gotten that."
 *   Matt Chilson: "I don't recall ever giving anything to a patient."
 *
 * ── SCOPE: NOT JUST CLINICAL CONSENTS ──────────────────────────────────────
 * `consent` in the schema already versions and hashes clinical consents. What
 * had nowhere to live was everything else a patient signs — and Matt named the
 * failure directly: Alpha plan contracts went out through MindBody and "half
 * the time it got sent, half the time it didn't." A contract nobody can prove
 * was sent is a contract that does not exist.
 *
 * So one model covers consent, contract and attestation. They differ in legal
 * regime, not in what makes the signature valid.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ──────────────────────────────────────────
 * No rendering, no storage, no email. This module answers only "is this
 * signature sound, and what is the evidence" — pure, so it can be reasoned
 * about and exercised without a browser, a Blob container or a mail server.
 * The transport lives at the edge, like lib/orders/medsource.ts.
 *
 * ── E-SIGN / UETA, IN PLAIN TERMS ──────────────────────────────────────────
 * A US electronic signature needs: intent to sign, consent to transact
 * electronically, association of the signature with the record, and a retained
 * record the signer can reproduce. Each maps to a field below. None of them is
 * satisfied by a checkbox alone, which is what most intake forms ship.
 */

export type DocumentKind =
  /** Clinical consent — treatment, telehealth, HIPAA notice. */
  | "consent"
  /** A commercial agreement. Alpha plan contracts live here. */
  | "contract"
  /** A clinician attesting to their own record. */
  | "attestation";

export interface SignableDocument {
  id: string;
  kind: DocumentKind;
  /** Stable across versions. "alpha-plan-agreement". */
  documentId: string;
  /** Immutable once published. */
  version: string;
  title: string;
  /** The exact text shown to the signer. */
  body: string;
  /** The legal regime, surfaced to the signer rather than assumed. */
  regime: string;
}

/**
 * The hash of what was actually shown.
 *
 * A version string alone proves nothing if the document behind it can be
 * edited — the same argument `consent.textSha256` makes, and the same one
 * `formSha256` makes for the intake questionnaire. Computed over the fields
 * that carry meaning, so a whitespace tidy does not invalidate a signature and
 * a wording change does.
 */
export function documentSha256(doc: SignableDocument): string {
  return sha256(
    JSON.stringify({
      documentId: doc.documentId,
      version: doc.version,
      title: doc.title.trim(),
      body: doc.body.replace(/\s+/g, " ").trim(),
    }),
  );
}

/**
 * Everything captured at the moment of signing.
 *
 * `signedByRole` distinguishes the two cases that look identical afterwards and
 * are not remotely equivalent: the patient signing, and a staff member signing
 * on their own behalf. A coach typing a patient's name into a signature field
 * is not a patient signature, and the 2026-07-21 decision to make intake
 * coach-guided makes that a live risk rather than a theoretical one.
 */
export interface SignatureEvidence {
  /** Typed name, verbatim. Never normalised — it is the mark. */
  signatureName: string;
  /** "patient" | "staff" | "guardian" */
  signedByRole: string;
  /** The account that authenticated, when one did. Null for a token link. */
  signedByAccountId: string | null;
  signedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  /**
   * Whether the signer affirmatively agreed to transact electronically.
   * Required by E-SIGN and routinely omitted; a pre-ticked box is not consent.
   */
  electronicConsentGiven: boolean;
  /** True when the signer confirmed they had read the document. */
  attestedRead: boolean;
}

export interface SignedRecord {
  document: SignableDocument;
  documentSha256: string;
  evidence: SignatureEvidence;
}

export interface SigningProblem {
  field: string;
  message: string;
}

/**
 * Is this signature sound enough to rely on?
 *
 * Refuses rather than warns. A signature captured without its evidence cannot
 * be repaired later — the moment is gone — so the only useful time to insist is
 * before it is stored.
 */
export function validateSignature(
  doc: SignableDocument,
  evidence: SignatureEvidence,
): SigningProblem[] {
  const problems: SigningProblem[] = [];

  if (!evidence.signatureName.trim()) {
    problems.push({ field: "signatureName", message: "A signature is required." });
  }

  if (!evidence.attestedRead) {
    problems.push({
      field: "attestedRead",
      message: "The signer must confirm they have read the document. Intent to sign is not inferable from a click.",
    });
  }

  if (!evidence.electronicConsentGiven) {
    problems.push({
      field: "electronicConsentGiven",
      message: "The signer must agree to sign electronically. E-SIGN requires this separately from the document itself.",
    });
  }

  if (!evidence.ipAddress || !evidence.userAgent) {
    problems.push({
      field: "evidence",
      message: "IP address and user agent are part of the evidence tuple and cannot be captured after the fact.",
    });
  }

  /**
   * THE ONE THAT MATTERS MOST FOR COACH-GUIDED INTAKE.
   *
   * Paul Kennard decided intake is coach-guided: "the quality of the intake
   * process will be better if it is guided by the coach." That is right for the
   * questions and wrong for the signature. If a staff account is authenticated
   * and the signer is the patient, the patient did not sign — the coach did,
   * using the patient's name, which is not a signature and will not survive
   * anyone looking at it.
   */
  if (evidence.signedByRole === "patient" && evidence.signedByAccountId) {
    problems.push({
      field: "signedByRole",
      message:
        "A patient signature cannot be captured inside a staff session. Hand the device to the patient or send a signing link — a coach typing the patient's name is not the patient's signature.",
    });
  }

  if (!doc.version.trim()) {
    problems.push({ field: "version", message: "The document version is missing." });
  }

  return problems;
}

export function signatureAcceptable(problems: readonly SigningProblem[]): boolean {
  return problems.length === 0;
}

/**
 * The audit certificate — the page appended to the archived PDF.
 *
 * This is what makes the record reproducible by the signer, which is the fourth
 * E-SIGN requirement and the one Alpha Health has never met: nobody could
 * recall a patient ever receiving a copy of anything they signed.
 *
 * Returned as structured lines rather than formatted text so the renderer
 * decides layout and this module stays testable.
 */
export function auditCertificate(record: SignedRecord): Array<{ label: string; value: string }> {
  const { document: doc, evidence } = record;
  return [
    { label: "Document", value: `${doc.title} (${doc.documentId})` },
    { label: "Version", value: doc.version },
    { label: "Content hash (SHA-256)", value: record.documentSha256 },
    { label: "Signed by", value: evidence.signatureName },
    { label: "Signing as", value: evidence.signedByRole },
    { label: "Signed at", value: evidence.signedAt },
    { label: "IP address", value: evidence.ipAddress ?? "not captured" },
    { label: "Device", value: evidence.userAgent ?? "not captured" },
    { label: "Agreed to sign electronically", value: evidence.electronicConsentGiven ? "yes" : "no" },
    { label: "Confirmed having read it", value: evidence.attestedRead ? "yes" : "no" },
    {
      label: "Verification",
      value:
        "Re-hash the document text and compare to the content hash above. A mismatch means the document changed after signing.",
    },
  ];
}

/**
 * Does a stored record still match the document it claims to be?
 *
 * The whole point of the hash. Called when a signed record is opened, so
 * tampering surfaces on read rather than during a dispute.
 */
export function verifySignedRecord(record: SignedRecord): { valid: boolean; reason: string } {
  const recomputed = documentSha256(record.document);
  if (recomputed !== record.documentSha256) {
    return {
      valid: false,
      reason:
        "The document text no longer matches the hash captured at signing. This signature covers a different document than the one stored.",
    };
  }
  return { valid: true, reason: "Document matches the version that was signed." };
}
