// =============================================================================
// Apex — document mock data
// =============================================================================
//
// Deterministic documents across the roster. The mix is deliberately uneven:
// every active member has a consent and a receipt, most have labs, a minority
// have body scans, and a handful have an ID sitting there that nobody ever
// released to the portal. Real document stores are lumpy, and a filter is only
// worth building if the data can actually be lumpy enough to need it.

import type { Document, DocumentKind, DocumentSource } from "@/lib/documents/types";
import { clients } from "@/lib/mock/clients";
import { staff } from "@/lib/mock/staff";
import { seededRandom, absolute } from "@/lib/utils";
import { sha256 } from "@/lib/trace/hash";

const NOW = absolute("2026-06-12T09:00:00");

/** Only staff who plausibly touch documents. Coaches upload; providers release. */
const UPLOADERS = staff.filter((s) => s.role !== "Admin");

interface Template {
  kind: DocumentKind;
  title: (n: number) => string;
  mimeType: string;
  /** Realistic size band, in KB. A 12MB DEXA PDF and a 40KB receipt are not the same object. */
  kb: [number, number];
  source: DocumentSource;
  /** Whether the member sees it by default. Clinical results start hidden. */
  visible: boolean;
  ext: string;
}

const TEMPLATES: Template[] = [
  {
    kind: "Lab report",
    title: (n) => (n % 2 === 0 ? "Alpha Base Panel — results" : "Hormone & metabolic panel — results"),
    mimeType: "application/pdf",
    kb: [420, 1800],
    source: "Uploaded",
    visible: true,
    ext: "pdf",
  },
  {
    kind: "Signed consent",
    title: () => "Consent to evaluation and treatment (v2026.1)",
    mimeType: "application/pdf",
    kb: [80, 190],
    source: "Generated",
    visible: true,
    ext: "pdf",
  },
  {
    kind: "Plan of care",
    title: () => "Plan of care — provider approved",
    mimeType: "application/pdf",
    kb: [180, 420],
    source: "Generated",
    visible: true,
    ext: "pdf",
  },
  {
    kind: "Receipt",
    title: (n) => `Receipt — membership, ${["March", "April", "May", "June"][n % 4]} 2026`,
    mimeType: "application/pdf",
    kb: [40, 95],
    source: "Generated",
    visible: true,
    ext: "pdf",
  },
  {
    kind: "Superbill",
    title: () => "Superbill — itemised, for HSA/FSA submission",
    mimeType: "application/pdf",
    kb: [110, 240],
    source: "Generated",
    visible: true,
    ext: "pdf",
  },
  {
    kind: "Body scan",
    title: () => "InBody 970 — segmental composition report",
    mimeType: "application/pdf",
    kb: [900, 3400],
    source: "Uploaded",
    visible: true,
    ext: "pdf",
  },
  {
    // Government ID. Visible to the member is pointless (they own it) and
    // visible to everyone is a liability, so it stays unreleased by default.
    kind: "ID",
    title: () => "Government ID — identity verification",
    mimeType: "image/jpeg",
    kb: [640, 2200],
    source: "Member submitted",
    visible: false,
    ext: "jpg",
  },
  {
    kind: "Other",
    title: () => "Outside records — prior provider summary",
    mimeType: "application/pdf",
    kb: [300, 2600],
    source: "Member submitted",
    visible: false,
    ext: "pdf",
  },
];

/** Probability each template appears for a given member. Sums to a lumpy store. */
const ODDS: Record<DocumentKind, number> = {
  "Signed consent": 0.96,
  Receipt: 0.88,
  "Lab report": 0.72,
  "Plan of care": 0.55,
  Superbill: 0.44,
  "Body scan": 0.3,
  ID: 0.22,
  Other: 0.16,
};

/**
 * Storage key layout: `clients/<clientId>/<kind-slug>/<docId>.<ext>`.
 *
 * Client id is the FIRST path segment on purpose. Blob storage authorises by
 * prefix, so a per-member prefix is what makes "this token can read exactly one
 * member's documents and nothing else" expressible in the SAS policy rather
 * than enforced only in application code.
 */
function storageKeyFor(clientId: string, kind: DocumentKind, id: string, ext: string): string {
  const slug = kind.toLowerCase().replace(/[^a-z]+/g, "-");
  return `clients/${clientId}/${slug}/${id}.${ext}`;
}

function build(): Document[] {
  const out: Document[] = [];
  let n = 0;

  // Only members past the lead stage have documents — a lead who never booked
  // has nothing on file, and pretending otherwise makes the roster filter lie.
  const withFiles = clients.filter(
    (c) => c.status !== "Lead" && c.status !== "Consult Booked",
  );

  for (const c of withFiles) {
    const rand = seededRandom(`apex-docs::${c.id}`);
    let daysBack = 4 + Math.floor(rand() * 40);

    for (const t of TEMPLATES) {
      if (rand() > ODDS[t.kind]) continue;

      n += 1;
      const id = `doc-${String(n).padStart(4, "0")}`;

      // Walk backwards so a member's documents are spread across their tenure
      // instead of all landing in the same afternoon.
      daysBack += 3 + Math.floor(rand() * 26);
      const at = absolute(NOW.getTime() - daysBack * 86_400_000 - Math.floor(rand() * 8) * 3_600_000,
      ).toISOString();

      const [lo, hi] = t.kb;
      const sizeBytes = Math.round((lo + rand() * (hi - lo)) * 1024);

      const uploader =
        t.source === "Member submitted"
          ? undefined
          : UPLOADERS[Math.floor(rand() * UPLOADERS.length)];

      // A small share of clinical results are still sitting unreleased — the
      // provider has not called the member yet. That state is the whole reason
      // `visibleToClient` is a column and not a rule.
      const held = t.kind === "Lab report" && rand() < 0.18;

      out.push({
        id,
        clientId: c.id,
        kind: t.kind,
        title: t.title(n),
        uploadedAt: at,
        ...(uploader ? { uploadedByStaffId: uploader.id } : {}),
        sizeBytes,
        mimeType: t.mimeType,
        // Digest over stable identity + size. Real digests come from the bytes;
        // this is a real SHA-256 of a stand-in so the column behaves correctly.
        sha256: sha256(`${id}|${c.id}|${t.kind}|${sizeBytes}`),
        storageKey: storageKeyFor(c.id, t.kind, id, t.ext),
        source: t.source,
        visibleToClient: t.visible && !held,
      });
    }
  }

  // Newest first — a document list is read like an inbox.
  return out.sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
}

export const documents: Document[] = build();

export function documentsForClient(clientId: string): Document[] {
  return documents.filter((d) => d.clientId === clientId);
}

export function getDocument(id: string): Document | undefined {
  return documents.find((d) => d.id === id);
}

export function documentCountsByKind(rows: Document[] = documents): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const d of rows) counts[d.kind] = (counts[d.kind] ?? 0) + 1;
  return counts;
}
