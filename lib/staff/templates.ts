import { getClient, clientName } from "@/lib/mock/clients";
import { staffMap, staffName } from "@/lib/mock/staff";
import { locationMap } from "@/lib/mock/locations";
import { formatDate } from "@/lib/utils";
import type { ConsentScope, ContactChannel } from "@/lib/comms/types";

/**
 * MESSAGE TEMPLATES — the forty-times-a-week explanations.
 *
 * ── Why this file exists ──────────────────────────────────────────────────
 * A coach explains "your labs are back and the provider has already looked at
 * them" perhaps forty times a week. In the system we are replacing there is no
 * template library, so they retype it forty times — which means forty slightly
 * different explanations, forty chances to say something clinical they should
 * not, and forty minutes gone. The ones who are organised keep a personal
 * Notes file, which is worse: it is unversioned, unreviewed, invisible to
 * compliance, and it leaves with the coach.
 *
 * ── THE RULE THAT MATTERS MOST: A TEMPLATE IS A STARTING POINT ────────────
 * Nothing in this module sends. `renderTemplate` returns text for a human to
 * read, change, and then send. There is deliberately no `sendTemplate`, no
 * `autoSend`, no scheduler hook — because the moment a system can send a
 * template unattended, every message becomes the generic slop members learn to
 * ignore, and the coach loses the one thing they are actually paid for, which
 * is noticing that this particular member is not like the others.
 *
 * The resolved text is therefore rendered into an editable field, and the
 * coach editing it before sending is the entire point of the feature. See
 * `TEMPLATES_ARE_DRAFTS`.
 *
 * ── CONSENT TRAVELS WITH THE TEMPLATE ─────────────────────────────────────
 * Every template declares the `ConsentScope` it needs (see lib/comms/types.ts —
 * these are three legal regimes, not three labels). The coach picks a
 * situation; the scope comes along for free and is handed to `sendMessage`,
 * which is the only guarded exit. A coach should never have to reason about
 * whether "your labs are back" is clinical or operational at 4:45pm on a
 * Friday — getting that wrong is a HIPAA question in one direction and a TCPA
 * question in the other.
 *
 * ── NO CLINICAL FACT LIVES HERE ───────────────────────────────────────────
 * Not one template names a dose, a frequency, a route, or a result value. A
 * template is boilerplate; boilerplate that carries a number becomes a number
 * that gets sent to the wrong member. Anything specific is written by the
 * coach or comes from the provider's plan.
 */

/** Stated as a value so a UI can render the promise rather than paraphrase it. */
export const TEMPLATES_ARE_DRAFTS =
  "Templates are a starting point, never an auto-send. Read it, make it sound like you, then send it.";

// ---------------------------------------------------------------------------
// Merge fields
// ---------------------------------------------------------------------------

/**
 * Every token a template may use. Kept as a closed union so a typo in a
 * template body is a missing-field warning at render, not a `{{firstNmae}}`
 * shipped to a member.
 */
export type MergeFieldId =
  | "firstName"
  | "fullName"
  | "coachName"
  | "coachFirstName"
  | "providerName"
  | "nextVisitDate"
  | "protocolName"
  | "clinicName"
  | "clinicPhone";

export interface MergeFieldDef {
  id: MergeFieldId;
  label: string;
  /** Where the value actually comes from — no invented data anywhere. */
  source: string;
}

export const MERGE_FIELDS: MergeFieldDef[] = [
  { id: "firstName", label: "First name", source: "client.firstName" },
  { id: "fullName", label: "Full name", source: "client.firstName + lastName" },
  { id: "coachName", label: "Coach name", source: "staff[client.coachId].name" },
  { id: "coachFirstName", label: "Coach first name", source: "staff[client.coachId].name" },
  { id: "providerName", label: "Provider name", source: "staff[client.providerId].name" },
  { id: "nextVisitDate", label: "Next visit", source: "client.nextAppointment" },
  { id: "protocolName", label: "Protocol", source: "client.programs[] (active)" },
  { id: "clinicName", label: "Clinic", source: "locations[client.locationId].short" },
  { id: "clinicPhone", label: "Clinic phone", source: "locations[client.locationId].phone" },
];

export type MergeValues = Partial<Record<MergeFieldId, string>>;

/**
 * Resolve every merge field from the real client record.
 *
 * A field with no value is left ABSENT rather than defaulted to an empty
 * string. That distinction is the whole design: an unbooked follow-up must
 * surface as a visible hole the coach has to fill, not as
 * "See you on ." going out to two hundred people. `renderTemplate` turns each
 * absence into a bracketed placeholder and reports it in `unresolved`.
 */
export function mergeValuesFor(clientId: string): MergeValues {
  const client = getClient(clientId);
  if (!client) return {};

  const coach = client.coachId ? staffMap[client.coachId] : undefined;
  const location = locationMap[client.locationId];

  // The protocol the member is actually on right now. A completed or paused
  // program is not "your protocol" and must never be named as though it were.
  const activeProgram = client.programs.find((p) => p.status === "Active");

  const values: MergeValues = {
    firstName: client.firstName,
    fullName: clientName(client),
    clinicName: location?.short,
    clinicPhone: location?.phone,
  };

  if (coach) {
    values.coachName = coach.name;
    // "Dr. Marcus Vale" -> "Marcus". A text signed "Dr." reads like a bill.
    values.coachFirstName = coach.name.replace(/^Dr\.\s+/, "").split(" ")[0];
  }
  if (client.providerId) values.providerName = staffName(client.providerId);
  if (client.nextAppointment) values.nextVisitDate = formatDate(client.nextAppointment);
  if (activeProgram) values.protocolName = activeProgram.name;

  return values;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export type TemplateId =
  | "labs-ready"
  | "protocol-starting"
  | "refill-shipping"
  | "missed-checkin"
  | "book-followup"
  | "side-effect-check"
  | "welcome"
  | "re-engagement"
  | "holiday-cover";

export interface MessageTemplate {
  id: TemplateId;
  /** What a coach would call it out loud. */
  name: string;
  /** The situation, in one line, so the picker is scannable without opening. */
  situation: string;
  /** Which regime governs this message. Handed straight to the send guard. */
  scope: ConsentScope;
  /** Why this scope and not the neighbouring one — the judgement call, written down. */
  scopeNote: string;
  channel: ContactChannel;
  /** Email / portal only. */
  subject?: string;
  body: string;
  /** Fields this template genuinely needs; drives the unresolved warning. */
  requires: MergeFieldId[];
  /** What the coach should change before sending. Never blank — see below. */
  editHint: string;
}

/**
 * `editHint` is mandatory on every template for a reason.
 *
 * A template that arrives with no instruction to edit reads as finished, and a
 * finished-looking draft gets sent unread. Naming the one thing that must
 * change per member ("say which marker moved", "say what you actually
 * noticed") is what keeps these from becoming mail-merge.
 */
export const TEMPLATES: MessageTemplate[] = [
  {
    id: "labs-ready",
    name: "Labs are back",
    situation: "Panel resulted and the provider has reviewed it.",
    scope: "clinical",
    scopeNote:
      "Clinical: naming a member's lab panel is PHI. Sent by portal message because portal is the encrypted channel and is the one clinical grant every member holds — so this template is deliverable even when a member has refused clinical SMS.",
    channel: "Portal message",
    subject: "Your lab results are ready",
    body:
      "Hi {{firstName}},\n\n" +
      "Your panel is back and {{providerName}} has already reviewed it. Everything is in your portal now, along with a plain-English summary of what each marker means.\n\n" +
      "Nothing needs to change before we talk. Bring your questions to {{nextVisitDate}} and we'll go through it together — I'd rather walk you through it than have you decode it alone.\n\n" +
      "— {{coachFirstName}}",
    requires: ["firstName", "providerName", "nextVisitDate", "coachFirstName"],
    editHint:
      "Say which one or two markers you actually want to discuss. A member who is told 'results are ready' with no hook reads it as admin and does not open it.",
  },
  {
    id: "protocol-starting",
    name: "Protocol starting",
    situation: "Plan approved, member is about to begin.",
    scope: "clinical",
    scopeNote:
      "Clinical: names the member's protocol and their care plan.",
    channel: "Email",
    subject: "Getting started — what to expect",
    body:
      "Hi {{firstName}},\n\n" +
      "{{providerName}} has approved your plan and you're starting {{protocolName}}. Your exact instructions — what to take, when, and how — are in your portal under Plan of Care. Please follow those and not anything you read elsewhere, including this email.\n\n" +
      "What I'd ask from you in the first few weeks: keep it consistent, log how you're feeling, and tell me early if something feels off. Consistency is the part that actually moves, and it's the part you control.\n\n" +
      "If anything worries you, call the clinic on {{clinicPhone}} — you don't need to wait for {{nextVisitDate}}.\n\n" +
      "— {{coachFirstName}}",
    requires: ["firstName", "providerName", "protocolName", "clinicPhone", "nextVisitDate", "coachFirstName"],
    editHint:
      "Do not add dosing here — the plan of care is the single source for that. Add the one behavioural thing you want them focused on in week one.",
  },
  {
    id: "refill-shipping",
    name: "Refill going out",
    situation: "Order is shipping this week.",
    scope: "operational",
    scopeNote:
      "Operational: shipment logistics with no clinical detail. Deliberately NOT marketing — a member who opts out of promotions still expects to be told their order shipped, and conflating the two is how the audited system taught members to distrust it.",
    channel: "SMS",
    body:
      "{{firstName}} — your refill is going out this week. You'll get tracking from the pharmacy as soon as it's scanned, and it's visible in your Apex portal too.\n\n" +
      "If the delivery window doesn't work for you, reply here and we'll sort it. — {{coachFirstName}}",
    requires: ["firstName", "coachFirstName"],
    editHint:
      "If this shipment is cold-chain or the address is new, say so explicitly. A generic shipping text is why a $600 box sits on a porch.",
  },
  {
    id: "missed-checkin",
    name: "Missed check-in",
    situation: "Member has gone quiet on a scheduled check-in.",
    scope: "clinical",
    scopeNote:
      "Clinical: it asks about how they are doing on their plan, which is a health question. If you only need to rebook a slot and will say nothing clinical, use 'Book a follow-up' instead — that one is operational and reaches more members.",
    channel: "SMS",
    body:
      "{{firstName}} — {{coachFirstName}} here. Missed you at check-in, no problem at all.\n\n" +
      "No pressure and nothing to catch up on. When you have a minute, tell me how the last couple of weeks have gone — good, bad, or nothing to report. If life is busy or you're travelling, just say so and we'll pick it up when you're back.",
    requires: ["firstName", "coachFirstName"],
    editHint:
      "Do not imply they have lost ground or fallen behind. If a provider told them to pause, acknowledge that instead of nudging.",
  },
  {
    id: "book-followup",
    name: "Book a follow-up",
    situation: "Follow-up is due and nothing is on the calendar.",
    scope: "operational",
    scopeNote:
      "Operational: scheduling logistics only. Keep it that way — the moment you add why the visit matters clinically, this becomes a clinical send and needs clinical consent.",
    channel: "SMS",
    body:
      "Hi {{firstName}} — you're due for a follow-up at {{clinicName}} and I don't see one booked yet.\n\n" +
      "Grab any slot that suits you in the portal, or call {{clinicPhone}} and the front desk will find you one. — {{coachFirstName}}",
    requires: ["firstName", "clinicName", "clinicPhone", "coachFirstName"],
    editHint:
      "If you know two times that work for them, offer those two. An open-ended 'book anytime' converts far worse than a choice of two.",
  },
  {
    id: "side-effect-check",
    name: "Side-effect check",
    situation: "Following up on something the member reported.",
    scope: "clinical",
    scopeNote: "Clinical: discusses symptoms.",
    channel: "SMS",
    body:
      "{{firstName}} — following up on what you mentioned. How is it now: gone, the same, or worse?\n\n" +
      "If it's worse, or you've got anything new, tell me and I'll get it in front of {{providerName}} today. Don't change anything on your own first — call {{clinicPhone}} and we'll tell you what to do.\n\n" +
      "If you ever feel genuinely unwell, that's urgent care or 911, not a text to me. — {{coachFirstName}}",
    requires: ["firstName", "providerName", "clinicPhone", "coachFirstName"],
    editHint:
      "Name the specific thing they reported, in their words. 'What you mentioned' tells a member you did not read their message.",
  },
  {
    id: "welcome",
    name: "Welcome",
    situation: "New member, first contact from their coach.",
    scope: "operational",
    scopeNote:
      "Operational: introduces the relationship and the logistics. It names no health information, so it reaches a member before their clinical consent has even been filed.",
    channel: "SMS",
    body:
      "{{firstName}} — {{coachFirstName}} here, I'm your coach at {{clinicName}}.\n\n" +
      "My job is the day-to-day: keeping things simple, answering the questions you'd rather not sit on until your next visit, and making sure nothing falls through. {{providerName}} handles anything medical.\n\n" +
      "Save this number. First thing: your visit is {{nextVisitDate}} — anything you want me to have ready for it?",
    requires: ["firstName", "coachFirstName", "clinicName", "providerName", "nextVisitDate"],
    editHint:
      "Add one line about why they came in, from their intake. A welcome that could have gone to anyone is worth roughly nothing.",
  },
  {
    id: "re-engagement",
    name: "Re-engagement",
    situation: "Lapsed or inactive member you'd like back.",
    scope: "marketing",
    scopeNote:
      "MARKETING, and this is the expensive one. Winning back a lapsed member is promotional contact under the TCPA and needs prior express written consent — statutory damages are per message. If the member is still in active care and this is about their plan rather than about returning, it is not this template: use 'Missed check-in'.",
    channel: "Email",
    subject: "The door's open whenever you are",
    body:
      "Hi {{firstName}},\n\n" +
      "It's been a while. No pitch here and nothing you need to do — I just didn't want you to think the door closed behind you.\n\n" +
      "If you'd like to pick things up, reply and I'll sort the rest. If you'd rather we left you alone, the unsubscribe link below works and I won't take it personally.\n\n" +
      "— {{coachFirstName}}, {{clinicName}}",
    requires: ["firstName", "coachFirstName", "clinicName"],
    editHint:
      "Never imply they lost progress or wasted their money. Loss framing about someone's body is manipulative and it is the reason people do not come back.",
  },
  {
    id: "holiday-cover",
    name: "Holiday cover",
    situation: "Coach is away; someone else is covering.",
    scope: "operational",
    scopeNote:
      "Operational: it is a staffing and availability notice, not a clinical one.",
    channel: "SMS",
    body:
      "{{firstName}} — heads up, I'm away and back shortly. Nothing changes for you.\n\n" +
      "While I'm out, the team at {{clinicName}} has your file and is watching this thread. For anything at all, call {{clinicPhone}} — someone will pick up who knows where you're up to.\n\n" +
      "— {{coachFirstName}}",
    requires: ["firstName", "clinicName", "clinicPhone", "coachFirstName"],
    editHint:
      "Name the actual person covering and the dates. 'The team' is what members hear as 'nobody'.",
  },
];

export const TEMPLATE_BY_ID: Record<TemplateId, MessageTemplate> = Object.fromEntries(
  TEMPLATES.map((t) => [t.id, t]),
) as Record<TemplateId, MessageTemplate>;

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const TOKEN = /\{\{(\w+)\}\}/g;

export interface RenderedTemplate {
  template: MessageTemplate;
  /** Resolved body, ready to be edited. */
  text: string;
  subject?: string;
  scope: ConsentScope;
  channel: ContactChannel;
  /**
   * Fields the record could not supply. Non-empty means the draft has visible
   * holes and must not be sent as-is — the UI blocks on this rather than
   * warning about it.
   */
  unresolved: MergeFieldId[];
}

/** What an unresolved field renders as. Loud on purpose — you cannot miss it. */
function placeholder(field: MergeFieldId): string {
  const def = MERGE_FIELDS.find((f) => f.id === field);
  return `[${def?.label ?? field} — not on file]`;
}

function fill(source: string, values: MergeValues, unresolved: Set<MergeFieldId>): string {
  return source.replace(TOKEN, (whole, raw: string) => {
    const key = raw as MergeFieldId;
    // A token nobody defined is a template bug, not a data gap. Leave it
    // untouched and visible rather than silently deleting it — a template that
    // quietly swallows its own typos never gets fixed.
    if (!MERGE_FIELDS.some((f) => f.id === key)) return whole;
    const value = values[key];
    if (value === undefined || value.length === 0) {
      unresolved.add(key);
      return placeholder(key);
    }
    return value;
  });
}

/**
 * Resolve a template against a real member record.
 *
 * Returns text for a human to edit. It does not send, queue, or schedule
 * anything — see the module docblock.
 */
export function renderTemplate(templateId: TemplateId, clientId: string): RenderedTemplate | undefined {
  const template = TEMPLATE_BY_ID[templateId];
  if (!template) return undefined;

  const values = mergeValuesFor(clientId);
  const unresolved = new Set<MergeFieldId>();

  const text = fill(template.body, values, unresolved);
  const subject = template.subject ? fill(template.subject, values, unresolved) : undefined;

  // A field the template declares as required but never actually references
  // still counts as missing — that is the case where a coach must go fix the
  // record rather than delete the sentence.
  for (const field of template.requires) {
    const v = values[field];
    if (v === undefined || v.length === 0) unresolved.add(field);
  }

  return {
    template,
    text,
    subject,
    scope: template.scope,
    channel: template.channel,
    unresolved: [...unresolved],
  };
}

/**
 * Templates that make sense for this member right now, best first.
 *
 * Ranking, not filtering. Every template stays reachable — a coach's reason for
 * reaching for the "unlikely" one is exactly the reason a rule engine would
 * never have guessed.
 */
export function suggestTemplates(clientId: string): MessageTemplate[] {
  const client = getClient(clientId);
  if (!client) return TEMPLATES;

  const preferred: TemplateId[] = [];
  switch (client.status) {
    case "Results Ready":
      preferred.push("labs-ready");
      break;
    case "Plan Review":
      preferred.push("protocol-starting", "labs-ready");
      break;
    case "Follow-Up Due":
      preferred.push("book-followup", "missed-checkin");
      break;
    case "Active Protocol":
      preferred.push("side-effect-check", "missed-checkin", "refill-shipping");
      break;
    case "Lead":
    case "Consult Booked":
      preferred.push("welcome");
      break;
    case "Inactive":
      preferred.push("re-engagement");
      break;
    default:
      break;
  }

  const rank = new Map(preferred.map((id, i) => [id, i]));
  return [...TEMPLATES].sort(
    (a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99),
  );
}
