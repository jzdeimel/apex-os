import type {
  Client,
  Goal,
  Symptom,
  ClientStatus,
  LocationId,
  RiskFlag,
  Program,
  RecommendationCategory,
} from "@/lib/types";
import { staff } from "@/lib/mock/staff";
import { seededRandom } from "@/lib/utils";

// Monogram palette (gold + clinical accents)
const C = {
  gold: "#e93d3d",
  emerald: "#34d399",
  blue: "#60a5fa",
  slate: "#94a1a6",
  rose: "#f87171",
  violet: "#a78bfa",
  amber: "#e0bd6e",
  teal: "#2dd4bf",
};

const heroClients: Client[] = [
  {
    id: "c-001",
    firstName: "Jake",
    lastName: "Morrison",
    sex: "male",
    age: 41,
    locationId: "raleigh",
    status: "Active Protocol",
    coachId: "st-005",
    providerId: "st-001",
    goals: ["Fat loss", "Energy", "Recovery"],
    symptoms: ["Low energy", "Slow recovery", "Weight gain"],
    programs: [
      { name: "Metabolic Reset", category: "Metabolic / weight management", startedOn: "2026-03-12", status: "Active" },
    ],
    joinedOn: "2026-01-08",
    latestLabDate: "2026-06-01",
    nextAppointment: "2026-06-15T14:00:00",
    planStatus: "Active",
    riskFlags: [
      { level: "moderate", label: "Metabolic", detail: "A1C 5.9% and fasting insulin elevated." },
    ],
    email: "jake.m@example.demo",
    phone: "(919) 555-0142",
    mindbodyId: "MB-44821",
    avatarColor: C.gold,
    lifetimeValue: 8450,
  },
  {
    id: "c-002",
    firstName: "Andre",
    lastName: "Bellamy",
    sex: "male",
    age: 48,
    locationId: "raleigh",
    status: "Results Ready",
    coachId: "st-006",
    providerId: "st-001",
    goals: ["Libido", "Energy", "Muscle gain"],
    symptoms: ["Low libido", "Low energy", "Reduced strength"],
    programs: [],
    joinedOn: "2026-04-22",
    latestLabDate: "2026-06-05",
    nextAppointment: "2026-06-13T11:30:00",
    planStatus: "Awaiting provider",
    riskFlags: [
      { level: "moderate", label: "Hormone", detail: "Total & free testosterone below optimal." },
    ],
    email: "a.bellamy@example.demo",
    phone: "(919) 555-0198",
    mindbodyId: "MB-44822",
    avatarColor: C.blue,
    lifetimeValue: 3200,
  },
  {
    id: "c-003",
    firstName: "Marcus",
    lastName: "Reyes",
    sex: "male",
    age: 36,
    locationId: "southern-pines",
    status: "Plan Review",
    coachId: "st-008",
    providerId: "st-004",
    goals: ["Recovery", "Joint pain", "Muscle gain"],
    symptoms: ["Joint pain", "Slow recovery"],
    programs: [
      { name: "Recovery Track", category: "Recovery / tissue support", startedOn: "2026-05-02", status: "Active" },
    ],
    joinedOn: "2026-03-30",
    latestLabDate: "2026-05-28",
    nextAppointment: "2026-06-14T09:00:00",
    planStatus: "Draft",
    riskFlags: [
      { level: "low", label: "Inflammation", detail: "hs-CRP mildly elevated." },
    ],
    email: "m.reyes@example.demo",
    phone: "(910) 555-0111",
    mindbodyId: "MB-44823",
    avatarColor: C.emerald,
    lifetimeValue: 5100,
  },
  {
    id: "c-004",
    firstName: "Sophia",
    lastName: "Nguyen",
    sex: "female",
    age: 39,
    locationId: "telehealth",
    status: "Active Protocol",
    coachId: "st-011",
    providerId: "st-003",
    goals: ["Skin/hair", "Energy", "Sleep"],
    symptoms: ["Hair thinning", "Low energy", "Poor sleep"],
    programs: [
      { name: "Aesthetics & Vitality", category: "Skin / hair / aesthetics support", startedOn: "2026-04-18", status: "Active" },
    ],
    joinedOn: "2026-02-14",
    latestLabDate: "2026-05-30",
    nextAppointment: "2026-06-20T16:00:00",
    planStatus: "Active",
    riskFlags: [
      { level: "low", label: "Nutrient", detail: "Vitamin D and ferritin low-normal." },
    ],
    email: "s.nguyen@example.demo",
    phone: "(984) 555-0173",
    mindbodyId: "MB-44824",
    avatarColor: C.violet,
    lifetimeValue: 4300,
  },
  {
    id: "c-005",
    firstName: "Derek",
    lastName: "Holloway",
    sex: "male",
    age: 52,
    locationId: "myrtle-beach",
    status: "Follow-Up Due",
    coachId: "st-007",
    providerId: "st-003",
    goals: ["Fat loss", "Cognition", "Energy"],
    symptoms: ["Weight gain", "Brain fog", "Low energy"],
    programs: [
      { name: "GLP Weight Management", category: "Metabolic / weight management", startedOn: "2026-02-20", status: "Active" },
    ],
    joinedOn: "2025-12-11",
    latestLabDate: "2026-05-22",
    nextAppointment: "2026-06-18T13:00:00",
    planStatus: "Needs review",
    riskFlags: [
      { level: "moderate", label: "Metabolic", detail: "Elevated triglycerides and ApoB." },
    ],
    email: "d.holloway@example.demo",
    phone: "(843) 555-0150",
    mindbodyId: "MB-44825",
    avatarColor: C.amber,
    lifetimeValue: 9600,
  },
  {
    id: "c-006",
    firstName: "Priya",
    lastName: "Sharma",
    sex: "female",
    age: 44,
    locationId: "raleigh",
    status: "Results Ready",
    coachId: "st-006",
    providerId: "st-002",
    goals: ["Energy", "Sleep", "Cognition"],
    symptoms: ["Low energy", "Cold intolerance", "Brain fog"],
    programs: [],
    joinedOn: "2026-05-01",
    latestLabDate: "2026-06-04",
    nextAppointment: "2026-06-16T10:00:00",
    planStatus: "Awaiting provider",
    riskFlags: [
      { level: "moderate", label: "Thyroid", detail: "TSH high with low Free T3." },
    ],
    email: "p.sharma@example.demo",
    phone: "(919) 555-0166",
    mindbodyId: "MB-44826",
    avatarColor: C.teal,
    lifetimeValue: 2100,
  },
  {
    id: "c-007",
    firstName: "Cole",
    lastName: "Whitaker",
    sex: "male",
    age: 33,
    locationId: "raleigh",
    status: "Active Protocol",
    coachId: "st-005",
    providerId: "st-002",
    goals: ["Recovery", "Muscle gain", "Sleep"],
    symptoms: ["Slow recovery", "Poor sleep"],
    programs: [
      { name: "Recovery Track", category: "Recovery / tissue support", startedOn: "2026-04-01", status: "Active" },
    ],
    joinedOn: "2026-02-28",
    latestLabDate: "2026-05-26",
    nextAppointment: "2026-06-22T15:30:00",
    planStatus: "Active",
    riskFlags: [],
    email: "c.whitaker@example.demo",
    phone: "(919) 555-0124",
    mindbodyId: "MB-44827",
    avatarColor: C.emerald,
    lifetimeValue: 6750,
  },
  {
    id: "c-008",
    firstName: "Tara",
    lastName: "Donovan",
    sex: "female",
    age: 50,
    locationId: "southern-pines",
    status: "Plan Review",
    coachId: "st-008",
    providerId: "st-004",
    goals: ["Fat loss", "Energy"],
    symptoms: ["Weight gain", "Low energy", "Mood changes"],
    programs: [],
    joinedOn: "2026-04-09",
    latestLabDate: "2026-06-02",
    nextAppointment: "2026-06-17T12:00:00",
    planStatus: "Draft",
    riskFlags: [
      { level: "moderate", label: "Metabolic", detail: "Fasting glucose and A1C in prediabetic range." },
    ],
    email: "t.donovan@example.demo",
    phone: "(910) 555-0188",
    mindbodyId: "MB-44828",
    avatarColor: C.gold,
    lifetimeValue: 3850,
  },
  {
    id: "c-009",
    firstName: "Liam",
    lastName: "Okonkwo",
    sex: "male",
    age: 29,
    locationId: "telehealth",
    status: "Labs Ordered",
    coachId: "st-011",
    providerId: "st-001",
    goals: ["Muscle gain", "Recovery", "Cognition"],
    symptoms: ["Slow recovery", "Brain fog"],
    programs: [],
    joinedOn: "2026-05-20",
    latestLabDate: undefined,
    nextAppointment: "2026-06-19T09:30:00",
    planStatus: "No plan",
    riskFlags: [],
    email: "l.okonkwo@example.demo",
    phone: "(984) 555-0107",
    mindbodyId: "MB-44829",
    avatarColor: C.blue,
    lifetimeValue: 600,
  },
  {
    id: "c-010",
    firstName: "Rebecca",
    lastName: "Cho",
    sex: "female",
    age: 46,
    locationId: "raleigh",
    status: "Consult Booked",
    coachId: "st-006",
    providerId: "st-002",
    goals: ["Skin/hair", "Energy"],
    symptoms: ["Hair thinning", "Low energy"],
    programs: [],
    joinedOn: "2026-06-06",
    latestLabDate: undefined,
    nextAppointment: "2026-06-13T15:00:00",
    planStatus: "No plan",
    riskFlags: [],
    email: "r.cho@example.demo",
    phone: "(919) 555-0119",
    mindbodyId: "MB-44830",
    avatarColor: C.violet,
    lifetimeValue: 250,
  },
  {
    id: "c-011",
    firstName: "Victor",
    lastName: "Alvarez",
    sex: "male",
    age: 57,
    locationId: "myrtle-beach",
    status: "Active Protocol",
    coachId: "st-007",
    providerId: "st-003",
    goals: ["Libido", "Energy", "Muscle gain"],
    symptoms: ["Low libido", "Reduced strength", "Low energy"],
    programs: [
      { name: "Hormone Optimization", category: "Hormone optimization discussion", startedOn: "2026-03-05", status: "Active" },
    ],
    joinedOn: "2025-11-30",
    latestLabDate: "2026-05-18",
    nextAppointment: "2026-06-24T11:00:00",
    planStatus: "Active",
    riskFlags: [
      { level: "high", label: "Blood", detail: "Hematocrit trending high on therapy — provider monitoring." },
    ],
    email: "v.alvarez@example.demo",
    phone: "(843) 555-0162",
    mindbodyId: "MB-44831",
    avatarColor: C.rose,
    lifetimeValue: 11200,
  },
  {
    id: "c-012",
    firstName: "Hannah",
    lastName: "Bauer",
    sex: "female",
    age: 34,
    locationId: "southern-pines",
    status: "Results Ready",
    coachId: "st-008",
    providerId: "st-004",
    goals: ["Sleep", "Recovery", "Energy"],
    symptoms: ["Poor sleep", "Slow recovery", "Elevated stress"],
    programs: [],
    joinedOn: "2026-04-29",
    latestLabDate: "2026-06-03",
    nextAppointment: "2026-06-16T14:30:00",
    planStatus: "Awaiting provider",
    riskFlags: [
      { level: "low", label: "Recovery", detail: "IGF-1 low for age; cortisol pattern off." },
    ],
    email: "h.bauer@example.demo",
    phone: "(910) 555-0144",
    mindbodyId: "MB-44832",
    avatarColor: C.teal,
    lifetimeValue: 2950,
  },
  {
    id: "c-013",
    firstName: "Nathan",
    lastName: "Price",
    sex: "male",
    age: 45,
    locationId: "raleigh",
    status: "Follow-Up Due",
    coachId: "st-005",
    providerId: "st-001",
    goals: ["Fat loss", "Joint pain", "Recovery"],
    symptoms: ["Weight gain", "Joint pain", "Slow recovery"],
    programs: [
      { name: "Recovery Track", category: "Recovery / tissue support", startedOn: "2026-03-22", status: "Active" },
    ],
    joinedOn: "2026-01-25",
    latestLabDate: "2026-05-15",
    nextAppointment: "2026-06-12T16:30:00",
    planStatus: "Needs review",
    riskFlags: [
      { level: "moderate", label: "Inflammation", detail: "CRP and hs-CRP elevated with joint symptoms." },
    ],
    email: "n.price@example.demo",
    phone: "(919) 555-0137",
    mindbodyId: "MB-44833",
    avatarColor: C.gold,
    lifetimeValue: 7300,
  },
  {
    id: "c-014",
    firstName: "Olivia",
    lastName: "Russo",
    sex: "female",
    age: 41,
    locationId: "telehealth",
    status: "Active Protocol",
    coachId: "st-011",
    providerId: "st-003",
    goals: ["Fat loss", "Energy", "Cognition"],
    symptoms: ["Weight gain", "Brain fog", "Low energy"],
    programs: [
      { name: "GLP Weight Management", category: "Metabolic / weight management", startedOn: "2026-04-10", status: "Active" },
    ],
    joinedOn: "2026-03-02",
    latestLabDate: "2026-05-29",
    nextAppointment: "2026-06-21T10:30:00",
    planStatus: "Active",
    riskFlags: [
      { level: "low", label: "Metabolic", detail: "Fasting insulin mildly elevated; improving." },
    ],
    email: "o.russo@example.demo",
    phone: "(984) 555-0129",
    mindbodyId: "MB-44834",
    avatarColor: C.amber,
    lifetimeValue: 5400,
  },
  {
    id: "c-015",
    firstName: "Brandon",
    lastName: "Teller",
    sex: "male",
    age: 38,
    locationId: "myrtle-beach",
    status: "Inactive",
    coachId: "st-007",
    providerId: "st-003",
    goals: ["Muscle gain", "Recovery"],
    symptoms: ["Slow recovery"],
    programs: [
      { name: "Recovery Track", category: "Recovery / tissue support", startedOn: "2025-10-15", status: "Completed" },
    ],
    joinedOn: "2025-09-12",
    latestLabDate: "2026-01-10",
    nextAppointment: undefined,
    planStatus: "No plan",
    riskFlags: [],
    email: "b.teller@example.demo",
    phone: "(843) 555-0184",
    mindbodyId: "MB-44835",
    avatarColor: C.slate,
    lifetimeValue: 4100,
  },
  {
    id: "c-016",
    firstName: "Grace",
    lastName: "Whitfield",
    sex: "female",
    age: 53,
    locationId: "raleigh",
    status: "Plan Review",
    coachId: "st-006",
    providerId: "st-002",
    goals: ["Energy", "Cognition", "Sleep"],
    symptoms: ["Low energy", "Brain fog", "Cold intolerance"],
    programs: [],
    joinedOn: "2026-04-15",
    latestLabDate: "2026-06-06",
    nextAppointment: "2026-06-17T09:00:00",
    planStatus: "Draft",
    riskFlags: [
      { level: "moderate", label: "Thyroid", detail: "Subclinical hypothyroid pattern." },
    ],
    email: "g.whitfield@example.demo",
    phone: "(919) 555-0151",
    mindbodyId: "MB-44836",
    avatarColor: C.teal,
    lifetimeValue: 3650,
  },
  {
    id: "c-017",
    firstName: "Elijah",
    lastName: "Ford",
    sex: "male",
    age: 31,
    locationId: "southern-pines",
    status: "Consult Booked",
    coachId: "st-008",
    providerId: "st-004",
    goals: ["Cognition", "Energy", "Muscle gain"],
    symptoms: ["Brain fog", "Low energy"],
    programs: [],
    joinedOn: "2026-06-04",
    latestLabDate: undefined,
    nextAppointment: "2026-06-14T11:00:00",
    planStatus: "No plan",
    riskFlags: [],
    email: "e.ford@example.demo",
    phone: "(910) 555-0176",
    mindbodyId: "MB-44837",
    avatarColor: C.blue,
    lifetimeValue: 0,
  },
  {
    id: "c-018",
    firstName: "Maya",
    lastName: "Ellison",
    sex: "female",
    age: 37,
    locationId: "telehealth",
    status: "Lead",
    coachId: "st-011",
    providerId: "st-001",
    goals: ["Skin/hair", "Fat loss", "Energy"],
    symptoms: ["Hair thinning", "Weight gain"],
    programs: [],
    joinedOn: "2026-06-10",
    latestLabDate: undefined,
    nextAppointment: undefined,
    planStatus: "No plan",
    riskFlags: [],
    email: "m.ellison@example.demo",
    phone: "(984) 555-0190",
    mindbodyId: "MB-44838",
    avatarColor: C.violet,
    lifetimeValue: 0,
  },
  {
    id: "c-019",
    firstName: "Samuel",
    lastName: "Greer",
    sex: "male",
    age: 60,
    locationId: "myrtle-beach",
    status: "Active Protocol",
    coachId: "st-007",
    providerId: "st-003",
    goals: ["Libido", "Energy", "Cognition"],
    symptoms: ["Low libido", "Low energy", "Brain fog"],
    programs: [
      { name: "Hormone Optimization", category: "Hormone optimization discussion", startedOn: "2026-02-12", status: "Active" },
      { name: "NAD+ Vitality", category: "Energy / mitochondrial support", startedOn: "2026-04-20", status: "Active" },
    ],
    joinedOn: "2025-10-28",
    latestLabDate: "2026-05-20",
    nextAppointment: "2026-06-23T13:30:00",
    planStatus: "Active",
    riskFlags: [
      { level: "low", label: "Prostate", detail: "PSA within range; routine monitoring." },
    ],
    email: "s.greer@example.demo",
    phone: "(843) 555-0133",
    mindbodyId: "MB-44839",
    avatarColor: C.gold,
    lifetimeValue: 13400,
  },
  {
    id: "c-020",
    firstName: "Chloe",
    lastName: "Marsh",
    sex: "female",
    age: 28,
    locationId: "raleigh",
    status: "Labs Ordered",
    coachId: "st-006",
    providerId: "st-002",
    goals: ["Energy", "Sleep", "Skin/hair"],
    symptoms: ["Low energy", "Poor sleep", "Hair thinning"],
    programs: [],
    joinedOn: "2026-05-27",
    latestLabDate: undefined,
    nextAppointment: "2026-06-18T10:00:00",
    planStatus: "No plan",
    riskFlags: [],
    email: "c.marsh@example.demo",
    phone: "(919) 555-0102",
    mindbodyId: "MB-44840",
    avatarColor: C.teal,
    lifetimeValue: 350,
  },
  {
    id: "c-021",
    firstName: "Isaiah",
    lastName: "Bennett",
    sex: "male",
    age: 43,
    locationId: "southern-pines",
    status: "Active Protocol",
    coachId: "st-008",
    providerId: "st-004",
    goals: ["Fat loss", "Recovery", "Joint pain"],
    symptoms: ["Weight gain", "Joint pain", "Slow recovery"],
    programs: [
      { name: "Metabolic Reset", category: "Metabolic / weight management", startedOn: "2026-03-18", status: "Active" },
    ],
    joinedOn: "2026-02-05",
    latestLabDate: "2026-05-25",
    nextAppointment: "2026-06-20T13:00:00",
    planStatus: "Active",
    riskFlags: [
      { level: "moderate", label: "Metabolic", detail: "Elevated A1C with high body fat." },
    ],
    email: "i.bennett@example.demo",
    phone: "(910) 555-0159",
    mindbodyId: "MB-44841",
    avatarColor: C.amber,
    lifetimeValue: 6900,
  },
  {
    id: "c-022",
    firstName: "Naomi",
    lastName: "Frost",
    sex: "female",
    age: 47,
    locationId: "telehealth",
    status: "Follow-Up Due",
    coachId: "st-011",
    providerId: "st-001",
    goals: ["Energy", "Cognition", "Sleep"],
    symptoms: ["Low energy", "Brain fog", "Poor sleep"],
    programs: [
      { name: "NAD+ Vitality", category: "Energy / mitochondrial support", startedOn: "2026-04-02", status: "Active" },
    ],
    joinedOn: "2026-01-19",
    latestLabDate: "2026-05-12",
    nextAppointment: "2026-06-12T12:00:00",
    planStatus: "Needs review",
    riskFlags: [
      { level: "low", label: "Nutrient", detail: "B12 low-normal; D insufficient." },
    ],
    email: "n.frost@example.demo",
    phone: "(984) 555-0148",
    mindbodyId: "MB-44842",
    avatarColor: C.blue,
    lifetimeValue: 4750,
  },
  {
    id: "c-023",
    firstName: "Tony",
    lastName: "Calloway",
    sex: "male",
    age: 39,
    locationId: "raleigh",
    status: "Results Ready",
    coachId: "st-005",
    providerId: "st-001",
    goals: ["Fat loss", "Libido", "Energy"],
    symptoms: ["Weight gain", "Low libido", "Low energy"],
    programs: [],
    joinedOn: "2026-05-08",
    latestLabDate: "2026-06-07",
    nextAppointment: "2026-06-15T09:30:00",
    planStatus: "Awaiting provider",
    riskFlags: [
      { level: "moderate", label: "Hormone", detail: "Low testosterone with high body fat & SHBG low." },
    ],
    email: "t.calloway@example.demo",
    phone: "(919) 555-0181",
    mindbodyId: "MB-44843",
    avatarColor: C.gold,
    lifetimeValue: 1850,
  },
  {
    id: "c-024",
    firstName: "Renee",
    lastName: "Salas",
    sex: "female",
    age: 42,
    locationId: "myrtle-beach",
    status: "Active Protocol",
    coachId: "st-007",
    providerId: "st-003",
    goals: ["Skin/hair", "Recovery", "Energy"],
    symptoms: ["Hair thinning", "Slow recovery", "Low energy"],
    programs: [
      { name: "Aesthetics & Vitality", category: "Skin / hair / aesthetics support", startedOn: "2026-04-25", status: "Active" },
    ],
    joinedOn: "2026-03-14",
    latestLabDate: "2026-05-31",
    nextAppointment: "2026-06-26T15:00:00",
    planStatus: "Active",
    riskFlags: [
      { level: "low", label: "Nutrient", detail: "Ferritin low; supporting hair goals." },
    ],
    email: "r.salas@example.demo",
    phone: "(843) 555-0117",
    mindbodyId: "MB-44844",
    avatarColor: C.violet,
    lifetimeValue: 5250,
  },
];

// ===========================================================================
// Generated population — scales each location to ~100 clients (400 total).
// Deterministic (seeded, no Math.random/Date.now) so SSR and client match.
// The 24 hero clients above keep their hand-authored stories & deep links.
// ===========================================================================

const FIRST_M = ["James", "Michael", "David", "Chris", "Daniel", "Anthony", "Kevin", "Brian", "Jason", "Eric", "Aaron", "Patrick", "Sean", "Adam", "Nathan", "Ryan", "Justin", "Brandon", "Carlos", "Andre", "Marcus", "Devin", "Omar", "Hassan", "Leo", "Miles", "Trevor", "Wesley", "Grant", "Caleb", "Drew", "Felix", "Roman", "Xavier", "Damon"];
const FIRST_F = ["Emily", "Sarah", "Jessica", "Ashley", "Amanda", "Megan", "Rachel", "Lauren", "Nicole", "Hannah", "Olivia", "Sophia", "Mia", "Ava", "Grace", "Chloe", "Zoe", "Maya", "Layla", "Nina", "Priya", "Renee", "Bianca", "Carmen", "Dana", "Elise", "Farah", "Gabriela", "Heidi", "Ivy", "Jade", "Kira", "Lena", "Tara", "Vera"];
const LAST = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker", "Young", "Allen", "King", "Wright", "Scott", "Hill", "Green", "Adams", "Baker", "Nelson", "Carter", "Mitchell", "Roberts", "Turner", "Phillips", "Campbell", "Parker", "Evans", "Edwards", "Collins", "Stewart", "Morris", "Murphy", "Cook", "Bell", "Bailey", "Reed", "Cooper", "Ward"];

const ALL_GOALS: Goal[] = ["Fat loss", "Recovery", "Libido", "Energy", "Sleep", "Cognition", "Joint pain", "Muscle gain", "Skin/hair"];
const ALL_SYMPTOMS: Symptom[] = ["Low energy", "Poor sleep", "Brain fog", "Low libido", "Joint pain", "Slow recovery", "Weight gain", "Hair thinning", "Mood changes", "Reduced strength", "Cold intolerance", "Elevated stress"];
const PALETTE = Object.values(C);

const AREA: Record<LocationId, string> = { raleigh: "919", "southern-pines": "910", "myrtle-beach": "843", telehealth: "984" };

// status weighting (cumulative)
const STATUS_WEIGHTS: [ClientStatus, number][] = [
  ["Active Protocol", 0.34],
  ["Follow-Up Due", 0.46],
  ["Results Ready", 0.54],
  ["Plan Review", 0.62],
  ["Labs Ordered", 0.7],
  ["Consult Booked", 0.78],
  ["Lead", 0.88],
  ["Inactive", 1.0],
];

const PROGRAM_PRESETS: { name: string; category: RecommendationCategory; goal: Goal }[] = [
  { name: "Metabolic Reset", category: "Metabolic / weight management", goal: "Fat loss" },
  { name: "GLP Weight Management", category: "Metabolic / weight management", goal: "Fat loss" },
  { name: "Recovery Track", category: "Recovery / tissue support", goal: "Recovery" },
  { name: "Hormone Optimization", category: "Hormone optimization discussion", goal: "Libido" },
  { name: "NAD+ Vitality", category: "Energy / mitochondrial support", goal: "Energy" },
  { name: "Aesthetics & Vitality", category: "Skin / hair / aesthetics support", goal: "Skin/hair" },
];

const RISK_PRESETS: Omit<RiskFlag, "level">[] = [
  { label: "Metabolic", detail: "Glycemic markers trending toward insulin resistance." },
  { label: "Hormone", detail: "Testosterone below optimal for age." },
  { label: "Thyroid", detail: "Subclinical thyroid pattern on recent panel." },
  { label: "Inflammation", detail: "hs-CRP mildly elevated." },
  { label: "Nutrient", detail: "Vitamin D / ferritin low-normal." },
  { label: "Lipids", detail: "ApoB and triglycerides above target." },
];

const PLAN_BY_STATUS: Record<ClientStatus, Client["planStatus"]> = {
  Lead: "No plan",
  "Consult Booked": "No plan",
  "Labs Ordered": "No plan",
  "Results Ready": "Awaiting provider",
  "Plan Review": "Draft",
  "Active Protocol": "Active",
  "Follow-Up Due": "Needs review",
  Inactive: "No plan",
};

const LAB_STATUSES = new Set<ClientStatus>([
  "Results Ready",
  "Plan Review",
  "Active Protocol",
  "Follow-Up Due",
  "Inactive",
]);

function pick<T>(arr: T[], r: number): T {
  return arr[Math.floor(r * arr.length) % arr.length];
}
function pickN<T>(arr: T[], n: number, rand: () => number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && pool.length; i++) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
}
function addDays(base: string, days: number): string {
  const d = new Date(base + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function addDateTime(base: string, days: number, hour: number): string {
  const d = new Date(base + "T00:00:00");
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString().slice(0, 19);
}
function pickStatus(r: number): ClientStatus {
  for (const [s, w] of STATUS_WEIGHTS) if (r <= w) return s;
  return "Active Protocol";
}

const LOC_LIST: LocationId[] = ["raleigh", "southern-pines", "myrtle-beach", "telehealth"];

function makeClient(loc: LocationId, n: number): Client {
  const rand = seededRandom(`gen-${n}-${loc}`);
  const sex: "male" | "female" = rand() < 0.55 ? "male" : "female";
  const firstName = pick(sex === "male" ? FIRST_M : FIRST_F, rand());
  const lastName = pick(LAST, rand());
  const age = 27 + Math.floor(rand() * 39);
  const status = pickStatus(rand());

  const coachPool = staff.filter((s) => s.role === "Coach" && s.locationIds.includes(loc));
  const provPool = staff.filter((s) => s.canApprove && s.locationIds.includes(loc));
  const coachId = (coachPool.length ? pick(coachPool, rand()) : staff.find((s) => s.role === "Coach")!).id;
  const providerId = (provPool.length ? pick(provPool, rand()) : staff.find((s) => s.canApprove)!).id;

  const goals = pickN(ALL_GOALS, 2 + Math.floor(rand() * 2), rand);
  const symptoms = pickN(ALL_SYMPTOMS, 1 + Math.floor(rand() * 3), rand);

  const programs: Program[] = [];
  if (status === "Active Protocol" || status === "Follow-Up Due") {
    const preset = goals.includes("Fat loss")
      ? PROGRAM_PRESETS[rand() < 0.5 ? 0 : 1]
      : pick(PROGRAM_PRESETS, rand());
    programs.push({ name: preset.name, category: preset.category, startedOn: addDays("2026-06-12", -(30 + Math.floor(rand() * 150))), status: "Active" });
  }

  const joinedOn = addDays("2026-06-12", -(20 + Math.floor(rand() * 700)));
  const latestLabDate = LAB_STATUSES.has(status) && rand() < 0.9 ? addDays("2026-06-12", -(5 + Math.floor(rand() * 130))) : undefined;
  const nextAppointment = status !== "Inactive" && rand() < 0.72 ? addDateTime("2026-06-12", 1 + Math.floor(rand() * 24), 9 + Math.floor(rand() * 8)) : undefined;

  const riskFlags: RiskFlag[] = [];
  if (rand() < 0.42) {
    const preset = pick(RISK_PRESETS, rand());
    const lr = rand();
    riskFlags.push({ ...preset, level: lr < 0.55 ? "low" : lr < 0.9 ? "moderate" : "high" });
  }

  const tenureMonths = Math.max(1, Math.round((new Date("2026-06-12").getTime() - new Date(joinedOn).getTime()) / (1000 * 60 * 60 * 24 * 30)));
  const ltvBase = status === "Inactive" ? 1 : status === "Lead" || status === "Consult Booked" ? 0.15 : 1;
  const lifetimeValue = Math.round((300 + tenureMonths * (120 + rand() * 240)) * ltvBase);

  return {
    id: `c-${String(n).padStart(3, "0")}`,
    firstName,
    lastName,
    sex,
    age,
    locationId: loc,
    status,
    coachId,
    providerId,
    goals,
    symptoms,
    programs,
    joinedOn,
    latestLabDate,
    nextAppointment,
    planStatus: PLAN_BY_STATUS[status],
    riskFlags,
    email: `${firstName[0].toLowerCase()}.${lastName.toLowerCase()}@example.demo`,
    phone: `(${AREA[loc]}) 555-0${100 + (n % 900)}`,
    mindbodyId: `MB-${45000 + n}`,
    avatarColor: pick(PALETTE, rand()),
    lifetimeValue,
  };
}

const TARGET_PER_LOCATION = 100;
const generated: Client[] = [];
{
  let n = heroClients.length;
  for (const loc of LOC_LIST) {
    const existing = heroClients.filter((c) => c.locationId === loc).length;
    for (let k = existing; k < TARGET_PER_LOCATION; k++) {
      n += 1;
      generated.push(makeClient(loc, n));
    }
  }
}

export const clients: Client[] = [...heroClients, ...generated];

export const clientMap = Object.fromEntries(clients.map((c) => [c.id, c]));

export function clientName(c: Client) {
  return `${c.firstName} ${c.lastName}`;
}

export function getClient(id: string) {
  return clientMap[id];
}
