import type { Biomarker, Client } from "@/lib/types";
import type { PlanItem } from "@/lib/planOfCare/types";
import { getClient, clientName } from "@/lib/mock/clients";
import { getLabsForClient } from "@/lib/mock/labs";
import { locationMap } from "@/lib/mock/locations";
import { buildPlanOfCare, allPlanItems } from "@/lib/planOfCare/engine";
import { adapterFail, adapterOk, AZURE_NOW, type AdapterResult } from "@/lib/azure/types";

/**
 * AZURE HEALTH DATA SERVICES — FHIR R4 service.
 *
 * WHAT THE REAL SERVICE DOES
 *   A managed, HIPAA-eligible FHIR R4 server with SMART-on-FHIR authorization,
 *   `$export` for bulk data, and a full REST API over Patient, Observation,
 *   MedicationRequest, CarePlan and the rest. Apps authenticate with Entra and
 *   are scoped per-resource; members can authorize a third-party app to read
 *   their own record without Alpha Health brokering the connection.
 *
 * WHAT THIS FILE DOES INSTEAD
 *   Projects Apex's own types onto FHIR R4 resource shapes, in memory, and
 *   assembles a Bundle. The mapping is real and complete enough to PUT; the
 *   server it would be PUT to does not exist in this build. Nothing is
 *   transmitted, and no resource here has ever been assigned a server-side id —
 *   `id` values are derived from Apex ids, which is what you want anyway.
 *
 * WHAT WOULD HAVE TO CHANGE TO MAKE IT REAL
 *   1. Provision a Health Data Services workspace + FHIR service.
 *   2. Replace the local reads (`getClient`, `getLabsForClient`,
 *      `buildPlanOfCare`) with Postgres reads — the projections themselves are
 *      unchanged, because they are pure functions over the domain types.
 *   3. PUT each resource by its derived id (idempotent by construction, so a
 *      replayed sync is a no-op) and register SMART scopes for the member app.
 *   4. Add `Provenance` resources referencing the Apex ledger row that produced
 *      each write — Apex already has the chain, and FHIR has the resource for it.
 *
 * WHY THIS IS THE INFORMATION-BLOCKING ANSWER
 *   The ONC information-blocking rule (45 CFR Part 171) says a patient has the
 *   right to their electronic health information without special effort and
 *   without delay, and it defines interference broadly enough that "we have no
 *   API" is not a defense — it is closer to an admission. The exceptions are
 *   narrow and none of them is "we never built one". A clinic whose only export
 *   path is a staff member manually assembling a PDF has an availability problem
 *   dressed up as a process, and the practical penalty arrives as a complaint
 *   from a member who wanted their labs in an app.
 *
 *   `exportBundle` is the structural answer: one function, one member, complete
 *   record, standards-shaped. It is deliberately not a report generator. A PDF
 *   satisfies a request; a FHIR Bundle satisfies the right.
 *
 * WHY THIS IS ALSO THE PARTNERSHIP SURFACE
 *   The same projection is what makes Apex interoperable with any health system
 *   Alpha Health ever partners with. Hospital systems, referral networks and
 *   payer programs do not accept a proprietary schema and will not write an
 *   adapter for a five-location clinic — they ask for FHIR, and the answer is
 *   yes or the conversation ends. Building the projection now, while there are
 *   twelve resource types to map, costs a fraction of retrofitting it later, and
 *   it forces the domain model to stay honest: anything that cannot be expressed
 *   as a FHIR resource is usually a sign the concept is muddled internally too.
 */

export const FHIR_VERSION = "4.0.1";

/**
 * The system URI Apex mints identifiers under. A real deployment registers a
 * domain-based URI it controls; inventing one is how two systems end up with
 * colliding "MRN" namespaces and a merged chart that belongs to two people.
 */
export const APEX_IDENTIFIER_SYSTEM = "https://apex.goalphahealth.com/fhir/identifier";

/** Minimal structural types. Deliberately narrow — only what Apex populates. */
export interface FhirCoding {
  system: string;
  code: string;
  display?: string;
}

export interface FhirCodeableConcept {
  coding: FhirCoding[];
  text?: string;
}

export interface FhirReference {
  reference: string;
  display?: string;
}

export interface FhirPatient {
  resourceType: "Patient";
  id: string;
  identifier: Array<{ system: string; value: string; type?: FhirCodeableConcept }>;
  active: boolean;
  name: Array<{ use: "official"; family: string; given: string[] }>;
  telecom: Array<{ system: "phone" | "email"; value: string; use: "home" | "mobile" }>;
  gender: "male" | "female" | "other" | "unknown";
  /**
   * FHIR wants birthDate; Apex stores age only. Deriving a birth date from an
   * age would fabricate PHI to the day, so the field is omitted and the age is
   * carried as an extension. An approximate identifier is worse than an absent
   * one — it looks authoritative and matches the wrong person.
   */
  extension: Array<{ url: string; valueInteger?: number; valueString?: string }>;
  managingOrganization: FhirReference;
}

export interface FhirObservation {
  resourceType: "Observation";
  id: string;
  status: "final";
  category: FhirCodeableConcept[];
  code: FhirCodeableConcept;
  subject: FhirReference;
  effectiveDateTime: string;
  valueQuantity: { value: number; unit: string; system: string; code: string };
  referenceRange: Array<{
    low?: { value: number; unit: string };
    high?: { value: number; unit: string };
    type?: FhirCodeableConcept;
  }>;
  interpretation?: FhirCodeableConcept[];
}

export interface FhirMedicationRequest {
  resourceType: "MedicationRequest";
  id: string;
  /**
   * "proposal" until a licensed provider signs, then "order".
   *
   * This is not a cosmetic mapping. Apex's safety invariant is that the system
   * proposes modality and cadence and never a dose (see lib/planOfCare/types.ts,
   * where the dose field is structurally absent). FHIR has exactly the right
   * vocabulary for that distinction, and using the wrong intent would export an
   * unsigned suggestion as a prescription — into a partner system that would
   * reasonably treat it as one.
   */
  intent: "proposal" | "order";
  status: "draft" | "active";
  medicationCodeableConcept: FhirCodeableConcept;
  subject: FhirReference;
  authoredOn: string;
  /**
   * Timing and route only. `doseAndRate` is deliberately never populated —
   * Apex does not produce doses, so it must not emit a structure that implies
   * one and leaves it blank.
   */
  dosageInstruction: Array<{ text: string; timing?: { code: FhirCodeableConcept }; route?: FhirCodeableConcept }>;
  note?: Array<{ text: string }>;
}

export interface FhirBundleEntry {
  fullUrl: string;
  resource: FhirPatient | FhirObservation | FhirMedicationRequest;
  request?: { method: "PUT"; url: string };
}

export interface FhirBundle {
  resourceType: "Bundle";
  id: string;
  /**
   * "transaction" rather than "collection": a partial export is a clinical
   * hazard. If one Observation fails to write, the receiving system must not be
   * left holding a chart that is missing a biomarker while looking complete.
   */
  type: "transaction";
  timestamp: string;
  total: number;
  entry: FhirBundleEntry[];
  meta: { versionId: string; source: string };
}

// ---------------------------------------------------------------------------
// LOINC mapping
// ---------------------------------------------------------------------------

/**
 * Apex biomarker key → LOINC + UCUM.
 *
 * A biomarker with no LOINC code is exported with the Apex-local system rather
 * than a guessed LOINC. Guessing here is how a testosterone result lands in a
 * partner's chart under a code for something else — silently, and forever.
 */
const LOINC: Record<string, { code: string; display: string; ucum: string }> = {
  total_t: { code: "2986-8", display: "Testosterone [Mass/volume] in Serum or Plasma", ucum: "ng/dL" },
  free_t: { code: "2991-8", display: "Testosterone.free [Mass/volume] in Serum or Plasma", ucum: "pg/mL" },
  estradiol: { code: "2243-4", display: "Estradiol [Mass/volume] in Serum or Plasma", ucum: "pg/mL" },
  shbg: { code: "13967-5", display: "Sex hormone binding globulin [Moles/volume]", ucum: "nmol/L" },
  lh: { code: "10501-5", display: "Luteropin [Units/volume] in Serum or Plasma", ucum: "m[IU]/mL" },
  fsh: { code: "15067-2", display: "Follitropin [Units/volume] in Serum or Plasma", ucum: "m[IU]/mL" },
  igf1: { code: "2484-4", display: "Somatomedin C [Mass/volume]", ucum: "ng/mL" },
  tsh: { code: "3016-3", display: "Thyrotropin [Units/volume] in Serum or Plasma", ucum: "m[IU]/L" },
  ft3: { code: "3051-0", display: "Triiodothyronine.free [Mass/volume]", ucum: "pg/mL" },
  ft4: { code: "3024-7", display: "Thyroxine.free [Mass/volume]", ucum: "ng/dL" },
  rt3: { code: "3053-6", display: "Triiodothyronine.reverse [Mass/volume]", ucum: "ng/dL" },
  vitd: { code: "62292-8", display: "25-hydroxyvitamin D3 [Mass/volume]", ucum: "ng/mL" },
  b12: { code: "2132-9", display: "Cobalamin [Mass/volume] in Serum or Plasma", ucum: "pg/mL" },
  ferritin: { code: "2276-4", display: "Ferritin [Mass/volume] in Serum or Plasma", ucum: "ng/mL" },
  crp: { code: "1988-5", display: "C reactive protein [Mass/volume]", ucum: "mg/L" },
  hscrp: { code: "30522-7", display: "C reactive protein [Mass/volume] by High sensitivity method", ucum: "mg/L" },
  a1c: { code: "4548-4", display: "Hemoglobin A1c/Hemoglobin.total in Blood", ucum: "%" },
  glucose: { code: "1558-6", display: "Fasting glucose [Mass/volume] in Serum or Plasma", ucum: "mg/dL" },
  insulin: { code: "1986-9", display: "Insulin [Units/volume] in Serum or Plasma --fasting", ucum: "u[IU]/mL" },
  ldl: { code: "13457-7", display: "Cholesterol in LDL [Mass/volume] calculated", ucum: "mg/dL" },
  hdl: { code: "2085-9", display: "Cholesterol in HDL [Mass/volume]", ucum: "mg/dL" },
  trig: { code: "2571-8", display: "Triglyceride [Mass/volume] in Serum or Plasma", ucum: "mg/dL" },
  apob: { code: "1884-6", display: "Apolipoprotein B [Mass/volume]", ucum: "mg/dL" },
  alt: { code: "1742-6", display: "Alanine aminotransferase [Enzymatic activity/volume]", ucum: "U/L" },
  ast: { code: "1920-8", display: "Aspartate aminotransferase [Enzymatic activity/volume]", ucum: "U/L" },
  creatinine: { code: "2160-0", display: "Creatinine [Mass/volume] in Serum or Plasma", ucum: "mg/dL" },
  egfr: { code: "33914-3", display: "Glomerular filtration rate/1.73 sq M.predicted", ucum: "mL/min" },
  hct: { code: "4544-3", display: "Hematocrit [Volume Fraction] of Blood by Automated count", ucum: "%" },
  psa: { code: "2857-1", display: "Prostate specific Ag [Mass/volume] in Serum or Plasma", ucum: "ng/mL" },
};

const LOINC_SYSTEM = "http://loinc.org";
const UCUM_SYSTEM = "http://unitsofmeasure.org";
const INTERPRETATION_SYSTEM = "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation";
const OBS_CATEGORY_SYSTEM = "http://terminology.hl7.org/CodeSystem/observation-category";

/** Apex biomarker status → HL7 v3 interpretation code. */
const INTERPRETATION: Record<Biomarker["status"], { code: string; display: string }> = {
  optimal: { code: "N", display: "Normal" },
  low: { code: "L", display: "Low" },
  high: { code: "H", display: "High" },
  // "watch" has no exact v3 equivalent; "A" (Abnormal) is the honest widening.
  watch: { code: "A", display: "Abnormal" },
};

// ---------------------------------------------------------------------------
// Projections
// ---------------------------------------------------------------------------

export function toFhirPatient(client: Client): FhirPatient {
  const loc = locationMap[client.locationId];
  return {
    resourceType: "Patient",
    id: client.id,
    identifier: [
      {
        system: `${APEX_IDENTIFIER_SYSTEM}/mrn`,
        value: client.mrn,
        type: {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/v2-0203",
              code: "MR",
              display: "Medical record number",
            },
          ],
          text: "Apex MRN",
        },
      },
    ],
    active: client.status !== "Inactive",
    name: [{ use: "official", family: client.lastName, given: [client.firstName] }],
    telecom: [
      { system: "phone", value: client.phone, use: "mobile" },
      { system: "email", value: client.email, use: "home" },
    ],
    gender: client.sex,
    extension: [
      // See the FhirPatient note: age, not a fabricated birthDate.
      { url: `${APEX_IDENTIFIER_SYSTEM}/StructureDefinition/age-years`, valueInteger: client.age },
      { url: `${APEX_IDENTIFIER_SYSTEM}/StructureDefinition/care-location`, valueString: loc?.name ?? client.locationId },
    ],
    managingOrganization: {
      reference: `Organization/alpha-health-${client.locationId}`,
      display: loc?.name ?? "Alpha Health",
    },
  };
}

export function toFhirObservation(
  biomarker: Biomarker,
  clientId: string,
  effectiveDateTime: string,
): FhirObservation {
  const mapped = LOINC[biomarker.key];
  const interp = INTERPRETATION[biomarker.status];

  return {
    resourceType: "Observation",
    id: `${clientId}-${biomarker.key}-${effectiveDateTime.slice(0, 10)}`,
    status: "final",
    category: [
      {
        coding: [{ system: OBS_CATEGORY_SYSTEM, code: "laboratory", display: "Laboratory" }],
      },
    ],
    code: {
      coding: mapped
        ? [{ system: LOINC_SYSTEM, code: mapped.code, display: mapped.display }]
        : // No guessed LOINC. An Apex-local code is honest; a wrong LOINC is not.
          [{ system: `${APEX_IDENTIFIER_SYSTEM}/biomarker`, code: biomarker.key, display: biomarker.name }],
      text: biomarker.name,
    },
    subject: { reference: `Patient/${clientId}` },
    effectiveDateTime,
    valueQuantity: {
      value: biomarker.value,
      unit: biomarker.unit,
      system: UCUM_SYSTEM,
      code: mapped?.ucum ?? biomarker.unit,
    },
    referenceRange: [
      {
        low: { value: biomarker.refLow, unit: biomarker.unit },
        high: { value: biomarker.refHigh, unit: biomarker.unit },
        type: { coding: [], text: "Lab reference range" },
      },
      // Apex's optimal window is narrower than the lab's and is a distinct
      // clinical claim, so it is exported as a second, labelled range rather
      // than overwriting the lab's — a partner reading only the first range
      // still gets the correct one.
      ...(biomarker.optimalLow !== undefined && biomarker.optimalHigh !== undefined
        ? [
            {
              low: { value: biomarker.optimalLow, unit: biomarker.unit },
              high: { value: biomarker.optimalHigh, unit: biomarker.unit },
              type: { coding: [], text: "Alpha Health optimal window" },
            },
          ]
        : []),
    ],
    interpretation: [
      { coding: [{ system: INTERPRETATION_SYSTEM, code: interp.code, display: interp.display }], text: biomarker.status },
    ],
  };
}

export function toFhirMedicationRequest(
  item: PlanItem,
  clientId: string,
  authoredOn: string,
  approved = false,
): FhirMedicationRequest {
  const cadence = item.cadence ?? "As directed by provider";
  const route = item.modality ?? "Route to be determined by provider";

  return {
    resourceType: "MedicationRequest",
    id: `${clientId}-${item.id}`,
    // See the note on `intent`: unsigned means proposal, always.
    intent: approved ? "order" : "proposal",
    status: approved ? "active" : "draft",
    medicationCodeableConcept: {
      // Apex-local coding. RxNorm mapping is a per-agent curation job, not a
      // string match on a title — and an unmapped agent must not silently
      // acquire a code that belongs to something else.
      coding: [{ system: `${APEX_IDENTIFIER_SYSTEM}/protocol`, code: item.id, display: item.title }],
      text: item.title,
    },
    subject: { reference: `Patient/${clientId}` },
    authoredOn,
    dosageInstruction: [
      {
        // No doseAndRate. Apex does not produce doses.
        text: `${route} · ${cadence}. Dose to be determined by the prescribing provider.`,
        timing: { code: { coding: [], text: cadence } },
        route: { coding: [], text: route },
      },
    ],
    note: [
      { text: item.detail },
      ...(item.because.length ? [{ text: `Rationale: ${item.because.join("; ")}` }] : []),
      ...(item.requiresProviderApproval && !approved
        ? [{ text: "PROPOSAL ONLY — not signed by a licensed provider. Not a prescription." }]
        : []),
    ],
  };
}

// ---------------------------------------------------------------------------
// Bundle
// ---------------------------------------------------------------------------

/**
 * The whole record for one member, as a FHIR R4 transaction Bundle.
 *
 * Every entry carries a `request` with `PUT {Type}/{id}`, so the bundle is
 * idempotent: replaying it updates rather than duplicating. A collection bundle
 * POSTed twice creates two of everything, and duplicated clinical resources are
 * a genuinely hard mess to unwind afterwards.
 */
export function exportBundle(
  clientId: string,
  at: string = AZURE_NOW,
): AdapterResult<FhirBundle> {
  const client = getClient(clientId);
  if (!client) {
    return adapterFail(`No member ${clientId}.`);
  }

  const entries: FhirBundleEntry[] = [];

  const patient = toFhirPatient(client);
  entries.push({
    fullUrl: `urn:apex:Patient/${patient.id}`,
    resource: patient,
    request: { method: "PUT", url: `Patient/${patient.id}` },
  });

  const labs = getLabsForClient(clientId);
  if (labs) {
    for (const b of labs.biomarkers) {
      const obs = toFhirObservation(b, clientId, labs.resultedOn);
      entries.push({
        fullUrl: `urn:apex:Observation/${obs.id}`,
        resource: obs,
        request: { method: "PUT", url: `Observation/${obs.id}` },
      });
    }
  }

  const plan = buildPlanOfCare(client);
  const approved = Boolean(plan.approvedAt);
  for (const item of allPlanItems(plan)) {
    // Only clinical protocol items become MedicationRequests. Nutrition and
    // training items are real care but are not medication, and exporting them
    // as such would be a lie with a code system attached.
    if (item.section !== "protocol") continue;
    const mr = toFhirMedicationRequest(item, clientId, plan.createdAt, approved);
    entries.push({
      fullUrl: `urn:apex:MedicationRequest/${mr.id}`,
      resource: mr,
      request: { method: "PUT", url: `MedicationRequest/${mr.id}` },
    });
  }

  return adapterOk({
    resourceType: "Bundle",
    id: `apex-export-${clientId}`,
    type: "transaction",
    timestamp: at,
    total: entries.length,
    entry: entries,
    meta: {
      versionId: FHIR_VERSION,
      source: "https://apex.goalphahealth.com (DEMO BUILD — projected locally, not written to a FHIR server)",
    },
  });
}

/** A one-line description of what a member is about to download. */
export function bundleSummary(bundle: FhirBundle): string {
  const counts = bundle.entry.reduce<Record<string, number>>((acc, e) => {
    acc[e.resource.resourceType] = (acc[e.resource.resourceType] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts)
    .map(([type, n]) => `${n} ${type}${n === 1 ? "" : "s"}`)
    .join(", ");
}

/** Display name for the export header. Re-exported so callers need one import. */
export { clientName };
