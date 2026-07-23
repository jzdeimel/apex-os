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
/* Cutover identity, locations and migration provenance                        */
/* ========================================================================== */

/**
 * One controlled V1 -> Apex migration execution.
 *
 * Only counts and digests belong here. The migration runner never writes raw
 * source rows or PHI into logs; the clinical tables remain the sole data copy.
 */
export const migrationRun = pgTable(
  "migration_run",
  {
    id: text("id").primaryKey(),
    sourceSystem: text("source_system").notNull(),
    mode: text("mode").notNull(), // baseline | delta | rehearsal
    status: text("status").notNull().default("running"),
    sourceWatermark: timestamp("source_watermark", { withTimezone: true }),
    nextWatermark: timestamp("next_watermark", { withTimezone: true }),
    counts: jsonb("counts"),
    checksum: text("checksum"),
    initiatedBy: text("initiated_by").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorCode: text("error_code"),
  },
  (t) => ({ sourceIdx: index("migration_run_source_idx").on(t.sourceSystem, t.startedAt) }),
);

/** Stable source-to-target identity and row checksum for idempotent deltas. */
export const importBinding = pgTable(
  "import_binding",
  {
    id: text("id").primaryKey(),
    sourceSystem: text("source_system").notNull(),
    entityType: text("entity_type").notNull(),
    sourceId: text("source_id").notNull(),
    targetId: text("target_id").notNull(),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    checksum: text("checksum").notNull(),
    firstRunId: text("first_run_id").notNull(),
    lastRunId: text("last_run_id").notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sourceIdx: uniqueIndex("import_binding_source_idx").on(t.sourceSystem, t.entityType, t.sourceId),
    targetIdx: uniqueIndex("import_binding_target_idx").on(t.entityType, t.targetId),
  }),
);

/** Physical clinic or corporate site. Virtual delivery is an appointment modality. */
export const clinicLocation = pgTable(
  "clinic_location",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    address1: text("address1"),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),
    timezone: text("timezone").notNull().default("America/New_York"),
    active: boolean("active").notNull().default(true),
    /** LPN draws are disabled until clinic/state policy explicitly approves them. */
    lpnLabDrawApproved: boolean("lpn_lab_draw_approved").notNull().default(false),
    /** Clover merchant id is not a secret; API secrets remain in Key Vault. */
    merchantAccountId: text("merchant_account_id"),
    sourceSystem: text("source_system"),
    sourceId: text("source_id"),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    codeIdx: uniqueIndex("clinic_location_code_idx").on(t.code),
    sourceIdx: uniqueIndex("clinic_location_source_idx").on(t.sourceSystem, t.sourceId),
  }),
);

/**
 * Authoritative Master Patient Index for Apex.
 *
 * This replaces the seeded `lib/mock/clients.ts` corpus one read surface at a
 * time. `homeLocationId` owns the relationship and billing; modality belongs
 * to an appointment, so a Raleigh member on a video visit stays Raleigh.
 */
export const client = pgTable(
  "client",
  {
    id: text("id").primaryKey(),
    mrn: text("mrn").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    preferredName: text("preferred_name"),
    dateOfBirth: text("date_of_birth"),
    sex: text("sex"),
    email: text("email"),
    phone: text("phone"),
    address1: text("address1"),
    address2: text("address2"),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),
    status: text("status").notNull().default("active"),
    isProspect: boolean("is_prospect").notNull().default(false),
    /** Synthetic accounts never enter clinical, revenue or capacity rollups. */
    synthetic: boolean("synthetic").notNull().default(false),
    homeLocationId: text("home_location_id").references(() => clinicLocation.id),
    assignedCoachId: text("assigned_coach_id"),
    assignedProviderId: text("assigned_provider_id"),
    sourceSystem: text("source_system"),
    sourceId: text("source_id"),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    mrnIdx: uniqueIndex("client_mrn_idx").on(t.mrn),
    sourceIdx: uniqueIndex("client_source_idx").on(t.sourceSystem, t.sourceId),
    nameIdx: index("client_name_idx").on(t.lastName, t.firstName),
    locationIdx: index("client_location_idx").on(t.homeLocationId, t.status),
  }),
);

/** Patient login identity is deliberately separate from the clinical person. */
export const patientIdentity = pgTable(
  "patient_identity",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull().references(() => client.id),
    emailNormalized: text("email_normalized").notNull(),
    status: text("status").notNull().default("active"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    emailClientIdx: uniqueIndex("patient_identity_email_client_idx").on(t.emailNormalized, t.clientId),
    clientIdx: uniqueIndex("patient_identity_client_idx").on(t.clientId),
  }),
);

/** Hash-only, expiring, single-use magic link. Raw tokens are never stored. */
export const patientMagicLink = pgTable(
  "patient_magic_link",
  {
    id: text("id").primaryKey(),
    identityId: text("identity_id").notNull().references(() => patientIdentity.id),
    tokenSha256: text("token_sha256").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    issuedBy: text("issued_by").notNull(),
  },
  (t) => ({
    tokenIdx: uniqueIndex("patient_magic_link_token_idx").on(t.tokenSha256),
    identityIdx: index("patient_magic_link_identity_idx").on(t.identityId, t.expiresAt),
  }),
);

/** Opaque patient session. The browser receives the raw token; Postgres does not. */
export const patientSession = pgTable(
  "patient_session",
  {
    id: text("id").primaryKey(),
    identityId: text("identity_id").notNull().references(() => patientIdentity.id),
    tokenSha256: text("token_sha256").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    userAgentSha256: text("user_agent_sha256"),
  },
  (t) => ({
    tokenIdx: uniqueIndex("patient_session_token_idx").on(t.tokenSha256),
    identityIdx: index("patient_session_identity_idx").on(t.identityId, t.expiresAt),
  }),
);

/** Explicit dual-identity mapping for a staff member participating as a patient. */
export const staffPatientLink = pgTable(
  "staff_patient_link",
  {
    staffId: text("staff_id").notNull(),
    clientId: text("client_id").notNull().references(() => client.id),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.staffId, t.clientId] }),
    clientIdx: uniqueIndex("staff_patient_link_client_idx").on(t.clientId),
  }),
);

/**
 * Exact retained record covered by an electronic signature.
 *
 * The text and evidence tuple are immutable after INSERT. A later PDF or email
 * copy is an artifact/delivery event below; it never rewrites what was signed.
 */
export const signedDocument = pgTable(
  "signed_document",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").references(() => client.id),
    kind: text("kind").notNull(),
    documentId: text("document_id").notNull(),
    version: text("version").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    regime: text("regime").notNull(),
    documentSha256: text("document_sha256").notNull(),
    signatureName: text("signature_name").notNull(),
    signedByRole: text("signed_by_role").notNull(),
    signedByAccountId: text("signed_by_account_id"),
    signedAt: timestamp("signed_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address").notNull(),
    userAgent: text("user_agent").notNull(),
    electronicConsentGiven: boolean("electronic_consent_given").notNull(),
    attestedRead: boolean("attested_read").notNull(),
    ledgerId: text("ledger_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    clientIdx: index("signed_document_client_idx").on(t.clientId, t.signedAt),
    documentIdx: index("signed_document_definition_idx").on(t.documentId, t.version),
    hashIdx: index("signed_document_hash_idx").on(t.documentSha256),
  }),
);

/** Append-only retained render or delivery receipt for a signed document. */
export const signedDocumentArtifact = pgTable(
  "signed_document_artifact",
  {
    id: text("id").primaryKey(),
    signedDocumentId: text("signed_document_id").notNull().references(() => signedDocument.id),
    kind: text("kind").notNull(), // archived-pdf | patient-copy
    storageProvider: text("storage_provider").notNull(),
    objectKey: text("object_key").notNull(),
    mediaType: text("media_type").notNull().default("application/pdf"),
    artifactSha256: text("artifact_sha256").notNull(),
    deliveredTo: text("delivered_to"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    documentIdx: index("signed_document_artifact_document_idx").on(t.signedDocumentId, t.createdAt),
    objectIdx: uniqueIndex("signed_document_artifact_object_idx").on(t.storageProvider, t.objectKey),
  }),
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
    clientId: text("client_id").notNull(), // authoritative client after cutover
    /** V1 legitimately permits an unassigned appointment. Preserve that fact. */
    staffId: text("staff_id"),
    /** V1 also permits a booking whose clinic has not yet been resolved. */
    locationId: text("location_id"),
    visitType: text("visit_type").notNull(),
    /** Atomic composite booking identifier; null for ordinary appointments. */
    bookingGroupId: text("booking_group_id"),
    /** NCV component within a composite booking. */
    component: text("component"),
    modality: text("modality").notNull().default("in-person"),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),

    status: text("status").notNull().default("Scheduled"),
    arrivedAt: timestamp("arrived_at", { withTimezone: true }),
    roomedAt: timestamp("roomed_at", { withTimezone: true }),
    room: text("room"),
    reason: text("reason"),
    notes: text("notes"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    /** Distinguishes a cancellation from a no-show — they release capacity differently. */
    cancelledBy: text("cancelled_by"),
    cancelReason: text("cancel_reason"),

    /** Telehealth visits occur where the PATIENT sits. Drives licensure. */
    patientState: text("patient_state"),
    bookedBy: text("booked_by"),
    bookedAt: timestamp("booked_at", { withTimezone: true }).defaultNow().notNull(),
    sourceSystem: text("source_system"),
    sourceId: text("source_id"),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    ledgerId: text("ledger_id"),
  },
  (t) => ({
    dayIdx: index("appt_day_idx").on(t.locationId, t.startAt),
    clientIdx: index("appt_client_idx").on(t.clientId, t.startAt),
    staffIdx: index("appt_staff_idx").on(t.staffId, t.startAt),
    groupIdx: index("appt_booking_group_idx").on(t.bookingGroupId, t.startAt),
    sourceIdx: uniqueIndex("appt_source_idx").on(t.sourceSystem, t.sourceId),
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
    /**
     * Nullable because consent is signed at INTAKE — before the person is a
     * client. A pre-client signer is identified by leadId instead; exactly one
     * of the two is set. Making this notNull was the reason intake consents had
     * nowhere to go and were rendered-but-never-stored.
     */
    clientId: text("client_id"), // seeded ref -> client
    leadId: text("lead_id").references(() => lead.id),
    /** "treatment" | "telehealth" | "financial" | "clinical-comms" | "marketing" | "hipaaNotice" */
    scope: text("scope").notNull(),
    /** The exact document version agreed to, e.g. "telehealth-v2". */
    documentVersion: text("document_version").notNull(),
    /**
     * SHA-256 of the exact wording shown. A version string alone cannot prove
     * WHAT was agreed to if the document behind that version is ever edited;
     * the hash can.
     */
    textSha256: text("text_sha256"),
    granted: boolean("granted").notNull(),
    /** Typed name as the signature. Kept verbatim. */
    signatureName: text("signature_name"),
    signedByRole: text("signed_by_role"),
    electronicConsentGiven: boolean("electronic_consent_given"),
    attestedRead: boolean("attested_read"),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    /** Evidence tuple for an e-signature to mean anything. */
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ledgerId: text("ledger_id"),
  },
  (t) => ({
    clientScopeIdx: index("consent_client_scope_idx").on(t.clientId, t.scope),
    leadIdx: index("consent_lead_idx").on(t.leadId),
  }),
);

/**
 * An intake invitation — the token a prospect follows from /book to /intake.
 *
 * ONLY THE HASH IS STORED. The raw token is returned to the caller once and
 * never persisted or logged: a token in a database (or a request log) is a
 * credential sitting in plaintext, and this one opens a form that collects
 * medical history. Lookup hashes the presented token and matches on that.
 *
 * Single use is enforced at the DATABASE, not in application logic — see
 * repo.submitIntake, which claims the invite with a conditional UPDATE ...
 * WHERE used_at IS NULL RETURNING inside the submission transaction. A
 * read-then-write check would let two concurrent submits both pass.
 */
export const intakeInvite = pgTable(
  "intake_invite",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id").notNull().references(() => lead.id),
    tokenSha256: text("token_sha256").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    mode: text("mode").notNull().default("self-serve"),
    capturedBy: text("captured_by"),
    /** Known-at-capture fields the wizard pre-fills (name, email, phone, track). */
    prefill: jsonb("prefill"),
  },
  (t) => ({
    tokenIdx: uniqueIndex("intake_invite_token_idx").on(t.tokenSha256),
    leadIdx: index("intake_invite_lead_idx").on(t.leadId),
  }),
);

/**
 * An emergency card grant — the QR a paramedic scans.
 *
 * WHY THIS TABLE EXISTS. The card token was derived as
 * `seededRandom("emergency-card:" + clientId)`, and client ids are sequential
 * (c-001, c-002 …). Anyone who worked that out could generate EVERY member's
 * card token and read name, MRN, medications, allergies, risk flags and care
 * team — a public bulk PHI disclosure from a predictable string. The page is
 * currently behind staff auth, which is the only reason it is not live; the
 * design intends it to be public, so the derivation had to go before it ever is.
 *
 * Only the SHA-256 is stored, like intake_invite: a bearer token at rest in a
 * table is a plaintext credential. Grants expire and can be revoked, because an
 * emergency card that cannot be turned off after a lost wallet is a permanent
 * disclosure.
 */
export const emergencyCard = pgTable(
  "emergency_card",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull(), // seeded ref -> client
    tokenSha256: text("token_sha256").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    /** Cards expire. A stale card is a stale medication list. */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** Set when the member or clinic turns the card off. */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: text("revoked_by"),
    /** Who issued it, for the accounting of disclosures. */
    issuedBy: text("issued_by"),
  },
  (t) => ({
    tokenIdx: uniqueIndex("emergency_card_token_idx").on(t.tokenSha256),
    clientIdx: index("emergency_card_client_idx").on(t.clientId),
  }),
);

/**
 * A submitted intake. Answers land as jsonb rather than being exploded into the
 * allergy/medication/problem tables, because those are keyed to a client and
 * this person is still a lead — promoting them is a conversion-time step, and
 * losing the submission in the meantime is not acceptable.
 */
export const intakeSubmission = pgTable(
  "intake_submission",
  {
    id: text("id").primaryKey(),
    inviteId: text("invite_id").notNull().references(() => intakeInvite.id),
    leadId: text("lead_id").notNull().references(() => lead.id),
    dateOfBirth: text("date_of_birth"),
    sex: text("sex"),
    goals: jsonb("goals"),
    symptoms: jsonb("symptoms"),
    history: jsonb("history"),
    /**
     * Answers keyed by question id, against `formVersion`.
     *
     * Supersedes the free-shaped `history` blob, which recorded WHAT was
     * answered but never WHICH QUESTIONS WERE ASKED. Both columns exist during
     * the wizard migration; `history` is legacy and read-only for new writes.
     */
    answers: jsonb("answers"),
    /**
     * The published form version this submission answered, and a hash of the
     * questions in it.
     *
     * Same argument as `consent.documentVersion` + `consent.textSha256` one
     * table up: a version string proves nothing if the document behind it can
     * be edited, and for a medical history "what were they actually asked in
     * July" is the entire evidentiary value. Paul Kennard's de-duplicated
     * male/female forms will land as v2 — without this, every earlier
     * submission would be silently reinterpreted against the new questions.
     */
    formVersion: text("form_version"),
    formSha256: text("form_sha256"),
    /**
     * How the intake was taken. "coach-guided" is the decided default
     * (2026-07-21): a coach sits with the patient because "the quality of the
     * intake process will be better if it is guided by the coach". The link
     * path remains for the patient who books a lab draw directly.
     */
    mode: text("mode"),
    /** The staff member who ran a coach-guided intake. Null for self-serve. */
    capturedBy: text("captured_by"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    ledgerId: text("ledger_id"),
  },
  (t) => ({
    leadIdx: index("intake_submission_lead_idx").on(t.leadId),
    inviteIdx: uniqueIndex("intake_submission_invite_idx").on(t.inviteId),
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
/** Durable membership contract and recurring-billing cadence. */
export const membership = pgTable(
  "membership",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull(),
    planCode: text("plan_code").notNull(),
    planName: text("plan_name").notNull(),
    status: text("status").notNull().default("active"),
    monthlyRateCents: integer("monthly_rate_cents").notNull(),
    startedOn: text("started_on").notNull(),
    currentPeriodStart: text("current_period_start"),
    currentPeriodEnd: text("current_period_end"),
    nextBillOn: text("next_bill_on"),
    homeLocationId: text("home_location_id").notNull(),
    merchantAccountId: text("merchant_account_id").notNull(),
    paymentMethodId: text("payment_method_id"),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    pauseReason: text("pause_reason"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    sourceSystem: text("source_system"),
    sourceId: text("source_id"),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    ledgerId: text("ledger_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    clientIdx: index("membership_client_idx").on(t.clientId, t.status),
    currentIdx: uniqueIndex("membership_current_idx")
      .on(t.clientId)
      .where(sql`status IN ('active','paused','past_due')`),
    sourceIdx: uniqueIndex("membership_source_idx").on(t.sourceSystem, t.sourceId),
  }),
);

export const paymentMethod = pgTable(
  "payment_method",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull(), // seeded ref -> client
    processor: text("processor").notNull(),
    /** Vault tokens are scoped to the merchant account that created them. */
    merchantAccountId: text("merchant_account_id"),
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
    membershipId: text("membership_id").references(() => membership.id),
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
    merchantAccountId: text("merchant_account_id"),
    idempotencyKey: text("idempotency_key"),
    processorRef: text("processor_ref"),
    originalPaymentAttemptId: text("original_payment_attempt_id"),
    amountCents: integer("amount_cents").notNull(),
    /** "succeeded" | "failed" | "pending" | "refunded" */
    status: text("status").notNull(),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull(),
    /** Which dunning attempt this was. 0 = original charge. */
    dunningAttempt: integer("dunning_attempt").default(0).notNull(),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    ledgerId: text("ledger_id"),
  },
  (t) => ({
    invoiceIdx: index("payment_invoice_idx").on(t.invoiceId),
    failedIdx: index("payment_failed_idx").on(t.status, t.attemptedAt),
    idempotencyIdx: uniqueIndex("payment_idempotency_idx").on(t.idempotencyKey),
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
    department: text("department"),
    title: text("title"),
    /** The role that decides capabilities. NULL is not allowed — no default authority. */
    role: text("role").notNull(),
    /**
     * Job-specific authorization profile. Clinical credential and job access
     * are deliberately separate: an RN and an NP may both have role Medical,
     * while only the NP profile may prescribe. `unassigned` fails closed.
     */
    accessProfile: text("access_profile").notNull().default("unassigned"),
    /** Locations this staff member covers. */
    locationIds: jsonb("location_ids").notNull(),
    credentials: text("credentials"),
    canApprove: boolean("can_approve").default(false).notNull(),
    /** Corporate, gym, and unresolved roster rows cannot enter the scheduler. */
    excludeFromScheduling: boolean("exclude_from_scheduling").default(false).notNull(),
    active: boolean("active").default(true).notNull(),
    sourceSystem: text("source_system"),
    sourceId: text("source_id"),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    emailIdx: uniqueIndex("staff_email_idx").on(t.email),
    /**
     * UNIQUE, not just indexed. A non-unique index allowed two staff rows to
     * claim the same Entra object id, and `staffByObjectId` takes the first
     * row it happens to get back — so which identity (and which role) a sign-in
     * resolved to would depend on plan order. Authority must not be a race.
     * Partial, because most rows have no objectId yet and NULLs must not
     * collide.
     */
    oidIdx: uniqueIndex("staff_oid_idx")
      .on(t.entraObjectId)
      .where(sql`entra_object_id IS NOT NULL`),
    sourceIdx: uniqueIndex("staff_source_idx").on(t.sourceSystem, t.sourceId),
  }),
);

/** Recurring local working hours. Calendar events only subtract from these. */
export const staffAvailabilityRule = pgTable(
  "staff_availability_rule",
  {
    id: text("id").primaryKey(),
    staffId: text("staff_id").notNull(),
    locationId: text("location_id").notNull(),
    weekday: integer("weekday").notNull(), // 0 Sunday through 6 Saturday
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
    timezone: text("timezone").notNull(),
    effectiveFrom: text("effective_from").notNull(),
    effectiveUntil: text("effective_until"),
    source: text("source").notNull().default("manual"),
    active: boolean("active").notNull().default(true),
    updatedBy: text("updated_by").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    staffDayIdx: index("staff_availability_rule_day_idx").on(t.staffId, t.weekday, t.effectiveFrom),
    locationDayIdx: index("staff_availability_rule_location_idx").on(t.locationId, t.weekday),
  }),
);

/** Calendar link metadata. OAuth credentials live only in Key Vault. */
export const externalCalendar = pgTable(
  "external_calendar",
  {
    id: text("id").primaryKey(),
    staffId: text("staff_id").notNull(),
    provider: text("provider").notNull(), // google | microsoft
    externalCalendarId: text("external_calendar_id").notNull(),
    credentialSecretName: text("credential_secret_name").notNull(),
    status: text("status").notNull().default("pending"),
    syncCursor: text("sync_cursor"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    staffProviderIdx: uniqueIndex("external_calendar_staff_provider_idx").on(t.staffId, t.provider),
  }),
);

/** Busy time only: no event title, attendee, description, or outside PHI. */
export const calendarBusyBlock = pgTable(
  "calendar_busy_block",
  {
    id: text("id").primaryKey(),
    calendarId: text("calendar_id").notNull().references(() => externalCalendar.id),
    externalEventId: text("external_event_id").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("busy"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    eventIdx: uniqueIndex("calendar_busy_block_event_idx").on(t.calendarId, t.externalEventId),
    windowIdx: index("calendar_busy_block_window_idx").on(t.calendarId, t.startAt, t.endAt),
  }),
);

/* ========================================================================== */
/* Encounters — the visit as a thing with parts                                */
/* ========================================================================== */

/**
 * An encounter: one visit, made of segments that different people complete.
 *
 * WHY `appointment` WAS NOT ENOUGH
 * --------------------------------
 * `appointment` has ONE `status` and ONE `completedAt`, which models a visit as
 * a thing one person does. Matt Chilson described the real shape on 2026-07-21:
 *
 *   "The nurse would go and see the name there, she'd open that up... the only
 *    thing she has to really leave is the vitals, blood pressure, resting heart
 *    rate, any notes she needs. She will then save it. That is part one of that
 *    appointment. Our doctor will come in, he will do the history and physical,
 *    and then he will complete part two, which then completes that entire
 *    appointment."
 *
 * Stephanie Butler's NCV spec adds a third part in front of both — the coach
 * introduction — and gives each part its own credential requirement.
 *
 * So a visit is a parent with ordered segments, each with its own performer,
 * its own clock and its own completion. THE PARENT COMPLETES WHEN ITS SEGMENTS
 * DO, never independently. A single status could not express "bloods drawn,
 * waiting on the provider", which is the state most of these visits are in for
 * most of the day — and a front desk that cannot see that state ends up asking
 * the patient.
 *
 * NOT A REPLACEMENT FOR `appointment`. The appointment is the CALENDAR fact:
 * when, where, who was booked. The encounter is the CLINICAL fact: what
 * actually happened and who did it. They diverge constantly — the booked
 * provider is out, the nurse ran late, the physical happened tomorrow — and
 * collapsing them loses whichever one you did not privilege.
 */
export const encounter = pgTable(
  "encounter",
  {
    id: text("id").primaryKey(),
    /** Null for a walk-in that was never booked. That is a real case. */
    appointmentId: text("appointment_id"),
    clientId: text("client_id").notNull(), // seeded ref -> client
    locationId: text("location_id").notNull(), // seeded ref -> location
    /** "new-client-visit" | "follow-up" | "lab-only" | "walk-in" */
    kind: text("kind").notNull(),
    /** How it was delivered. See lib/types.ts on why this is not the location. */
    modality: text("modality").notNull().default("in-person"),
    /** "open" | "complete" | "abandoned" */
    status: text("status").notNull().default("open"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    /**
     * Set ONLY by the transition that observes every required segment complete.
     * Nothing else may write it — a visit marked complete with an unsigned
     * physical is a billing assertion the record cannot support.
     */
    completedAt: timestamp("completed_at", { withTimezone: true }),
    abandonedAt: timestamp("abandoned_at", { withTimezone: true }),
    abandonedReason: text("abandoned_reason"),
    ledgerId: text("ledger_id"),
  },
  (t) => ({
    clientIdx: index("encounter_client_idx").on(t.clientId, t.startedAt),
    apptIdx: index("encounter_appt_idx").on(t.appointmentId),
    openIdx: index("encounter_open_idx").on(t.locationId, t.status),
  }),
);

/**
 * One part of a visit, with the credential that was required to do it.
 *
 * `requiredCredentials` is a SNAPSHOT of the tiers in force when the segment
 * was created, not a pointer to the current rule. Stephanie's matrix will
 * change — LPN scope differs by state and that question is still open — and
 * when it does, an old encounter must still say what was required of it AT THE
 * TIME. A pointer would silently rewrite the compliance story of every visit
 * already in the database.
 *
 * `performedByCredential` is likewise stored, not derived from the staff row.
 * A nurse who later qualifies as an NP did not perform last month's draw as an
 * NP, and `staff.credentials` is mutable.
 */
export const encounterSegment = pgTable(
  "encounter_segment",
  {
    id: text("id").primaryKey(),
    encounterId: text("encounter_id").notNull().references(() => encounter.id),
    /** "coach-intro" | "lab-draw" | "physical" */
    component: text("component").notNull(),
    /** Order within the visit. The spec's sequence is not negotiable. */
    sequence: integer("sequence").notNull(),
    /** Tiers in force when this segment was created. See docblock. */
    requiredCredentials: jsonb("required_credentials"),
    /** Who it was assigned to at scheduling time. May differ from who did it. */
    assignedStaffId: text("assigned_staff_id"),
    /** "pending" | "in-progress" | "complete" | "not-required" */
    status: text("status").notNull().default("pending"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    performedBy: text("performed_by"),
    /** The credential class held AT THE TIME. Not a join. */
    performedByCredential: text("performed_by_credential"),
    /**
     * Why a required segment was not required after all.
     *
     * A skipped clinical step needs a stated reason or it is indistinguishable
     * from a forgotten one, and "we never drew the bloods" versus "the patient
     * had labs from Monday" are different facts about the same visit.
     */
    waivedReason: text("waived_reason"),
    ledgerId: text("ledger_id"),
  },
  (t) => ({
    encounterIdx: index("segment_encounter_idx").on(t.encounterId, t.sequence),
    /** One row per component per encounter. A visit has one lab draw. */
    componentIdx: uniqueIndex("segment_component_idx").on(t.encounterId, t.component),
    queueIdx: index("segment_queue_idx").on(t.component, t.status),
  }),
);

/**
 * Vitals.
 *
 * THERE WAS NO VITALS MODEL ANYWHERE IN THIS REPO. `grep systolic` returned
 * nothing across 200+ modules, which means the nurse's entire contribution to a
 * New Client Visit — the thing that makes her segment a clinical record rather
 * than a timestamp — had nowhere to be written.
 *
 * BLOOD PRESSURE IS TWO INTEGERS, NOT A STRING. "120/80" as text cannot be
 * compared, trended, or range-checked, and the first person who needs "show me
 * everyone over 140 systolic" has to parse free text on a clinical field.
 *
 * UNITS ARE FIXED AND NAMED IN THE COLUMN. Not a `unit` column, not a
 * convention in a comment — a `weightKg` cannot hold pounds, and a mixed-unit
 * weight series is the kind of defect that survives for years because every
 * individual row looks plausible.
 */
export const vitals = pgTable(
  "vitals",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull(), // seeded ref -> client
    encounterId: text("encounter_id").references(() => encounter.id),
    segmentId: text("segment_id").references(() => encounterSegment.id),
    /** mmHg. Two integers, deliberately. */
    systolic: integer("systolic"),
    diastolic: integer("diastolic"),
    /** Beats per minute, at rest. */
    heartRate: integer("heart_rate"),
    respiratoryRate: integer("respiratory_rate"),
    /** Percent, 0-100. */
    spo2: integer("spo2"),
    temperatureC: real("temperature_c"),
    weightKg: real("weight_kg"),
    heightCm: real("height_cm"),
    /** The nurse's own words. Never rewritten by the system. */
    notes: text("notes"),
    takenBy: text("taken_by").notNull(),
    takenByCredential: text("taken_by_credential"),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull(),
    /**
     * Corrections are append-only, like every other clinical fact.
     *
     * A transposed blood pressure gets a NEW row pointing at the old one. The
     * append-only rule Paul Kennard set on 2026-07-21 — "we always append data,
     * we never replace data" — is not limited to allergies, and vitals are
     * exactly where the temptation to just fix the number is strongest.
     */
    supersedesId: text("supersedes_id"),
    correctionReason: text("correction_reason"),
    ledgerId: text("ledger_id"),
  },
  (t) => ({
    clientIdx: index("vitals_client_idx").on(t.clientId, t.takenAt),
    encounterIdx: index("vitals_encounter_idx").on(t.encounterId),
  }),
);

/**
 * The History & Physical — the provider's part of the visit.
 *
 * SIGNING MAKES IT IMMUTABLE, and that is enforced by there being no update
 * path: `signHistoryPhysical` is the only writer of `signedAt`, and a signed
 * row is corrected with an addendum row, never edited. `consultAddendum` above
 * establishes the same pattern for consults.
 *
 * ── THE CONTINUITY RULE ────────────────────────────────────────────────────
 * Matt Chilson, 2026-07-21: "the H&P has to match the same guy who did the plan
 * of care. So essentially in Myrtle Beach, Bal handles all the telehealth and
 * local Myrtle Beach clients — he does the H&P for them, he'll also do the plan
 * of care for them."
 *
 * `providerId` is the anchor for that rule. It is deliberately NOT enforced in
 * this schema, because Stephanie Butler's scheduling spec says the opposite —
 * assign whichever NP/PA is available — and the two requirements have not been
 * reconciled (docs/AUG7_CUTOVER.md §6). Encoding either one silently would
 * decide it. What this table does is make the question ANSWERABLE: whoever
 * signs the plan of care can be checked against whoever signed this.
 */
export const historyPhysical = pgTable(
  "history_physical",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull(), // seeded ref -> client
    encounterId: text("encounter_id").references(() => encounter.id),
    segmentId: text("segment_id").references(() => encounterSegment.id),
    providerId: text("provider_id").notNull(),
    /** Credential held at signing. Not a join — see encounterSegment. */
    providerCredential: text("provider_credential"),
    chiefComplaint: text("chief_complaint"),
    /** Narrative history. The provider's words. */
    historyNarrative: text("history_narrative"),
    examNarrative: text("exam_narrative"),
    assessment: text("assessment"),
    /**
     * Which labs are indicated — NOT results.
     *
     * The sequencing matters and is easy to get backwards. Stephanie's spec
     * lists "review of laboratory indications" inside the physical, but Matt's
     * flow has results coming back AFTER the visit, with an admin entering them
     * and the plan of care following. So this field is what was ORDERED and
     * why. Results live in the lab record and the plan of care reads both.
     */
    labIndications: text("lab_indications"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    /** The attestation text as shown to the signer, verbatim. */
    attestation: text("attestation"),
    ledgerId: text("ledger_id"),
  },
  (t) => ({
    clientIdx: index("hp_client_idx").on(t.clientId, t.startedAt),
    encounterIdx: uniqueIndex("hp_encounter_idx").on(t.encounterId),
    providerIdx: index("hp_provider_idx").on(t.providerId),
  }),
);

/* ========================================================================== */
/* Laboratory order-to-review chain                                           */
/* ========================================================================== */

/** Provider-authored order. Status changes are witnessed in the ledger. */
export const labOrder = pgTable(
  "lab_order",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull(),
    encounterId: text("encounter_id").references(() => encounter.id),
    appointmentId: text("appointment_id"),
    locationId: text("location_id").notNull(),
    panelCode: text("panel_code").notNull(),
    panelName: text("panel_name").notNull(),
    vendor: text("vendor"),
    priority: text("priority").notNull().default("routine"),
    fastingRequired: boolean("fasting_required").notNull().default(false),
    indications: text("indications").notNull(),
    instructions: text("instructions"),
    status: text("status").notNull().default("ordered"),
    orderedBy: text("ordered_by").notNull(),
    orderedAt: timestamp("ordered_at", { withTimezone: true }).defaultNow().notNull(),
    cancelledBy: text("cancelled_by"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    sourceSystem: text("source_system"),
    sourceId: text("source_id"),
    ledgerId: text("ledger_id").notNull(),
  },
  (t) => ({
    clientIdx: index("lab_order_client_idx").on(t.clientId, t.orderedAt),
    worklistIdx: index("lab_order_worklist_idx").on(t.locationId, t.status, t.orderedAt),
    sourceIdx: uniqueIndex("lab_order_source_idx").on(t.sourceSystem, t.sourceId),
  }),
);

/** Physical specimen custody. Accession is vendor-scoped and never reused. */
export const labSpecimen = pgTable(
  "lab_specimen",
  {
    id: text("id").primaryKey(),
    labOrderId: text("lab_order_id").notNull().references(() => labOrder.id),
    accession: text("accession").notNull(),
    vendor: text("vendor").notNull(),
    specimenType: text("specimen_type").notNull(),
    status: text("status").notNull().default("collected"),
    collectedBy: text("collected_by").notNull(),
    collectedAt: timestamp("collected_at", { withTimezone: true }).notNull(),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    ledgerId: text("ledger_id").notNull(),
  },
  (t) => ({
    orderIdx: index("lab_specimen_order_idx").on(t.labOrderId, t.collectedAt),
    accessionIdx: uniqueIndex("lab_specimen_accession_idx").on(t.vendor, t.accession),
  }),
);

/** One immutable version of a vendor result. Corrections append a new row. */
export const labResult = pgTable(
  "lab_result",
  {
    id: text("id").primaryKey(),
    labOrderId: text("lab_order_id").notNull().references(() => labOrder.id),
    clientId: text("client_id").notNull(),
    vendor: text("vendor").notNull(),
    externalResultId: text("external_result_id").notNull(),
    status: text("status").notNull().default("final"),
    resultedAt: timestamp("resulted_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    abnormal: boolean("abnormal").notNull().default(false),
    critical: boolean("critical").notNull().default(false),
    sourceHash: text("source_hash").notNull(),
    sourceArtifactId: text("source_artifact_id"),
    supersedesId: text("supersedes_id"),
    recordedBy: text("recorded_by").notNull(),
    ledgerId: text("ledger_id").notNull(),
  },
  (t) => ({
    clientIdx: index("lab_result_client_idx").on(t.clientId, t.resultedAt),
    orderIdx: index("lab_result_order_idx").on(t.labOrderId, t.receivedAt),
    externalIdx: uniqueIndex("lab_result_external_idx").on(t.vendor, t.externalResultId),
  }),
);

/** Atomic values exactly as received; interpretation belongs in a signed review. */
export const labObservation = pgTable(
  "lab_observation",
  {
    id: text("id").primaryKey(),
    labResultId: text("lab_result_id").notNull().references(() => labResult.id),
    codeSystem: text("code_system"),
    code: text("code"),
    name: text("name").notNull(),
    valueText: text("value_text"),
    valueNumeric: real("value_numeric"),
    unit: text("unit"),
    referenceRange: text("reference_range"),
    flag: text("flag").notNull().default("normal"),
    critical: boolean("critical").notNull().default(false),
    sourcePage: integer("source_page"),
    sourceRegion: jsonb("source_region"),
  },
  (t) => ({
    resultIdx: index("lab_observation_result_idx").on(t.labResultId, t.name),
  }),
);

/** Licensed review controls patient release; the imported result is never edited. */
export const labReview = pgTable(
  "lab_review",
  {
    id: text("id").primaryKey(),
    labResultId: text("lab_result_id").notNull().references(() => labResult.id),
    reviewerId: text("reviewer_id").notNull(),
    summary: text("summary").notNull(),
    criticalAcknowledged: boolean("critical_acknowledged").notNull().default(false),
    followUp: text("follow_up"),
    patientReleaseStatus: text("patient_release_status").notNull().default("held"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    ledgerId: text("ledger_id").notNull(),
  },
  (t) => ({
    resultIdx: uniqueIndex("lab_review_result_idx").on(t.labResultId),
    reviewerIdx: index("lab_review_reviewer_idx").on(t.reviewerId, t.reviewedAt),
  }),
);

/** A held reviewed result may be released later without rewriting the review. */
export const labResultRelease = pgTable(
  "lab_result_release",
  {
    id: text("id").primaryKey(),
    labResultId: text("lab_result_id").notNull().references(() => labResult.id),
    releasedBy: text("released_by").notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }).notNull(),
    reason: text("reason").notNull(),
    ledgerId: text("ledger_id").notNull(),
  },
  (t) => ({
    resultIdx: uniqueIndex("lab_result_release_result_idx").on(t.labResultId),
  }),
);

/** Critical-value acknowledgement is operationally visible until resolved. */
export const labCriticalAlert = pgTable(
  "lab_critical_alert",
  {
    id: text("id").primaryKey(),
    labResultId: text("lab_result_id").notNull().references(() => labResult.id),
    status: text("status").notNull().default("open"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    acknowledgedBy: text("acknowledged_by"),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    resolution: text("resolution"),
    ledgerId: text("ledger_id").notNull(),
  },
  (t) => ({
    resultIdx: uniqueIndex("lab_critical_result_idx").on(t.labResultId),
    statusIdx: index("lab_critical_status_idx").on(t.status, t.openedAt),
  }),
);

/* ========================================================================== */
/* Feature flags                                                               */
/* ========================================================================== */

/**
 * Feature flags — the owner console's kill switches.
 *
 * WHY A TABLE AND NOT A CONFIG FILE
 * ---------------------------------
 * The commitment made on the 2026-07-21 sync was "turn features on and off at
 * will from the owner console — you don't have to do anything in Azure." A
 * config file cannot honour that: changing it is a deploy, and a deploy is
 * exactly what the sentence promises not to require. Same argument the `staff`
 * table docblock makes about prescribing authority — a decision that needs a
 * commit is not administration, it is engineering.
 *
 * TARGET_ID IS NOT NULL, AND GLOBAL IS '*'
 * ----------------------------------------
 * The obvious design gives global rows a NULL target. Postgres does not collide
 * NULLs in a unique index, so that design permits two contradictory global rows
 * for the same key and resolution becomes plan order — the precise failure the
 * `staff_oid_idx` comment above exists to prevent. A sentinel makes the unique
 * index actually unique, so a second global row for a key is a constraint
 * violation instead of a coin flip.
 *
 * ROWS ARE OVERRIDES, NOT STATE
 * -----------------------------
 * The absence of a row is meaningful: it means "whatever the release preset
 * says". Turning a feature back to its default is a DELETE, not an UPDATE to
 * `true`, because a stored `true` pins the value against a future preset change
 * and nobody remembers a pin. lib/features/server.ts exposes both operations
 * and the owner console distinguishes them.
 *
 * EVERY CHANGE IS LEDGERED
 * ------------------------
 * `updatedBy` and `ledgerId` are not decoration. "Who turned off consent
 * capture, and when" is an audit question, and a flag that silently changes
 * what the clinic records is indistinguishable from a bug until someone can
 * answer it.
 */
export const featureFlag = pgTable(
  "feature_flag",
  {
    id: text("id").primaryKey(),
    /** A key from lib/features/catalog.ts. Unknown keys are ignored on read. */
    key: text("key").notNull(),
    /** "global" | "role" | "location" | "staff" | "client" */
    scope: text("scope").notNull(),
    /** '*' for global; the role name, location id, staff id or client id otherwise. */
    targetId: text("target_id").notNull().default("*"),
    enabled: boolean("enabled").notNull(),
    /** Free text from the owner. Why this was flipped, in their words. */
    reason: text("reason"),
    updatedBy: text("updated_by").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    ledgerId: text("ledger_id"),
  },
  (t) => ({
    /** One row per (key, scope, target). See the docblock — this must be unique. */
    scopeIdx: uniqueIndex("feature_flag_scope_idx").on(t.key, t.scope, t.targetId),
    keyIdx: index("feature_flag_key_idx").on(t.key),
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
