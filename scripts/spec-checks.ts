/**
 * SPEC CHECKS — the requirements from the 2026-07-21 sync, as executable rules.
 *
 * Every assertion here traces to something a person said in that meeting or
 * wrote in Stephanie Butler's New Client Visit specification. They are not unit
 * tests of implementation detail; they are the requirements themselves, in a
 * form that fails a build when someone quietly changes one.
 *
 * WHY NOT A TEST FRAMEWORK. The repo has no runner, and adding one meant a
 * dependency tree plus a second module resolver to keep in step with tsconfig.
 * Node 22 strips types natively; `scripts/alias-hooks.mjs` supplies the `@/`
 * alias in thirty lines. These run against the same source the app imports.
 *
 *   npm run spec
 */
import {
  evaluateFeatures,
  type FlagRow,
} from "@/lib/features/evaluate";
import {
  resolveNcvTeam,
  ncvCoverageGaps,
  NCV_COMPONENTS,
  type NcvCandidate,
} from "@/lib/scheduling/ncv";
import { parseCredential, type CredentialClass } from "@/lib/scheduling/credentials";
import { routeRequest, routeBasket } from "@/lib/orders/routing";
import {
  validateSubmission,
  mustKnowQuestions,
  CURRENT_FORM_VERSION,
  formSha256,
} from "@/lib/intake/formDefinition";
import {
  segmentPlanFor,
  completionVerdict,
  validateVitals,
  vitalsAcceptable,
  credentialSatisfies,
} from "@/lib/encounters/lifecycle";
import { buildTimeline, contradictions, everMentioned } from "@/lib/clinical/history";
import {
  documentSha256,
  validateSignature,
  signatureAcceptable,
  verifySignedRecord,
  type SignableDocument,
  type SignatureEvidence,
} from "@/lib/documents/signing";
import {
  canonicalJson,
  extractSummary,
  mapAppointment,
  mapPerson,
  sameDatabase,
  targetId,
} from "@/lib/migration/v1";
import {
  normalizePatientEmail,
  opaqueToken,
  patientSessionIsActive,
  patientSignInUrl,
  tokenSha256,
} from "@/lib/auth/patientTokens";
import { staffPatientPilotPolicy } from "@/lib/auth/pilotPolicy";
import { authoritativeMessageId, containsUrgentLanguage } from "@/lib/messaging/authoritative";
import { appointmentRequestId, appointmentTransitionAllowed } from "@/lib/scheduling/lifecycle";
import { parseGoogleServiceAccount } from "@/lib/calendar/google";
import { intakeEntryPath } from "@/lib/intake/mint";
import { freeWindows, rulesForDate, validateMinuteWindow } from "@/lib/scheduling/capacity";
import { CloverPaymentPort } from "@/lib/payments/clover";
import { DUNNING_LADDER } from "@/lib/payments/port";
import { staff } from "@/lib/mock/staff";
import {
  consultChannelForRole,
  consultKindForRole,
  defaultConsultChannel,
  defaultConsultKind,
  isConsultChannelAllowedForRole,
  isConsultKindAllowedForRole,
  normalizeConsultChannel,
  normalizeConsultKind,
} from "@/lib/consult/metadata";

let failures = 0;
let checks = 0;
let group = "";

function section(name: string) {
  group = name;
  console.log(`\n── ${name} ${"─".repeat(Math.max(0, 62 - name.length))}`);
}

function eq(name: string, got: unknown, want: unknown) {
  checks++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}`);
    console.log(`         got  ${JSON.stringify(got)}`);
    console.log(`         want ${JSON.stringify(want)}`);
  }
}

/* ══ Feature flags ═══════════════════════════════════════════════════════════
   "From the owner console you'll be able to turn features on and off at will
    for coaches and clients." — Zack Deimel, 01:07:49                          */
section("Feature flags");

const P = "clinic-v1" as const;

eq(
  "community ships dark in the clinic release",
  evaluateFeatures([], {}, P).community,
  false,
);

const V2 = evaluateFeatures([], {}, "clinic-v2");
eq("community ships on in the V2 launch", V2.community, true);
eq("member education ships on in the V2 launch", V2["member-education"], true);
eq("member nutrition ships on in the V2 launch", V2["member-nutrition"], true);
eq("AI recommendations ship on in the V2 launch", V2["ai-recommendations"], true);
eq("automations ship on in the V2 launch", V2.automations, true);
eq(
  "direct provider messaging stays off in the V2 launch",
  V2["member-provider-thread"],
  false,
);
eq("emergency cards stay off in the V2 launch", V2["emergency-card"], false);
eq("self-booking stays off in the V2 launch", V2["self-booking"], false);
const owner = staff.find((member) => member.email === "zack@goalphahealth.com");
eq("the owner account maps to an Admin staff identity", owner?.role, "Admin");
eq(
  "the owner account can administer every clinic location",
  owner?.locationIds,
  ["raleigh", "raleigh-boutique", "southern-pines", "myrtle-beach", "telehealth"],
);
eq("a coach note defaults to a coach consult", defaultConsultKind("Coach"), "Coach consult");
eq("a medical note defaults to a documented clinical visit", defaultConsultKind("Medical"), "Medical visit");
eq("a medical visit defaults to in person", defaultConsultChannel("Medical"), "In person");
eq("a coach cannot author a medical chart review", isConsultKindAllowedForRole("Medical chart review", "Coach"), false);
eq("Medical cannot author a coach consult", isConsultKindAllowedForRole("Coach consult", "Medical"), false);
eq("Medical can document an in-person clinical visit", isConsultChannelAllowedForRole("In person", "Medical"), true);
eq("Medical cannot turn a clinical visit into a member message", isConsultChannelAllowedForRole("Messaging", "Medical"), false);
eq("a legacy Medical visit draft upgrades before signing", consultKindForRole("Provider visit", "Medical"), "Medical visit");
eq("a legacy Medical visit keeps its real channel", consultChannelForRole("In person", "Medical"), "In person");
eq("legacy coaching drafts remain readable", normalizeConsultKind("coaching"), "Coach consult");
eq("legacy medical drafts become internal reviews", normalizeConsultKind("medical"), "Medical chart review");
eq("legacy in-person drafts remain readable", normalizeConsultChannel("in-person"), "In person");

// The Aug 7 pilot shape: "we can put it into production and we can do a small
// pilot, maybe 10 patients" — Paul Kennard, 01:02:24.
const pilot: FlagRow[] = [
  { key: "member-portal", scope: "global", targetId: "*", enabled: false },
  { key: "member-portal", scope: "client", targetId: "c-001", enabled: true },
];
eq(
  "a pilot client beats the global off",
  evaluateFeatures(pilot, { clientId: "c-001" }, P)["member-portal"],
  true,
);
eq(
  "a non-pilot client stays off",
  evaluateFeatures(pilot, { clientId: "c-999" }, P)["member-portal"],
  false,
);

const ladder: FlagRow[] = [
  { key: "community", scope: "global", targetId: "*", enabled: true },
  { key: "community", scope: "role", targetId: "Coach", enabled: false },
  { key: "community", scope: "staff", targetId: "st-005", enabled: true },
];
eq("role beats global", evaluateFeatures(ladder, { role: "Coach" }, P).community, false);
eq(
  "the individual beats their role",
  evaluateFeatures(ladder, { role: "Coach", staffId: "st-005" }, P).community,
  true,
);

// A staff member covering three locations can match three rows that disagree.
// Plan order must not decide it.
eq(
  "same-scope conflicts resolve to the value that grants less",
  evaluateFeatures(
    [
      { key: "community", scope: "location", targetId: "raleigh", enabled: true },
      { key: "community", scope: "location", targetId: "myrtle-beach", enabled: false },
    ],
    { locationIds: ["raleigh", "myrtle-beach"] },
    P,
  ).community,
  false,
);

eq(
  "the member's direct-to-provider thread is off in the clinic release",
  evaluateFeatures([], {}, P)["member-provider-thread"],
  false,
);

/* ══ Credentials ═════════════════════════════════════════════════════════════ */
section("Credentials");

eq("bare 'Nurse' is unresolved, never guessed", parseCredential("Nurse"), null);
eq("'Nurse Practitioner' resolves", parseCredential("Nurse Practitioner"), "NP");
eq("'Physicians Assistant' resolves", parseCredential("Physicians Assistant"), "PA");
eq("'Telehealth Physician' resolves", parseCredential("Telehealth Physician"), "MD");

/* ══ New Client Visit ════════════════════════════════════════════════════════
   Stephanie Butler's specification: three components, credential priority, and
   "always utilize the lowest appropriate clinical license."                  */
section("New Client Visit");

eq(
  "three components, in the spec's order",
  NCV_COMPONENTS.map((c) => c.id),
  ["coach-intro", "lab-draw", "physical"],
);
eq("the coach introduction has no substitution", NCV_COMPONENTS[0].substitutable, false);

const DAY = [{ startMin: 8 * 60, endMin: 17 * 60 }];
const person = (id: string, name: string, credential: CredentialClass | null): NcvCandidate => ({
  staffId: id,
  name,
  credential,
  freeWindows: DAY,
});

// Myrtle Beach's real shape: coach, nurse, NP and a medical director.
const myrtleBeach = [
  person("coach", "Faith Overhultz", "Coach"),
  person("nurse", "Nathalie Callahan", "RN"),
  person("np", "Holly Marlowe", "NP"),
  person("md", "Belal Khokhar", "MD"),
];
const threeMember = resolveNcvTeam(myrtleBeach, 9 * 60);

if (!threeMember.ok) {
  failures++;
  console.log("  FAIL a fully staffed clinic could not resolve an NCV team");
} else {
  const draw = threeMember.assignments.find((a) => a.component === "lab-draw")!;
  const physical = threeMember.assignments.find((a) => a.component === "physical")!;
  eq("the nurse draws blood, not the medical director", draw.staffId, "nurse");
  eq("and does so from the preferred tier", draw.tier, 0);
  eq("the NP does the physical, not the physician", physical.staffId, "np");
  eq("three people, which the spec calls the preferred model", threeMember.teamSize, 3);
}

// "When no nurse is available, the NP/PA performs both clinical components,
//  resulting in two people total."
const twoMember = resolveNcvTeam(
  [person("coach", "Shane James", "Coach"), person("np", "Jayne Miller", "NP")],
  9 * 60,
);
if (!twoMember.ok) {
  failures++;
  console.log("  FAIL the two-team-member model could not resolve");
} else {
  const draw = twoMember.assignments.find((a) => a.component === "lab-draw")!;
  const physical = twoMember.assignments.find((a) => a.component === "physical")!;
  eq("the NP covers the draw when no nurse exists", draw.staffId, "np");
  eq("falling back to the second tier", draw.tier, 1);
  eq("two people total", twoMember.teamSize, 2);
  eq("and nobody is booked against themselves", physical.startMin >= draw.endMin, true);
}

const noCoach = resolveNcvTeam(
  [person("nurse", "Rebecca Truesdell", "RN"), person("np", "Morgan Gibson", "NP")],
  9 * 60,
);
eq("no coach means no new client visit at all", noCoach.ok, false);
if (!noCoach.ok) eq("and it says which part is blocking", noCoach.blockedOn, "coach-intro");

// The roster says "Nurse" without distinguishing RN from LPN. Unknown is not
// schedulable — guessing would put an unlicensed person in a clinical step.
const unknown = resolveNcvTeam(
  [person("coach", "Zac Duffy", "Coach"), person("?", "Unconfirmed", null)],
  9 * 60,
);
eq("an unconfirmed credential cannot draw blood", unknown.ok, false);

eq(
  "Raleigh's shape (coach, nurse, NP, no physician) can still run an NCV",
  ncvCoverageGaps(["Coach", "RN", "NP"]).length,
  0,
);
eq(
  "a clinic with no coach cannot, and the gap names the component",
  ncvCoverageGaps(["RN", "NP", "MD"]).map((g) => g.component),
  ["coach-intro"],
);

/* ══ Encounters ══════════════════════════════════════════════════════════════
   "She will then save it. That is part one of that appointment. Our doctor will
    come in, he will do the history and physical, and then he will complete part
    two, which then completes that entire appointment." — Matt Chilson         */
section("Encounters");

eq(
  "a new client visit lays out all three parts up front",
  segmentPlanFor("new-client-visit").map((p) => p.component),
  ["coach-intro", "lab-draw", "physical"],
);
eq("a follow-up does not require a coach introduction", segmentPlanFor("follow-up").map((p) => p.component), ["physical"]);

const seg = (component: string, status: string) =>
  ({ component, status, required: true }) as never;

eq(
  "a visit with an unsigned physical is not complete",
  completionVerdict([seg("coach-intro", "complete"), seg("lab-draw", "complete"), seg("physical", "pending")]).complete,
  false,
);
eq(
  "and it names what it is waiting on",
  completionVerdict([seg("coach-intro", "complete"), seg("lab-draw", "complete"), seg("physical", "pending")]).outstanding,
  ["physical"],
);
eq(
  "all parts done completes the visit",
  completionVerdict([seg("coach-intro", "complete"), seg("lab-draw", "complete"), seg("physical", "complete")]).complete,
  true,
);
eq(
  "a part waived with a reason counts as settled",
  completionVerdict([seg("coach-intro", "complete"), seg("lab-draw", "not-required"), seg("physical", "complete")]).complete,
  true,
);

eq("normal vitals record cleanly", validateVitals({ systolic: 122, diastolic: 78, heartRate: 64 }), []);
eq(
  "a transposed blood pressure is refused",
  vitalsAcceptable(validateVitals({ systolic: 80, diastolic: 120 })),
  false,
);
// A real reading on a real patient. Refusing it teaches the nurse to round it
// down to something the form accepts, which is the worse outcome.
eq(
  "a hypertensive reading is recorded, not refused",
  vitalsAcceptable(validateVitals({ systolic: 210, diastolic: 105 })),
  true,
);
eq(
  "but it is flagged",
  validateVitals({ systolic: 210, diastolic: 105 }).some((p) => p.severity === "warning"),
  true,
);
eq("an impossible heart rate is refused", vitalsAcceptable(validateVitals({ heartRate: 900 })), false);

eq("a nurse may close a lab draw", credentialSatisfies("RN", [["RN", "LPN"], ["NP", "PA"]]), true);
eq("an office manager may not", credentialSatisfies("Admin", [["RN", "LPN"], ["NP", "PA"]]), false);
eq("an unknown credential may not", credentialSatisfies(null, [["RN", "LPN"], ["NP", "PA"]]), false);

/* ══ Order routing ═══════════════════════════════════════════════════════════
   "GHK doesn't require a doctor's intervention... PT-141 is not on the list of
    peptides that MedSource offers, therefore it must go to a doctor, it must
    have a prescription, and it must get sent to an actual pharmacy." — Paul   */
section("Order routing");

const item = (over: Record<string, unknown>) =>
  ({
    id: "x",
    name: "Item",
    kind: "compound",
    serviceLine: "Peptide Therapy",
    unitPriceCents: 1000,
    availableAt: [],
    active: true,
    version: 1,
    ...over,
  }) as never;

eq(
  "an item MedSource carries with no prescriber: the coach orders it",
  routeRequest(item({ sku: "GHK", fulfillment: "medsource", requiresProviderApproval: false })).route,
  "coach-orderable",
);
eq(
  "an item needing a prescriber: provider signature",
  routeRequest(item({ sku: "TRT", fulfillment: "medsource", requiresProviderApproval: true })).route,
  "provider-signature-required",
);
eq(
  "an item MedSource does not carry: an outside pharmacy",
  routeRequest(item({ sku: "PT141", fulfillment: "external-pharmacy", requiresProviderApproval: true })).route,
  "external-rx",
);

// "The proper answer is probably no. We run through this batch and then we're
//  done." — Paul Kennard on hCG, 00:57:36
const hcg = item({
  sku: "HRT-HCG-5000",
  fulfillment: "medsource",
  requiresProviderApproval: true,
  lifecycle: "sell-through",
  controlled: true,
});
eq("hCG still fills for patients already on it", routeRequest(hcg, { quantityOnHand: 4 }).route, "provider-signature-required");
eq("hCG blocks once the batch is gone", routeRequest(hcg, { quantityOnHand: 0 }).route, "blocked");
eq("unknown stock does not strand a patient", routeRequest(hcg, {}).route, "provider-signature-required");

const stateRuled = item({
  sku: "S",
  fulfillment: "medsource",
  requiresProviderApproval: false,
  restrictedStates: ["OH"],
});
eq("a restricted state blocks", routeRequest(stateRuled, { patientState: "OH" }).route, "blocked");
eq("a permitted state passes", routeRequest(stateRuled, { patientState: "NC" }).route, "coach-orderable");
// There is no later check — a placed order goes straight to fulfilment.
eq("an unknown patient state fails closed", routeRequest(stateRuled, {}).route, "blocked");

const basket = routeBasket([
  { item: item({ sku: "SYRINGE", fulfillment: "medsource", requiresProviderApproval: false }) },
  { item: item({ sku: "BPC", fulfillment: "medsource", requiresProviderApproval: true }) },
  { item: item({ sku: "PT141", fulfillment: "external-pharmacy", requiresProviderApproval: true }) },
]);
eq(
  "a mixed basket keeps the three paths apart",
  [basket.coachOrderable.length, basket.needsProvider.length, basket.externalRx.length],
  [1, 1, 1],
);

/* ══ Intake ══════════════════════════════════════════════════════════════════
   "There's five questions that are the overarching things we need to know:
    allergies, missing organs, surgical history, major diseases, and cancer —
    independently, and immediate family." — Paul Kennard, 00:26:46            */
section("Intake");

eq(
  "the five must-knows are all present",
  mustKnowQuestions(CURRENT_FORM_VERSION).map((q) => q.id),
  [
    "allergies",
    "missing-organs",
    "surgical-history",
    "major-diseases",
    "cancer-history",
    "family-cancer-history",
  ],
);

const complete = {
  allergies: "None known",
  "missing-organs": "Gallbladder, 2019",
  "surgical-history": [],
  "major-diseases": "None",
  "cancer-history": false,
  "family-cancer-history": "Father, colon, age 61",
  "prior-hormone-therapy": false,
  tobacco: false,
  "family-cardiac-history": "None",
};

eq("a complete submission validates", validateSubmission(CURRENT_FORM_VERSION, complete, "male"), []);

const { ["missing-organs"]: _omitted, ...missingOne } = complete;
eq(
  "a skipped must-know is refused",
  validateSubmission(CURRENT_FORM_VERSION, missingOne, "male").map((p) => p.questionId),
  ["missing-organs"],
);
eq(
  "a blank string is not an answer",
  validateSubmission(CURRENT_FORM_VERSION, { ...complete, allergies: "   " }, "male").map((p) => p.questionId),
  ["allergies"],
);
// "None" is information; never reaching the question is the failure.
eq(
  "an empty surgery list IS an answer",
  validateSubmission(CURRENT_FORM_VERSION, { ...complete, "surgical-history": [] }, "male"),
  [],
);
eq(
  "answering yes to cancer demands the detail",
  validateSubmission(CURRENT_FORM_VERSION, { ...complete, "cancer-history": true }, "male").map((p) => p.questionId),
  ["cancer-detail"],
);
eq(
  "a surgery row without its required procedure is refused",
  validateSubmission(
    CURRENT_FORM_VERSION,
    { ...complete, "surgical-history": [{ procedure: "", year: "2020" }] },
    "male",
  ).map((p) => p.questionId),
  ["surgical-history"],
);
eq("the form hash is a real digest", formSha256(CURRENT_FORM_VERSION).length, 64);

/* ══ Append-only history ═════════════════════════════════════════════════════
   "We never lose track of the fact that you told us on this date that you were,
    and then you told us on another date that you were not." — Paul Kennard    */
section("Append-only history");

const penicillin = [
  {
    id: "alg-1",
    kind: "allergy" as const,
    summary: "Penicillin — severe",
    recordedAt: "2026-01-14T10:00:00Z",
    recordedBy: "Holly Marlowe",
    endedAt: "2026-07-14T09:00:00Z",
  },
  {
    id: "alg-2",
    kind: "allergy" as const,
    summary: "Penicillin — patient denies allergy",
    recordedAt: "2026-07-14T09:00:00Z",
    recordedBy: "Belal Khokhar",
  },
];

const timeline = buildTimeline(penicillin);
eq("the timeline reads newest first", timeline.map((e) => e.fact.id), ["alg-2", "alg-1"]);
eq("the current statement is current", timeline[0].status, "current");
eq("the retracted one is retained, not deleted", timeline[1].status, "ended");
eq(
  "the contradiction is findable",
  contradictions(timeline).map((e) => e.fact.id),
  ["alg-1"],
);
eq(
  "and asking about the substance returns both sides",
  everMentioned(timeline, "penicillin").length,
  2,
);

/* ══ Signatures ══════════════════════════════════════════════════════════════
   "The document cannot be altered, and that signature has to be connected to
    that exact document." — Zack Deimel, 01:33:46                             */
section("Signatures");

const agreement: SignableDocument = {
  id: "doc-1",
  kind: "contract",
  documentId: "alpha-plan-agreement",
  version: "v1",
  title: "Alpha Plan Agreement",
  body: "The member agrees to the monthly plan described above.",
  regime: "Contract",
};

const goodEvidence: SignatureEvidence = {
  signatureName: "Paul Kennard",
  signedByRole: "patient",
  signedByAccountId: null,
  signedAt: "2026-08-07T14:00:00Z",
  ipAddress: "203.0.113.10",
  userAgent: "Mozilla/5.0",
  electronicConsentGiven: true,
  attestedRead: true,
};

eq("a complete signature is accepted", validateSignature(agreement, goodEvidence), []);
eq(
  "an unread document cannot be signed",
  validateSignature(agreement, { ...goodEvidence, attestedRead: false }).map((p) => p.field),
  ["attestedRead"],
);
eq(
  "E-SIGN consent is required separately from the document",
  validateSignature(agreement, { ...goodEvidence, electronicConsentGiven: false }).map((p) => p.field),
  ["electronicConsentGiven"],
);
eq(
  "evidence cannot be captured after the fact",
  signatureAcceptable(validateSignature(agreement, { ...goodEvidence, ipAddress: null })),
  false,
);
// The coach-guided intake risk: the coach runs the questions, the patient signs.
eq(
  "a patient signature inside a staff session is refused",
  validateSignature(agreement, { ...goodEvidence, signedByAccountId: "st-013" }).map((p) => p.field),
  ["signedByRole"],
);

const signed = {
  document: agreement,
  documentSha256: documentSha256(agreement),
  evidence: goodEvidence,
};
eq("a stored record verifies against its document", verifySignedRecord(signed).valid, true);
eq(
  "editing the document after signing is detected",
  verifySignedRecord({ ...signed, document: { ...agreement, body: "Different terms entirely." } }).valid,
  false,
);

/* ══ Result ══════════════════════════════════════════════════════════════════ */
/* Migration safety: repeatable identities, bounded reports, preserved nulls. */
section("V1 cutover migration");

eq("target ids are repeatable", targetId("person", "source-123"), targetId("person", "source-123"));
eq("target ids are entity-scoped", targetId("person", "source-123") === targetId("staff", "source-123"), false);
eq("target ids do not expose the source id", targetId("person", "source-123").includes("source-123"), false);
eq(
  "canonical hashing input ignores object insertion order",
  canonicalJson({ z: 1, a: { y: 2, b: 3 } }),
  canonicalJson({ a: { b: 3, y: 2 }, z: 1 }),
);

const v1Person = {
  id: "person-sensitive-id",
  mrn: "AH-NC-42",
  firstName: "Sample",
  lastName: "Patient",
  preferredName: null,
  dob: "1980-01-02T00:00:00.000Z",
  sex: "FEMALE",
  email: "Patient@Example.com",
  phone: "555-0100",
  address1: null,
  address2: null,
  city: "Raleigh",
  state: "NC",
  zip: "27601",
  status: "ACTIVE",
  isProspect: false,
  assignedCoachId: null,
  locationId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-07-22T00:00:00.000Z",
};
const mappedPerson = mapPerson(v1Person);
eq("patient email is normalized", mappedPerson.data.email, "patient@example.com");
eq("a missing home clinic stays null", mappedPerson.data.home_location_id, null);

const mappedAppointment = mapAppointment({
  id: "appointment-sensitive-id",
  personId: v1Person.id,
  providerId: null,
  locationId: null,
  type: "TELEHEALTH",
  status: "SCHEDULED",
  startAt: "2026-08-01T13:00:00.000Z",
  endAt: "2026-08-01T13:30:00.000Z",
  resource: null,
  reason: null,
  notes: null,
  createdAt: "2026-07-22T00:00:00.000Z",
  updatedAt: "2026-07-22T00:00:00.000Z",
});
eq("an unassigned V1 appointment stays unassigned", mappedAppointment.data.staff_id, null);
eq("telehealth is a modality, not a clinic", mappedAppointment.data.modality, "virtual");

const migrationSummary = extractSummary({
  locations: [],
  staff: [],
  people: [v1Person],
  appointments: [],
});
const publicReport = JSON.stringify({ counts: migrationSummary.counts, checksum: migrationSummary.checksum });
eq("the migration report contains no patient name", publicReport.includes("Sample"), false);
eq("the migration report contains no patient email", publicReport.includes("patient@example.com"), false);
eq(
  "database identity ignores password rotation",
  sameDatabase("postgres://user:old@db.example/apex", "postgres://user:new@db.example/apex"),
  true,
);
eq(
  "database identity also ignores different source/target usernames",
  sameDatabase("postgres://reader:pw@db.example/apex", "postgres://writer:pw@db.example/apex"),
  true,
);
eq(
  "database identity distinguishes source from target",
  sameDatabase("postgres://user:pw@db.example/alpha", "postgres://user:pw@db.example/apex"),
  false,
);

const patientToken = opaqueToken();
eq("patient tokens have at least 256 bits of material", Buffer.from(patientToken, "base64url").length, 32);
eq("only a digest is persisted for patient tokens", tokenSha256(patientToken).length, 64);
eq("patient emails normalize case and whitespace", normalizePatientEmail(" Patient@Example.COM "), "patient@example.com");
const signInUrl = new URL(patientSignInUrl("https://apex.example", patientToken));
eq("magic-link credentials are never in the server-visible query", signInUrl.search, "");
eq("magic-link credentials are carried in the browser-only fragment", signInUrl.hash.startsWith("#token="), true);
const intakePath = intakeEntryPath(patientToken);
eq("intake credentials are not in the request path", intakePath.split("#")[0], "/intake");
eq("intake credentials are carried in the browser-only fragment", intakePath.includes("#token="), true);

const sessionNow = new Date("2026-07-22T16:00:00.000Z");
eq(
  "an active patient session refreshes inside the idle window",
  patientSessionIsActive(
    new Date("2026-07-22T15:45:01.000Z"),
    new Date("2026-07-23T00:00:00.000Z"),
    sessionNow,
  ),
  true,
);
eq(
  "a patient session expires after 15 minutes idle",
  patientSessionIsActive(
    new Date("2026-07-22T15:45:00.000Z"),
    new Date("2026-07-23T00:00:00.000Z"),
    sessionNow,
  ),
  false,
);
eq(
  "the absolute session cap wins even when recently active",
  patientSessionIsActive(
    new Date("2026-07-22T15:59:00.000Z"),
    new Date("2026-07-22T16:00:00.000Z"),
    sessionNow,
  ),
  false,
);
eq(
  "a staff-as-patient identity requires a synthetic client",
  staffPatientPilotPolicy({ clientSynthetic: false, staffId: "st-1", staffActive: true }) !== null,
  true,
);
eq(
  "a staff-as-patient identity requires an active staff record",
  staffPatientPilotPolicy({ clientSynthetic: true, staffId: "st-1", staffActive: false }) !== null,
  true,
);
eq(
  "an active staff identity may link only to its synthetic patient record",
  staffPatientPilotPolicy({ clientSynthetic: true, staffId: "st-1", staffActive: true }),
  null,
);

section("Patient-to-coach messaging");
const patientRequest = authoritativeMessageId("patient-to-coach", "client-1", "request-12345678");
eq("a retried patient message keeps the same id", patientRequest, authoritativeMessageId("patient-to-coach", "client-1", "request-12345678"));
eq("the same browser request cannot collide across patients", patientRequest === authoritativeMessageId("patient-to-coach", "client-2", "request-12345678"), false);
eq("a coach reply cannot collide with a patient send", patientRequest === authoritativeMessageId("coach-to-patient", "client-1", "request-12345678", "coach-1"), false);
eq("urgent chest symptoms are detected", containsUrgentLanguage("I have chest pressure and feel dizzy"), true);
eq("ordinary scheduling language is not labeled urgent", containsUrgentLanguage("Can we move my appointment to Friday?"), false);

section("Calendar capacity");
const appointmentRequest = appointmentRequestId("client-1", "request-12345678");
eq("a retried booking keeps the same opaque appointment id", appointmentRequest, appointmentRequestId("client-1", "request-12345678"));
eq("appointment ids do not expose the patient id", appointmentRequest.includes("client-1"), false);
eq("a scheduled visit may arrive", appointmentTransitionAllowed("Scheduled", "Arrived"), true);
eq("a completed visit cannot be marked no-show", appointmentTransitionAllowed("Completed", "No Show"), false);
let missingGoogleCredentialsRefused = false;
try { parseGoogleServiceAccount(undefined); } catch { missingGoogleCredentialsRefused = true; }
eq("calendar sync refuses missing credentials", missingGoogleCredentialsRefused, true);
eq("an empty calendar without working hours offers nothing", freeWindows([], []).length, 0);
eq(
  "busy time is subtracted from working hours",
  freeWindows(
    [{ startMin: 8 * 60, endMin: 17 * 60 }],
    [
      { startMin: 9 * 60, endMin: 10 * 60 },
      { startMin: 12 * 60, endMin: 13 * 60 },
    ],
  ),
  [
    { startMin: 8 * 60, endMin: 9 * 60 },
    { startMin: 10 * 60, endMin: 12 * 60 },
    { startMin: 13 * 60, endMin: 17 * 60 },
  ],
);
eq(
  "overlapping busy blocks cannot create negative or duplicate space",
  freeWindows(
    [{ startMin: 480, endMin: 720 }],
    [
      { startMin: 500, endMin: 600 },
      { startMin: 550, endMin: 650 },
    ],
  ),
  [
    { startMin: 480, endMin: 500 },
    { startMin: 650, endMin: 720 },
  ],
);
eq("an overnight rule is refused", validateMinuteWindow({ startMin: 1020, endMin: 480 }).length > 0, true);
eq(
  "effective dates bound recurring availability",
  rulesForDate(
    [
      {
        staffId: "st-1",
        locationId: "raleigh",
        weekday: 3,
        startMin: 480,
        endMin: 1020,
        timezone: "America/New_York",
        effectiveFrom: "2026-07-01",
        effectiveUntil: "2026-07-31",
        active: true,
      },
    ],
    "2026-08-05",
    3,
  ).length,
  0,
);

section("Payment fail-safes");
const clover = new CloverPaymentPort({
  baseUrl: "https://sandbox.dev.clover.com",
  tokensByMerchant: { "merchant-raleigh": "test-token" },
});
let noIdempotencyRefused = false;
try {
  await clover.charge({
    clientId: "client-1",
    processorToken: "vault-token",
    amountCents: 1000,
    currency: "USD",
    idempotencyKey: "",
    merchantAccountId: "merchant-raleigh",
  });
} catch (error) {
  noIdempotencyRefused = error instanceof Error && error.message.includes("idempotencyKey");
}
eq("a payment without an idempotency key is refused", noIdempotencyRefused, true);
let missingMerchantRefused = false;
try {
  await clover.charge({
    clientId: "client-1",
    processorToken: "vault-token",
    amountCents: 1000,
    currency: "USD",
    idempotencyKey: "charge-1",
    merchantAccountId: "merchant-wrong-clinic",
  });
} catch (error) {
  missingMerchantRefused = error instanceof Error && error.message.includes("No Clover API token");
}
eq("a charge cannot fall back to another clinic's merchant", missingMerchantRefused, true);
eq(
  "an expired card requests an update instead of retrying",
  DUNNING_LADDER.card_expired[0].action,
  "request-card-update",
);

console.log(
  `\n${checks - failures}/${checks} checks passed` + (failures ? ` — ${failures} FAILED` : ""),
);
process.exit(failures > 0 ? 1 : 0);
