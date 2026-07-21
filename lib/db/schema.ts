import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
  real,
} from "drizzle-orm/pg-core";

/**
 * Apex — persistence schema.
 *
 * SCOPE, AND WHY IT IS THIS SHAPE
 * ------------------------------
 * The audit's headline finding was that nothing a user does survives a reload:
 * dose logs, ledger rows, notes, escalations, bookings and orders all lived in
 * module-level arrays or React state (docs/audit/INVENTORY.md §2).
 *
 * This schema covers the WRITE paths. The 5,000-patient demo corpus stays in
 * lib/mock/** for now, deliberately — converting 59 client-component routes to
 * server-fetched reads is a rewrite of the whole application and buys nothing
 * today. Splitting reads from writes closes the P0 (nothing persists) without
 * that rewrite, and it is the correct migration shape regardless: when real
 * patient data arrives, each seeded read is swapped for a query behind the same
 * server boundary, one table at a time.
 *
 * Where a column references a seeded entity (a client, a staff member, a SKU)
 * it is a plain `text` id with no FK, because the referent does not live in this
 * database yet. Those become real foreign keys as each corpus migrates. They are
 * marked `-- seeded ref` so the sweep is mechanical rather than archaeological.
 *
 * CONVENTIONS
 *  · Money is integer cents. Never a float. The existing domain code already
 *    obeys this (lib/costs/breakdown.ts) and a float here would poison it.
 *  · Timestamps are `timestamptz`. The audit found 92 call sites reading local
 *    date parts off UTC-parsed values; storing anything zoneless would reopen it.
 *  · Clinical rows are APPEND-ONLY. Corrections are new rows referencing the
 *    original, never UPDATEs. A chart you can rewrite is not a chart.
 */

/* ========================================================================== */
/* Audit ledger — the spine                                                    */
/* ========================================================================== */

/**
 * The hash-chained audit ledger.
 *
 * Previously `export const ledger: LedgerRow[]` — a module array, so every
 * append died on restart and each Container Apps replica kept its own divergent
 * chain (docs/audit/GAP_ANALYSIS.md, Top-10 #3). For a product whose thesis is
 * traceability that was the least durable object in it, and HIPAA §164.312(b)
 * requires the opposite.
 *
 * `seq` is a monotonic counter and `prevHash`/`hash` chain the rows, so the
 * table is tamper-EVIDENT even though Postgres itself permits UPDATE. Detection
 * is `verifyChain`, which already exists in lib/trace/ledger.ts and works
 * unchanged against rows read from here.
 *
 * There is no UPDATE or DELETE path in the repository layer. Enforce it in the
 * database too when the server exists:
 *   REVOKE UPDATE, DELETE ON ledger FROM apex_app;
 */
export const ledger = pgTable(
  "ledger",
  {
    id: text("id").primaryKey(),
    seq: integer("seq").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull(),

    actorId: text("actor_id").notNull(), // seeded ref -> staff | client
    actorName: text("actor_name").notNull(),
    actorRole: text("actor_role").notNull(),

    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),

    /** The patient a row is ABOUT. Null for rows with no clinical subject. */
    subjectId: text("subject_id"), // seeded ref -> client
    subjectName: text("subject_name"),
    locationId: text("location_id"), // seeded ref -> location

    reason: text("reason"),
    before: jsonb("before"),
    after: jsonb("after"),

    prevHash: text("prev_hash").notNull(),
    hash: text("hash").notNull(),
  },
  (t) => ({
    seqIdx: uniqueIndex("ledger_seq_idx").on(t.seq),
    // The member-facing access log ("who viewed my chart") queries by subject
    // and time; without this it table-scans an append-only table that only grows.
    subjectAtIdx: index("ledger_subject_at_idx").on(t.subjectId, t.at),
    entityIdx: index("ledger_entity_idx").on(t.entity, t.entityId),
  }),
);

/* ========================================================================== */
/* Member self-logging — the habit loop                                        */
/* ========================================================================== */

/**
 * One row per member per day.
 *
 * `lib/member/logStore.tsx` held a SINGLE day in localStorage and discarded any
 * log whose date was not today, so nothing accumulated and the Investment
 * quadrant of the habit loop was a 120-day `seededRandom` fiction
 * (docs/audit/ENGAGEMENT.md). History is the entire point: rings, streaks and
 * trends must read this table, not a PRNG.
 *
 * `date` is a calendar date in the CLINIC timezone, not a timestamp — "did they
 * log on Tuesday" is a question about the clinic's day, not about UTC.
 */
export const memberDay = pgTable(
  "member_day",
  {
    clientId: text("client_id").notNull(), // seeded ref -> client
    date: text("date").notNull(), // YYYY-MM-DD, clinic timezone
    weightLb: real("weight_lb"),
    /** 1–5 ratings keyed by question. Ad-hoc today; validated instruments land in `instrumentScore`. */
    feel: jsonb("feel"),
    /** Provider-instructed pause. A held day is not a failed day — see lib/play/streak.ts. */
    protectedDay: boolean("protected_day").default(false).notNull(),
    protectedReason: text("protected_reason"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.clientId, t.date] }),
    clientDateIdx: index("member_day_client_date_idx").on(t.clientId, t.date),
  }),
);

/**
 * A dose, as the member reported it.
 *
 * SELF-REPORTED, and the column says so rather than the comment. A closed ring
 * is a member saying they took it; it is not confirmation that they did, and
 * nothing downstream — adherence risk, coach worklists, clinician review —
 * should be allowed to conflate the two.
 *
 * Append-only including retraction: `undoDose` previously filtered local state
 * and left the ledger permanently asserting a dose the member took back
 * (docs/audit/ENGAGEMENT.md, friction #6). A retraction is a new row.
 */
export const doseLog = pgTable(
  "dose_log",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull(), // seeded ref -> client
    prescriptionId: text("prescription_id").notNull(),
    date: text("date").notNull(), // YYYY-MM-DD, clinic timezone
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull(),
    site: text("site"),
    /** True when the member recorded that they did NOT take it. */
    skipped: boolean("skipped").default(false).notNull(),
    skipReason: text("skip_reason"),
    /** Set when a later row retracts this one. Never deleted. */
    retractedAt: timestamp("retracted_at", { withTimezone: true }),
    retractedBy: text("retracted_by"),
    source: text("source").default("member-self-report").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    clientDateIdx: index("dose_log_client_date_idx").on(t.clientId, t.date),
  }),
);

/**
 * Validated instrument scores — ADAM, qADAM, Greene/MRS, PHQ-2/9, IIEF.
 *
 * The audit found ZERO validated instruments in a TRT/HRT product: six ad-hoc
 * 1–5 scales only (docs/audit/GAP_ANALYSIS.md, CLIENT table). "Energy 3/5" is
 * not a defensible treatment-response measure, cannot be trended against a
 * published MCID, and is not what a board or a malpractice defence will ask for.
 * The women's track had no menopause rating scale at all.
 *
 * Raw item responses are kept alongside the total so a score can be recomputed
 * if scoring rules are ever corrected — a stored total with no items is a number
 * nobody can re-derive.
 */
export const instrumentScore = pgTable(
  "instrument_score",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull(), // seeded ref -> client
    /** e.g. "ADAM" | "qADAM" | "GREENE" | "MRS" | "PHQ9" | "IIEF5" */
    instrument: text("instrument").notNull(),
    version: text("version").notNull(),
    administeredAt: timestamp("administered_at", { withTimezone: true }).notNull(),
    /** Raw item responses, so the total can be recomputed. */
    items: jsonb("items").notNull(),
    total: real("total"),
    /** Instrument-defined interpretation band, never invented here. */
    band: text("band"),
    administeredBy: text("administered_by"), // seeded ref -> staff, null = self
  },
  (t) => ({
    clientInstIdx: index("instrument_client_idx").on(t.clientId, t.instrument, t.administeredAt),
  }),
);

/* ========================================================================== */
/* Clinical writes                                                             */
/* ========================================================================== */

/**
 * Consults, with real SOAP structure.
 *
 * `Consult` previously had ONE authored field (`rawNotes`); `subjective` and
 * `objective` were derived by keyword regex, and there was no Assessment and no
 * Plan at all (docs/audit/GAP_ANALYSIS.md, MEDICAL table). That is not a
 * clinical note.
 *
 * Signed rows are immutable. Corrections are addenda — the type existed with no
 * writer, which is why `consult_addendum` is a table and not a JSON column.
 */
export const consult = pgTable(
  "consult",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull(), // seeded ref -> client
    authorId: text("author_id").notNull(), // seeded ref -> staff
    kind: text("kind").notNull(),
    channel: text("channel").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationMin: integer("duration_min"),

    // Real SOAP. Authored, not inferred.
    subjective: text("subjective"),
    objective: text("objective"),
    assessment: text("assessment"),
    plan: text("plan"),
    /** Free-text working notes. Retained: coaches type mid-conversation. */
    rawNotes: text("raw_notes"),
    /** AI-drafted summary. Assistive only — never a substitute for the fields above. */
    aiSummary: jsonb("ai_summary"),

    status: text("status").notNull(),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    signedBy: text("signed_by"), // seeded ref -> staff
    /** Attestation text shown at signing time, stored as displayed. */
    attestation: text("attestation"),
    signerCredential: text("signer_credential"),
    visibleToClient: boolean("visible_to_client").default(false).notNull(),
    ledgerId: text("ledger_id"),
    /** Last server-side write. Drives the "Draft saved {time}" stamp and stale-draft hygiene. */
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    clientIdx: index("consult_client_idx").on(t.clientId, t.startedAt),
    unsignedIdx: index("consult_unsigned_idx").on(t.authorId, t.status),
    // At most ONE live draft per (author, client). The partial predicate lets a
    // signed consult and a fresh draft for the same pair coexist, while the
    // upsert in repo.upsertConsultDraft relies on this to be a real conflict
    // target — so one clinician's chart never accretes a pile of half-notes.
    draftUnique: uniqueIndex("consult_draft_unique")
      .on(t.authorId, t.clientId)
      .where(sql`status = 'Draft'`),
  }),
);

export const consultAddendum = pgTable("consult_addendum", {
  id: text("id").primaryKey(),
  consultId: text("consult_id").notNull().references(() => consult.id),
  authorId: text("author_id").notNull(), // seeded ref -> staff
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  ledgerId: text("ledger_id"),
});

/**
 * Chart fundamentals that did not exist at all.
 *
 * No allergy list, no problem list, no outside-medication list, no family
 * history (docs/audit/GAP_ANALYSIS.md, MEDICAL). A GLP-1 could be recommended,
 * co-signed and shipped against a record holding none of these — and the
 * MTC/MEN2 boxed-warning check in lib/clinical/interactions.ts literally cannot
 * execute, which it says on screen: "Family history in Apex: not stored."
 */
export const allergy = pgTable(
  "allergy",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull(), // seeded ref -> client
    substance: text("substance").notNull(),
    reaction: text("reaction"),
    /** "mild" | "moderate" | "severe" | "anaphylaxis" | "unknown" */
    severity: text("severity").notNull().default("unknown"),
    /** Absence of a known allergy is a clinical statement and must be recordable. */
    noKnownAllergies: boolean("no_known_allergies").default(false).notNull(),
    recordedBy: text("recorded_by"), // seeded ref -> staff
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => ({ clientIdx: index("allergy_client_idx").on(t.clientId) }),
);

export const problem = pgTable(
  "problem",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull(), // seeded ref -> client
    label: text("label").notNull(),
    /** ICD-10 where known. Null is honest; a guessed code is billing fraud. */
    icd10: text("icd10"),
    status: text("status").notNull().default("active"),
    onsetOn: text("onset_on"),
    resolvedOn: text("resolved_on"),
    recordedBy: text("recorded_by"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ clientIdx: index("problem_client_idx").on(t.clientId, t.status) }),
);

/**
 * Medications the patient takes, INCLUDING those prescribed elsewhere.
 *
 * `lib/clinical/interactions.ts:349` renders SCREEN_COVERAGE naming exactly what
 * it cannot see — external meds, so GLP-1 + sulfonylurea and testosterone +
 * anticoagulant are unscreenable. That disclosure is excellent and it is also a
 * standing request for this table. Once populated, those interactions become
 * checkable and the disclosure shrinks.
 */
export const medication = pgTable(
  "medication",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull(), // seeded ref -> client
    name: text("name").notNull(),
    /** True when prescribed outside Alpha Health. */
    external: boolean("external").default(true).notNull(),
    dose: text("dose"),
    frequency: text("frequency"),
    startedOn: text("started_on"),
    stoppedOn: text("stopped_on"),
    prescriber: text("prescriber"),
    recordedBy: text("recorded_by"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ clientIdx: index("medication_client_idx").on(t.clientId) }),
);

/**
 * Adverse events.
 *
 * Absent entirely (docs/audit/GAP_ANALYSIS.md). For a clinic administering
 * exogenous hormones, GLP-1s and compounded peptides, the only artefact named
 * "side effect" anywhere in the codebase was an SMS template.
 */
export const adverseEvent = pgTable(
  "adverse_event",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull(), // seeded ref -> client
    reportedAt: timestamp("reported_at", { withTimezone: true }).notNull(),
    reportedBy: text("reported_by").notNull(),
    /** "member" | "coach" | "clinician" */
    reporterKind: text("reporter_kind").notNull(),
    /** SKU or free text — the thing suspected. Null is allowed; unknown is a real answer. */
    suspectSku: text("suspect_sku"),
    description: text("description").notNull(),
    /** "mild" | "moderate" | "severe" | "life-threatening" */
    severity: text("severity").notNull(),
    outcome: text("outcome"),
    actionTaken: text("action_taken"),
    /** Set when escalated to a clinician; null means nobody has looked yet. */
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    /** FDA MedWatch / manufacturer reporting reference, once submitted. */
    externalReportRef: text("external_report_ref"),
    ledgerId: text("ledger_id"),
  },
  (t) => ({
    clientIdx: index("ae_client_idx").on(t.clientId, t.reportedAt),
    unreviewedIdx: index("ae_unreviewed_idx").on(t.reviewedAt),
  }),
);

/* ========================================================================== */
/* Controlled substances                                                       */
/* ========================================================================== */

/**
 * Prescriptions, with the controlled-substance handling that did not exist.
 *
 * Testosterone is Schedule III. The audit found no DEA number, no schedule
 * flag, no PDMP, no quantity cap, no refill cap and no dispensing record
 * anywhere: `HRT-TCYP-200` traversed the identical validation path as a box of
 * needles (docs/audit/GAP_ANALYSIS.md, Top-10 #6).
 *
 * `refillsAuthorised` is a CAP, not a counter. The previous model had
 * `refillsPlaced` incrementing forever with nothing to compare it against.
 */
export const prescription = pgTable(
  "prescription",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull(), // seeded ref -> client
    sku: text("sku").notNull(), // seeded ref -> catalog

    doseAmount: real("dose_amount").notNull(),
    doseUnit: text("dose_unit").notNull(),
    /** Supply shape: lyophilised vial + diluent, or a pre-mixed solution. */
    supply: jsonb("supply").notNull(),
    days: jsonb("days").notNull(),
    timeOfDay: text("time_of_day").notNull(),

    /** DEA schedule where controlled. Null = not a controlled substance. */
    scheduleClass: text("schedule_class"),
    /** Total dispensable quantity. Enforced, not advisory. */
    quantityAuthorised: integer("quantity_authorised"),
    /** Refill CAP. Schedule III is capped by law; null means non-controlled. */
    refillsAuthorised: integer("refills_authorised"),
    refillsUsed: integer("refills_used").default(0).notNull(),
    /** Controlled prescriptions expire. An unbounded Rx is a compliance finding. */
    expiresOn: text("expires_on"),

    /** A dose exists only with a signature behind it. Both are required. */
    prescribedBy: text("prescribed_by").notNull(), // seeded ref -> staff
    prescribedAt: timestamp("prescribed_at", { withTimezone: true }).notNull(),
    /** The prescriber's DEA registration AT TIME OF WRITING. Denormalised deliberately. */
    prescriberDea: text("prescriber_dea"),
    /** State the patient was in. Licensure is a property of the patient's location. */
    patientState: text("patient_state"),

    status: text("status").notNull().default("active"),
    discontinuedAt: timestamp("discontinued_at", { withTimezone: true }),
    discontinuedReason: text("discontinued_reason"),
    ledgerId: text("ledger_id"),
  },
  (t) => ({
    clientIdx: index("rx_client_idx").on(t.clientId, t.status),
    controlledIdx: index("rx_controlled_idx").on(t.scheduleClass, t.prescribedAt),
  }),
);

/**
 * Every dispense or administration, with the lot.
 *
 * This is the table that makes a recall answerable. The audit found the
 * lot→patient join did not close and that three comments claimed it did
 * (docs/audit/GAP_ANALYSIS.md, Top-10 #5): order lots were fabricated from a
 * third private catalog, no `byLot` query existed, in-clinic administration
 * recorded nothing, and inventory never decremented.
 *
 * One row per unit leaving the shelf or entering a patient, whether shipped or
 * pushed in a chair. `lotNumber` is the SAME vocabulary as inventory — that is
 * the whole point and it must never fork again.
 */
export const dispense = pgTable(
  "dispense",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull(), // seeded ref -> client
    prescriptionId: text("prescription_id"),
    sku: text("sku").notNull(), // seeded ref -> catalog
    /** MUST match inventory.lotNumber. The recall query joins on this. */
    lotNumber: text("lot_number").notNull(),
    expiryOn: text("expiry_on"),
    quantity: integer("quantity").notNull(),
    /** "shipped" | "picked-up" | "administered-in-clinic" */
    method: text("method").notNull(),
    locationId: text("location_id"), // seeded ref -> location
    dispensedBy: text("dispensed_by").notNull(), // seeded ref -> staff
    dispensedAt: timestamp("dispensed_at", { withTimezone: true }).notNull(),
    orderId: text("order_id"),
    ledgerId: text("ledger_id"),
  },
  (t) => ({
    // The recall query. "Who received lot BPC-2604A?" is one indexed lookup.
    lotIdx: index("dispense_lot_idx").on(t.lotNumber),
    clientIdx: index("dispense_client_idx").on(t.clientId, t.dispensedAt),
  }),
);

/**
 * PDMP query records.
 *
 * A PDMP check is itself a regulated act: you must be able to show WHO checked,
 * WHEN, and for whom. The response body is deliberately NOT stored in full —
 * it contains other prescribers' data and retaining it broadens the blast
 * radius of a breach for no clinical gain. A reference and a summary is enough
 * to prove the check happened.
 */
export const pdmpCheck = pgTable(
  "pdmp_check",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull(), // seeded ref -> client
    checkedBy: text("checked_by").notNull(), // seeded ref -> staff
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
    /** "NC" | "SC" — the programme queried. */
    state: text("state").notNull(),
    /** Opaque reference returned by the programme. */
    externalRef: text("external_ref"),
    /** "clear" | "review" | "error" — a summary, never the full response. */
    result: text("result").notNull(),
    notes: text("notes"),
    ledgerId: text("ledger_id"),
  },
  (t) => ({ clientIdx: index("pdmp_client_idx").on(t.clientId, t.checkedAt) }),
);

/* ========================================================================== */
/* Scheduling, consent, messaging                                              */
/* ========================================================================== */

/**
 * Appointments — with an encounter clock.
 *
 * `"Checked In"` existed as a seeded enum value on ONE record with no setter,
 * no arrival timestamp, no room and no check-out, so there was no encounter
 * clock and therefore no billable-visit basis, no wait time and no room turn
 * (docs/audit/GAP_ANALYSIS.md, FRONT DESK).
 */
export const appointment = pgTable(
  "appointment",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull(), // seeded ref -> client
    staffId: text("staff_id").notNull(), // seeded ref -> staff
    locationId: text("location_id").notNull(), // seeded ref -> location
    visitType: text("visit_type").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),

    status: text("status").notNull().default("Scheduled"),
    arrivedAt: timestamp("arrived_at", { withTimezone: true }),
    roomedAt: timestamp("roomed_at", { withTimezone: true }),
    room: text("room"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    /** Distinguishes a cancellation from a no-show — they release capacity differently. */
    cancelledBy: text("cancelled_by"),
    cancelReason: text("cancel_reason"),

    /** Telehealth visits occur where the PATIENT sits. Drives licensure. */
    patientState: text("patient_state"),
    bookedBy: text("booked_by"),
    bookedAt: timestamp("booked_at", { withTimezone: true }).defaultNow().notNull(),
    ledgerId: text("ledger_id"),
  },
  (t) => ({
    dayIdx: index("appt_day_idx").on(t.locationId, t.startAt),
    clientIdx: index("appt_client_idx").on(t.clientId, t.startAt),
    staffIdx: index("appt_staff_idx").on(t.staffId, t.startAt),
  }),
);

/**
 * Consents, versioned and signed.
 *
 * The consents page hardcoded four grants with `useState` revocation and
 * claimed the real module "is not in the tree" — it is, with proper versioning
 * (lib/comms/consent.ts). No patient could sign anything: the only e-signature
 * machinery was clinician-facing. A consent you cannot prove the patient agreed
 * to, at a known version, is not a consent.
 */
export const consent = pgTable(
  "consent",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull(), // seeded ref -> client
    /** "treatment" | "telehealth" | "financial" | "clinical-comms" | "marketing" */
    scope: text("scope").notNull(),
    /** The exact document version agreed to, e.g. "telehealth-v2". */
    documentVersion: text("document_version").notNull(),
    granted: boolean("granted").notNull(),
    /** Typed name as the signature. Kept verbatim. */
    signatureName: text("signature_name"),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    /** Evidence tuple for an e-signature to mean anything. */
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ledgerId: text("ledger_id"),
  },
  (t) => ({
    clientScopeIdx: index("consent_client_scope_idx").on(t.clientId, t.scope),
  }),
);

/**
 * Messages, with real routing.
 *
 * `send()` hardcoded `staffId: coach?.id` regardless of the open thread and the
 * provider thread was permanently empty, so "my chest hurts after the
 * injection" reached a non-clinician and vanished from the view it was sent in
 * (docs/audit/GAP_ANALYSIS.md, Top-10 #4). `recipientRole` exists so routing is
 * data, not a guess made at render time.
 */
export const message = pgTable(
  "message",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull(), // seeded ref -> client
    /** "coach" | "clinical" — which care-team thread this belongs to. */
    thread: text("thread").notNull(),
    senderId: text("sender_id").notNull(),
    /** "member" | "coach" | "clinician" */
    senderKind: text("sender_kind").notNull(),
    recipientId: text("recipient_id"),
    recipientRole: text("recipient_role"),
    body: text("body").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    /** Set when a message is escalated from the coach thread to clinical. */
    escalatedAt: timestamp("escalated_at", { withTimezone: true }),
    escalationId: text("escalation_id"),
  },
  (t) => ({ threadIdx: index("message_thread_idx").on(t.clientId, t.thread, t.sentAt) }),
);

/**
 * Escalations. Coach → clinician, durably.
 *
 * `raiseEscalation()`'s return value was DISCARDED (ConsultComposer.tsx:405) and
 * the clinician queue re-seeded from a static array, so a coach raising an
 * urgent clinical concern got a toast and the provider never saw it. That was
 * the highest-severity broken path in the product.
 */
export const escalation = pgTable(
  "escalation",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull(), // seeded ref -> client
    raisedByStaffId: text("raised_by_staff_id").notNull(),
    raisedAt: timestamp("raised_at", { withTimezone: true }).notNull(),
    kind: text("kind").notNull(),
    priority: text("priority").notNull(),
    question: text("question").notNull(),
    /** The member's own words, quoted. The traceability argument in one column. */
    memberQuote: text("member_quote"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    status: text("status").notNull().default("Open"),
    acknowledgedBy: text("acknowledged_by"),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    answeredBy: text("answered_by"),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    answer: text("answer"),
    ledgerId: text("ledger_id"),
  },
  (t) => ({
    openIdx: index("escalation_open_idx").on(t.status, t.dueAt),
    clientIdx: index("escalation_client_idx").on(t.clientId, t.raisedAt),
  }),
);

/**
 * Coach contact log — real writes.
 *
 * `TodayQueue.tsx:284` toasted "Written to the ledger" with zero appendLedger
 * calls in the file, and lib/mock/contactLog.ts had no write API. The
 * most-clicked button on the coach home screen recorded nothing.
 */
export const contactEntry = pgTable(
  "contact_entry",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull(), // seeded ref -> client
    staffId: text("staff_id").notNull(), // seeded ref -> staff
    at: timestamp("at", { withTimezone: true }).notNull(),
    /** "call" | "sms" | "email" | "in-person" | "portal-message" */
    channel: text("channel").notNull(),
    direction: text("direction").notNull(),
    outcome: text("outcome"),
    notes: text("notes"),
    templateId: text("template_id"),
    ledgerId: text("ledger_id"),
  },
  (t) => ({ clientIdx: index("contact_client_idx").on(t.clientId, t.at) }),
);

/* ========================================================================== */
/* Money                                                                       */
/* ========================================================================== */

/**
 * Payment methods — processor-agnostic by construction.
 *
 * NO PAN, NO CVV, NO EXPIRY BEYOND DISPLAY. Only a processor token and the
 * last four for recognition. Apex must never be in PCI scope for cardholder
 * data, and the way to guarantee that is to have nowhere to put it.
 *
 * `processor` is a column rather than a compile-time constant because the
 * processor is being selected this week and the adapter must be swappable
 * without a migration. See lib/payments/port.ts.
 */
export const paymentMethod = pgTable(
  "payment_method",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull(), // seeded ref -> client
    processor: text("processor").notNull(),
    /** The processor's vault token. Never a card number. */
    processorToken: text("processor_token").notNull(),
    brand: text("brand"),
    last4: text("last4"),
    expMonth: integer("exp_month"),
    expYear: integer("exp_year"),
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (t) => ({ clientIdx: index("pm_client_idx").on(t.clientId) }),
);

/** Invoices. Integer cents throughout — see the header convention. */
export const invoice = pgTable(
  "invoice",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull(), // seeded ref -> client
    number: text("number").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    subtotalCents: integer("subtotal_cents").notNull(),
    discountCents: integer("discount_cents").default(0).notNull(),
    /** A discount with no reason is unauditable — the orders code already refuses it. */
    discountReason: text("discount_reason"),
    taxCents: integer("tax_cents").default(0).notNull(),
    totalCents: integer("total_cents").notNull(),
    paidCents: integer("paid_cents").default(0).notNull(),
    status: text("status").notNull().default("open"),
    /** HSA/FSA itemisation actually generated, not merely asserted. */
    hsaEligibleCents: integer("hsa_eligible_cents"),
    locationId: text("location_id"),
    ledgerId: text("ledger_id"),
  },
  (t) => ({
    numberIdx: uniqueIndex("invoice_number_idx").on(t.number),
    clientIdx: index("invoice_client_idx").on(t.clientId, t.issuedAt),
  }),
);

export const invoiceLine = pgTable("invoice_line", {
  id: text("id").primaryKey(),
  invoiceId: text("invoice_id").notNull().references(() => invoice.id),
  sku: text("sku"),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPriceCents: integer("unit_price_cents").notNull(),
  totalCents: integer("total_cents").notNull(),
  /** "eligible" | "ineligible" | "unknown" — three-valued, per lib/receipts/vault.ts. */
  hsaEligibility: text("hsa_eligibility").default("unknown").notNull(),
});

/**
 * Payment attempts — every one, including failures.
 *
 * Dunning was one seeded string. In a 5,000-patient membership book, failed
 * payments are where money leaks continuously and invisibly. You cannot build a
 * retry ladder without a record of what failed and why.
 */
export const paymentAttempt = pgTable(
  "payment_attempt",
  {
    id: text("id").primaryKey(),
    invoiceId: text("invoice_id"),
    clientId: text("client_id").notNull(),
    paymentMethodId: text("payment_method_id"),
    processor: text("processor").notNull(),
    processorRef: text("processor_ref"),
    amountCents: integer("amount_cents").notNull(),
    /** "succeeded" | "failed" | "pending" | "refunded" */
    status: text("status").notNull(),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull(),
    /** Which dunning attempt this was. 0 = original charge. */
    dunningAttempt: integer("dunning_attempt").default(0).notNull(),
    ledgerId: text("ledger_id"),
  },
  (t) => ({
    invoiceIdx: index("payment_invoice_idx").on(t.invoiceId),
    failedIdx: index("payment_failed_idx").on(t.status, t.attemptedAt),
  }),
);

/* ========================================================================== */
/* Inventory movement                                                          */
/* ========================================================================== */

/**
 * Inventory as a LEDGER, not a number.
 *
 * `quantity` was immutable: no receiving, no dispense, no waste, no cycle count.
 * Expiry and reorder logic was good logic over data that could not move, so
 * wastage on $210/vial tirzepatide was unmeasurable and every alert was
 * theoretical. Stock on hand is now a SUM over movements, which also makes the
 * count auditable.
 */
export const inventoryMovement = pgTable(
  "inventory_movement",
  {
    id: text("id").primaryKey(),
    sku: text("sku").notNull(),
    lotNumber: text("lot_number").notNull(),
    locationId: text("location_id").notNull(),
    /** "receive" | "dispense" | "waste" | "transfer-in" | "transfer-out" | "count-adjust" */
    kind: text("kind").notNull(),
    /** Signed. Receipts positive, dispenses negative. Sum = stock on hand. */
    quantityDelta: integer("quantity_delta").notNull(),
    expiryOn: text("expiry_on"),
    reason: text("reason"),
    staffId: text("staff_id").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull(),
    dispenseId: text("dispense_id"),
    ledgerId: text("ledger_id"),
  },
  (t) => ({
    stockIdx: index("inv_stock_idx").on(t.sku, t.locationId, t.lotNumber),
    lotIdx: index("inv_lot_idx").on(t.lotNumber),
  }),
);

/* ========================================================================== */
/* Leads / CRM                                                                 */
/* ========================================================================== */

/**
 * Leads, with the attribution that replacing GoHighLevel requires.
 *
 * The entire lead model was one enum value on a patient record. No source, no
 * UTM, no campaign, no stage history, no owner, no SLA — so Apex could not
 * answer "how many leads did we get last month", because a Lead had no created
 * date distinct from `joinedOn`. `/book` collected name, email, phone, location,
 * track and reason, and discarded all of it.
 */
export const lead = pgTable(
  "lead",
  {
    id: text("id").primaryKey(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    email: text("email"),
    phone: text("phone"),
    /** "men" | "women" — the care track selected at capture. */
    track: text("track"),
    preferredLocationId: text("preferred_location_id"),
    modality: text("modality"),
    reason: text("reason"),

    source: text("source"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    referrerClientId: text("referrer_client_id"),

    ownerStaffId: text("owner_staff_id"),
    stage: text("stage").notNull().default("new"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    /** Set when the lead becomes a client. Enables true cohorted conversion. */
    convertedClientId: text("converted_client_id"),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    lostReason: text("lost_reason"),
  },
  (t) => ({
    stageIdx: index("lead_stage_idx").on(t.stage, t.createdAt),
    sourceIdx: index("lead_source_idx").on(t.source, t.createdAt),
  }),
);

/**
 * Dated stage transitions.
 *
 * The funnel counted CURRENT status, so it was a snapshot that could not produce
 * a conversion rate over any window, and a client who converted then churned
 * counted as converted forever. Speed-to-lead and show rate need transitions,
 * not states.
 */
export const leadStageEvent = pgTable(
  "lead_stage_event",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id").notNull().references(() => lead.id),
    fromStage: text("from_stage"),
    toStage: text("to_stage").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull(),
    byStaffId: text("by_staff_id"),
    note: text("note"),
  },
  (t) => ({ leadIdx: index("lead_stage_lead_idx").on(t.leadId, t.at) }),
);

/* ========================================================================== */
/* Staff credentials                                                           */
/* ========================================================================== */

/**
 * Clinical credentials, licensure and supervision.
 *
 * `StaffRole` was three values — Admin | Coach | Medical — so an NP had
 * authority identical to the medical director, and NC and SC differ materially
 * on NP/PA oversight. Licences in the prototype were generated by `seededRandom`
 * with NO EXPIRY DATES, and the gate applied only at slot generation so nothing
 * re-checked at visit time.
 */
export const staffCredential = pgTable(
  "staff_credential",
  {
    id: text("id").primaryKey(),
    staffId: text("staff_id").notNull(), // seeded ref -> staff
    /** "MD" | "DO" | "NP" | "PA-C" | "RN" | "MA" */
    credential: text("credential").notNull(),
    /** Two-letter state. One row per state licensed in. */
    state: text("state").notNull(),
    licenseNumber: text("license_number"),
    issuedOn: text("issued_on"),
    /** Expiry is mandatory in practice — an unexpiring licence is a data error. */
    expiresOn: text("expires_on"),
    /** DEA registration, where held. Referenced by prescription.prescriberDea. */
    deaNumber: text("dea_number"),
    deaExpiresOn: text("dea_expires_on"),
    /** Supervising physician for NP/PA, where the state requires one. */
    supervisingStaffId: text("supervising_staff_id"),
    status: text("status").notNull().default("active"),
  },
  (t) => ({
    staffIdx: index("cred_staff_idx").on(t.staffId, t.state),
    expiryIdx: index("cred_expiry_idx").on(t.expiresOn),
  }),
);

/* ========================================================================== */
/* Member preferences                                                          */
/* ========================================================================== */

/**
 * Member preferences, including the gamification opt-out.
 *
 * P0 in docs/audit/ENGAGEMENT.md: there was NO opt-out. A member who wanted none
 * of the streak/level/quest layer still received all of it. The clinical
 * experience already survives without it; there was simply no switch to throw.
 */
/**
 * Staff — the roster, and the identity mapping that decides clinical authority.
 *
 * The audit called out that granting someone the power to prescribe was a commit
 * to lib/mock/staff.ts: edit a TypeScript file, ship a build, and a new email is
 * suddenly a Medical provider. That is not an access-control system, it is a
 * deploy. This table is where that decision belongs — a row, keyed to a stable
 * Entra object id, that `principal.mapToStaff` reads. Adding a prescriber becomes
 * an INSERT (auditable, reversible, no deploy); the `entraObjectId` column is the
 * durable join to the real identity, so a renamed email cannot silently re-point
 * authority.
 */
export const staff = pgTable(
  "staff",
  {
    id: text("id").primaryKey(),
    /** Stable Entra object id — the identity join that survives an email change. */
    entraObjectId: text("entra_object_id"),
    email: text("email").notNull(),
    name: text("name").notNull(),
    /** The role that decides capabilities. NULL is not allowed — no default authority. */
    role: text("role").notNull(),
    /** Locations this staff member covers. */
    locationIds: jsonb("location_ids").notNull(),
    credentials: text("credentials"),
    canApprove: boolean("can_approve").default(false).notNull(),
    active: boolean("active").default(true).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    emailIdx: uniqueIndex("staff_email_idx").on(t.email),
    oidIdx: index("staff_oid_idx").on(t.entraObjectId),
  }),
);

export const memberPrefs = pgTable("member_prefs", {
  clientId: text("client_id").primaryKey(), // seeded ref -> client
  gamificationEnabled: boolean("gamification_enabled").default(true).notNull(),
  leaderboardOptIn: boolean("leaderboard_opt_in").default(false).notNull(),
  communityOptIn: boolean("community_opt_in").default(false).notNull(),
  /** Channel preferences; the consent chain in lib/comms/send.ts already reads this shape. */
  notificationPrefs: jsonb("notification_prefs"),
  quietHoursStart: integer("quiet_hours_start").default(21),
  quietHoursEnd: integer("quiet_hours_end").default(8),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
