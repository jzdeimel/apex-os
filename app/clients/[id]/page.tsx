"use client";

import { useState } from "react";
import { useParams, useSearchParams, notFound } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { getClient, clientName } from "@/lib/mock/clients";
import { getLabsForClient } from "@/lib/mock/labs";
import { getScanForClient } from "@/lib/mock/bodyscans";
import { recommendationsForClient } from "@/lib/mock/recommendations";
import { timelineForClient } from "@/lib/mock/timeline";
import { appointmentsForClient } from "@/lib/mock/appointments";
import { membershipForClient } from "@/lib/mock/memberships";
import { clientInsights } from "@/lib/aiInsights";
import { alphaScore, scoreColor } from "@/lib/alphaScore";
import { AlphaScoreRing } from "@/components/AlphaScoreRing";
import { FavoriteStar } from "@/components/FavoriteStar";
import { LabUploadSim } from "@/components/LabUploadSim";
import { staffName, staffMap } from "@/lib/mock/staff";
import { locationName } from "@/lib/mock/locations";
import { formatDate, formatDateTime, currency, relativeDays } from "@/lib/utils";
import { Tabs } from "@/components/ui/Tabs";
import { SwitchView } from "@/components/motion";
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, EmptyState } from "@/components/ui/primitives";
import { ClientStatusBadge } from "@/components/StatusBadge";
import { RiskBadge } from "@/components/RiskBadge";
import { Monogram } from "@/components/Monogram";
import { Disclaimer, AiLabel } from "@/components/Disclaimer";
import { LabTable } from "@/components/LabTable";
import { TitrationAssistant } from "@/components/clinic/TitrationAssistant";
import { HematocritTracker } from "@/components/clinic/HematocritTracker";
import { WomensHealthPanel } from "@/components/clinic/WomensHealthPanel";
import { SexualHealthPanel } from "@/components/clinic/SexualHealthPanel";
import { RecommendationCard } from "@/components/RecommendationCard";
import { AiDraftPanel } from "@/components/AiDraftPanel";
import { ProtocolScheduleBuilder } from "@/components/ProtocolScheduleBuilder";
import { Timeline } from "@/components/Timeline";
import { TrendLine, TrendArea, RadarStat } from "@/components/charts";
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Stethoscope,
  Target,
  Activity,
  Sparkles,
  CalendarClock,
  Plus,
  CheckCircle2,
  Circle,
  StickyNote,
  Database,
} from "lucide-react";
import type { TaskType } from "@/lib/types";
import {
  PlanTab,
  ConsultsTab,
  OrdersTab,
  ContactTab,
} from "@/components/client/ClientTabs";
import { ClientEscalations } from "@/components/escalations/CoachEscalationStatus";
import { TimeMachine } from "@/components/trace/TimeMachine";
import { SinceYouLastLooked } from "@/components/client/SinceYouLastLooked";
import { VIEWER } from "@/lib/viewer";
import { usePortal } from "@/lib/portalStore";
import { canViewClient, staffIdForPortal } from "@/lib/access/clientScope";
import { ShieldAlert } from "lucide-react";
import { BreakGlassChallenge, BreakGlassBanner } from "@/components/access/BreakGlass";
import { useBreakGlass } from "@/lib/access/breakGlass";

/**
 * One record, one page — and the SAME page for Coach and Medical.
 *
 * The system Apex replaces gates this by role: a coach cannot open the plan of
 * care, the H&P, or the intake form, because `canViewClinical` is restricted to
 * MEDICAL and owners. That is the largest opacity failure in the product. The
 * coach still has to coach off that plan; the gate just forces them to phone
 * someone to find out what is in it.
 *
 * Here every tab renders for both roles. What narrows is authorship — see
 * lib/authz/capabilities.ts. The dose is the line; reading is not.
 */
const TABS = [
  { id: "overview", label: "Overview" },
  { id: "plan", label: "Plan of Care" },
  { id: "consults", label: "Consults" },
  { id: "escalations", label: "Escalations" },
  { id: "labs", label: "Labs" },
  { id: "scan", label: "Body Scan" },
  { id: "recs", label: "Recommendations" },
  { id: "schedule", label: "Protocol Schedule" },
  { id: "orders", label: "Orders" },
  { id: "contact", label: "Contact Log" },
  { id: "timeline", label: "Timeline" },
  { id: "replay", label: "Time machine" },
  { id: "tasks", label: "Tasks" },
  { id: "notes", label: "Notes" },
];

export default function ClientProfilePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = String(params.id);
  const client = getClient(id);
  const { portal } = usePortal();
  // Honour a ?tab= deep link (used by the Demo Guide to jump straight to a tab
  // like Titration or Women's Health) — falls back to overview.
  const [tab, setTab] = useState(searchParams.get("tab") || "overview");

  // NOTE: the `!client` return happens AFTER useBreakGlass below — an early
  // return above a hook changes the hook count between renders and throws
  // "Rendered fewer hooks than expected". (react-hooks/rules-of-hooks, which CI
  // was masking.) The hook only needs the route id, which is always present.

  // AUDIT: the chart rendered for any client id regardless of the viewer's
  // location. A boundary that filters lists but opens any chart by URL is a
  // speed bump, not a boundary — so an out-of-location patient refuses here.
  // The refusal names the location rather than pretending the record does not
  // exist, because "you cannot see this" is honest and "404" is a lie that
  // wastes a clinician's time.
  // Applies to EVERYONE without a location claim to this patient, patient
  // persona included — /clients/[id] is a staff chart, and a patient reaching it
  // by URL has no business seeing it. staffIdForPortal("patient") is null, which
  // canViewClient resolves to no access, so this one predicate covers both the
  // wrong-location clinician and the patient who should not be here at all.
  const staffId = staffIdForPortal(portal.id);
  // Break-glass is the sanctioned exception to the location boundary. The gate
  // below offers it; an open window lets the chart through with a banner.
  const CHART_NOW = "2026-06-12T09:00:00";
  const { open: glassOpen, breakTheGlass } = useBreakGlass(staffId, id, CHART_NOW);

  // Every hook has run; an unknown id can now 404 safely.
  if (!client) return notFound();

  // A patient reaching a staff chart is refused outright with no override —
  // break-glass is for STAFF whose care requires an out-of-location record, not
  // a path for a patient onto the clinical chart.
  const canGlass = staffId !== null;

  if (!canViewClient(staffId, id) && !glassOpen) {
    return canGlass ? (
      <BreakGlassChallenge clientId={id} onBreak={breakTheGlass} />
    ) : (
      <div className="mx-auto max-w-md rounded-panel border border-ink-800 bg-ink-900/40 px-6 py-10 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-watch" aria-hidden />
        <h1 className="mt-3 text-heading text-ink-50">Not available here</h1>
        <p className="mt-2 text-detail leading-relaxed text-ink-400">
          This is a staff record. Your own health record is in your portal.
        </p>
      </div>
    );
  }

  // Break-glass is active for this staff member on this chart.
  const inBreakGlass = glassOpen && !canViewClient(staffId, id);

  const labs = getLabsForClient(id);
  const scan = getScanForClient(id);
  const recs = recommendationsForClient(id);

  // Titration is prescriber decision-support, so it belongs to the medical
  // surface and the owner — not the coach, and never the patient. Gated by the
  // portal identity the same way the rest of the chart is, so a coach who
  // break-glasses in still does not get a dose-direction console.
  const canTitrate = portal.id === "clinic" || portal.id === "exec";
  // The hormone decision-support tab is SEX-SPECIFIC: men get testosterone
  // titration, women get the HRT / menopause panel. Same clinic/owner gate.
  const hormoneTab =
    client.sex === "female"
      ? { id: "womens-health", label: "Women's Health" }
      : { id: "titration", label: "Titration" };
  const shownTabs = canTitrate ? [...TABS.slice(0, 5), hormoneTab, ...TABS.slice(5)] : TABS;
  const tabsWithCounts = shownTabs.map((t) => ({
    ...t,
    count:
      t.id === "recs" ? recs.length : t.id === "labs" ? labs?.biomarkers.length : undefined,
  }));

  return (
    <div className="space-y-5">
      {/* Break-glass banner rides ABOVE everything, so a screenshot of any tab
          carries the evidence that this was emergency access. */}
      {inBreakGlass && <BreakGlassBanner clientId={id} />}

      <Link href="/clients" className="inline-flex items-center gap-1.5 text-detail text-ink-400 hover:text-ink-100">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to clients
      </Link>

      {/* What changed since THIS staff member last opened this chart. Above the
          hero deliberately: a coach returning after three weeks should be told
          what moved before they start reading, not after. */}
      {/* staffId, not VIEWER.id. VIEWER.id is "st-owner", which is never a
          ledger actor (the chain seeds actors from st-001..st-024), so
          lastViewedBy() returned null for every chart forever and this always
          fell into its first-look branch — rendering the raw id as a name:
          "st-owner has no prior view of Jake's record." on every chart in the
          clinic. staffIdForPortal() is already computed above. */}
      {staffId && <SinceYouLastLooked clientId={id} staffId={staffId} />}

      {/* Hero */}
      <ProfileHero id={id} />

      <Tabs tabs={tabsWithCounts} active={tab} onChange={setTab} />

      <SwitchView k={tab}>
        {tab === "overview" && <OverviewTab id={id} />}
        {tab === "labs" && <LabsTab id={id} />}
        {tab === "titration" && canTitrate && (
          <div className="space-y-6">
            <TitrationAssistant clientId={id} />
            <HematocritTracker clientId={id} />
            <SexualHealthPanel clientId={id} />
          </div>
        )}
        {tab === "womens-health" && canTitrate && (
          <div className="space-y-6">
            <WomensHealthPanel clientId={id} />
            <SexualHealthPanel clientId={id} />
          </div>
        )}
        {tab === "scan" && <ScanTab id={id} />}
        {tab === "recs" && <RecsTab id={id} />}
        {tab === "schedule" && <ProtocolScheduleBuilder client={client} />}
        {tab === "timeline" && (
          <Card className="p-5">
            <Timeline events={timelineForClient(id)} />
          </Card>
        )}
        {tab === "tasks" && <TasksTab id={id} />}
        {tab === "plan" && <PlanTab id={id} />}
        {tab === "consults" && <ConsultsTab id={id} />}
        {tab === "escalations" && <ClientEscalations clientId={id} />}
        {tab === "replay" && <TimeMachine clientId={id} />}
        {tab === "orders" && <OrdersTab id={id} />}
        {tab === "contact" && <ContactTab id={id} />}
        {tab === "notes" && <NotesTab id={id} />}
      </SwitchView>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------
function ProfileHero({ id }: { id: string }) {
  const client = getClient(id)!;
  const score = alphaScore(client);
  const nextAppt = appointmentsForClient(id).find((a) => a.start >= "2026-06-12");
  const activeProgram = client.programs.find((p) => p.status === "Active");
  const topRisk = client.riskFlags
    .slice()
    .sort((a, b) => ({ high: 3, moderate: 2, low: 1, none: 0 })[b.level] - ({ high: 3, moderate: 2, low: 1, none: 0 })[a.level])[0];

  const tiles: { label: string; value: React.ReactNode; tone?: string }[] = [
    { label: "Status", value: <ClientStatusBadge status={client.status} /> },
    { label: "Next visit", value: nextAppt ? relativeDays(nextAppt.start) : "Not booked" },
    { label: "Program", value: activeProgram ? activeProgram.name : "None active" },
    { label: "Plan", value: client.planStatus },
    { label: "Latest labs", value: client.latestLabDate ? formatDate(client.latestLabDate) : "Pending" },
    { label: "Risk", value: topRisk ? <RiskBadge level={topRisk.level} /> : <RiskBadge level="none" /> },
  ];

  return (
    <div className="relative overflow-hidden rounded-3xl border border-ink-700/70 bg-ink-850/80 shadow-card">
      {/* gradient banner */}
      <div
        className="absolute inset-x-0 top-0 h-28"
        style={{ background: `linear-gradient(120deg, ${client.avatarColor}33, transparent 55%)` }}
      />
      <div className="relative p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            <Monogram client={client} size="lg" />
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="font-display text-title font-bold tracking-tight text-ink-50">{clientName(client)}</h1>
                <FavoriteStar clientId={client.id} size={18} />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-detail text-ink-400">
                <span>{client.age} yrs · {client.sex === "male" ? "Male" : "Female"}</span>
                <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {locationName(client.locationId)}</span>
                <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {client.email}</span>
                <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {client.phone}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-ink-800 bg-ink-900/50 px-4 py-2.5">
            <AlphaScoreRing result={score} size={64} />
          </div>
        </div>

        {/* vital tiles */}
        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-xl border border-ink-800 bg-ink-900/40 px-3 py-2.5">
              <span className="block text-micro uppercase tracking-wide text-ink-500">{t.label}</span>
              <span className="mt-1 block truncate text-body font-medium text-ink-100">{t.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------
function OverviewTab({ id }: { id: string }) {
  const client = getClient(id)!;
  const membership = membershipForClient(id);
  const appts = appointmentsForClient(id).filter((a) => a.start >= "2026-06-12");
  const recs = recommendationsForClient(id);
  const approved = recs.filter((r) => r.status === "provider approved");
  const labs = getLabsForClient(id);
  const flagged = labs?.biomarkers.filter((b) => b.status !== "optimal").length ?? 0;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        {/* AI summary */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-gold-400" /> AI summary</CardTitle>
            <AiLabel />
          </CardHeader>
          <CardContent>
            <p className="text-body leading-relaxed text-ink-300">
              {clientName(client)} is a {client.age}-year-old {client.sex} at {locationName(client.locationId)} focused on{" "}
              <span className="text-ink-100">{client.goals.join(", ").toLowerCase()}</span>.
              {labs
                ? ` Latest Alpha Base Panel (${formatDate(client.latestLabDate)}) shows ${flagged} markers outside optimal range.`
                : " No labs on file yet."}
              {recs.length
                ? ` ${recs.length} AI-assisted recommendation${recs.length > 1 ? "s" : ""} generated for review, ${approved.length} provider-approved.`
                : ""}{" "}
              Current plan status: <span className="text-ink-100">{client.planStatus}</span>. Protocol details added by provider.
            </p>
            <Disclaimer className="mt-3" compact />
          </CardContent>
        </Card>

        {/* Alpha Score breakdown */}
        <AlphaScoreCard id={id} />

        {/* Goals + symptoms */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Target className="h-4 w-4 text-gold-400" /> Goals</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {client.goals.map((g) => <Badge key={g} tone="gold">{g}</Badge>)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4 text-low" /> Symptoms</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {client.symptoms.map((s) => <Badge key={s} tone="info">{s}</Badge>)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Programs + approved protocols */}
        <Card>
          <CardHeader><CardTitle>Active programs &amp; approved protocols</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {client.programs.length === 0 && approved.length === 0 && (
              <EmptyState title="No active programs or approved protocols yet" />
            )}
            {client.programs.map((p) => (
              <div key={p.name} className="flex items-center justify-between rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-2">
                <div>
                  <span className="text-body font-medium text-ink-100">{p.name}</span>
                  <span className="block text-detail text-ink-500">{p.category} · started {formatDate(p.startedOn)}</span>
                </div>
                <Badge tone={p.status === "Active" ? "optimal" : "neutral"}>{p.status}</Badge>
              </div>
            ))}
            {approved.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border border-optimal/20 bg-optimal/[0.05] px-3 py-2">
                <div>
                  <span className="text-body font-medium text-ink-100">{r.title}</span>
                  <span className="block text-detail text-ink-500">Provider approved · details added by provider</span>
                </div>
                <Badge tone="optimal">Approved</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Right column */}
      <div className="space-y-5">
        <AiSnapshot id={id} />

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Stethoscope className="h-4 w-4 text-gold-400" /> Care team</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-body">
            <TeamRow label="Provider" staffId={client.providerId} />
            <TeamRow label="Coach" staffId={client.coachId} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-gold-400" /> Upcoming appointments</CardTitle></CardHeader>
          <CardContent>
            {appts.length === 0 ? (
              <EmptyState title="None scheduled" />
            ) : (
              <div className="space-y-2">
                {appts.map((a) => (
                  <div key={a.id} className="rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-body font-medium text-ink-100">{a.type}</span>
                      <Badge tone="info">{relativeDays(a.start)}</Badge>
                    </div>
                    <span className="text-detail text-ink-500">{formatDateTime(a.start)} · {staffName(a.staffId)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {membership && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-4 w-4 text-gold-400" /> Membership
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-body">
              <Row label="Record no." value={<span className="stat-mono">{client.mrn}</span>} />
              <Row label="Plan" value={membership.tier} />
              <Row
                label="Status"
                value={
                  <Badge
                    tone={
                      membership.status === "Active"
                        ? "optimal"
                        : membership.status === "Paused"
                          ? "watch"
                          : "high"
                    }
                  >
                    {membership.status}
                  </Badge>
                }
              />
              <Row
                label="Billing"
                value={
                  membership.monthlyRate > 0 ? (
                    <span className="stat-mono">{currency(membership.monthlyRate)}/mo</span>
                  ) : (
                    "Pay per visit"
                  )
                }
              />
              {membership.renewsOn && <Row label="Renews" value={formatDate(membership.renewsOn)} />}
              <Row label="Visits YTD" value={<span className="stat-mono">{membership.visitsYTD}</span>} />
              <Row
                label="Lifetime spend"
                value={<span className="stat-mono">{currency(membership.lifetimeSpend)}</span>}
              />
              {/* No sync row. Apex owns this record, so there is nothing to
                  reconcile against and no state in which it can be "Conflict". */}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function AlphaScoreCard({ id }: { id: string }) {
  const client = getClient(id)!;
  const result = alphaScore(client);
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-gold-400" /> Alpha Score</CardTitle>
        <AiLabel />
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-ink-800 bg-ink-900/40 p-4">
            <AlphaScoreRing result={result} size={104} showLabel={false} />
            <span className="text-body font-medium" style={{ color: scoreColor(result.band) }}>{result.label}</span>
            <div className="w-full">
              <TrendLine data={result.trend} height={70} />
            </div>
          </div>
          <div>
            {result.hasLabs ? (
              <RadarStat
                data={result.domains.map((d) => ({ axis: d.name, value: d.score }))}
                color={scoreColor(result.band)}
                height={210}
              />
            ) : (
              <p className="text-body text-ink-500">Provisional score — order the Alpha Base Panel to compute a full domain breakdown.</p>
            )}
          </div>
        </div>
        <p className="mt-3 text-micro text-ink-600">Composite of biomarker domains, body composition &amp; risk flags. Visualization only — not a diagnosis.</p>
      </CardContent>
    </Card>
  );
}

function AiSnapshot({ id }: { id: string }) {
  const client = getClient(id)!;
  const { triage, nba, churn } = clientInsights(client);
  const triageTone = triage.level === "critical" ? "high" : triage.level === "high" ? "watch" : "gold";
  const churnTone = churn.level === "high" ? "high" : churn.level === "medium" ? "watch" : "optimal";
  return (
    <Card className="border-gold-400/25 bg-gradient-to-br from-gold-400/[0.06] to-transparent">
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-gold-400" /> AI snapshot</CardTitle>
        <AiLabel />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-2">
            <span className="block text-micro uppercase tracking-wide text-ink-600">Triage</span>
            <div className="flex items-center gap-1.5">
              <span className="stat-mono text-heading font-bold text-ink-50">{triage.score}</span>
              <Badge tone={triageTone}>{triage.level}</Badge>
            </div>
          </div>
          <div className="rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-2">
            <span className="block text-micro uppercase tracking-wide text-ink-600">Churn risk</span>
            <div className="flex items-center gap-1.5">
              <span className="stat-mono text-heading font-bold text-ink-50">{churn.score}</span>
              <Badge tone={churnTone}>{churn.level}</Badge>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-gold-400/20 bg-gold-400/[0.05] px-3 py-2">
          <span className="text-micro font-semibold uppercase tracking-wide text-gold-300">Next best action</span>
          <p className="mt-0.5 text-body text-ink-100">{nba.action}</p>
          <p className="text-micro text-ink-500">{nba.reason} · {nba.owner}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function TeamRow({ label, staffId }: { label: string; staffId: string }) {
  const s = staffMap[staffId];
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-ink-800 text-detail font-semibold text-ink-200">
        {s?.avatarInitials}
      </span>
      <div>
        <span className="block text-micro uppercase tracking-wide text-ink-600">{label}</span>
        <span className="text-body text-ink-100">{s?.name}{s?.credentials ? `, ${s.credentials}` : ""}</span>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-500">{label}</span>
      <span className="text-ink-200">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Labs
// ---------------------------------------------------------------------------
function LabsTab({ id }: { id: string }) {
  const labs = getLabsForClient(id);
  const [selected, setSelected] = useState<string | undefined>();

  if (!labs) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-ink-700 px-6 py-12 text-center">
          <Database className="h-7 w-7 text-ink-500" />
          <div>
            <p className="text-body font-medium text-ink-300">No labs on file</p>
            <p className="mt-1 text-detail text-ink-500">Order the Alpha Base Panel, or import an existing lab PDF to populate this tab.</p>
          </div>
          <LabUploadSim markerCount={28} label="See how lab import will work (demo)" />
        </div>
      </div>
    );
  }

  const selectedBm = labs.biomarkers.find((b) => b.key === selected) ?? labs.biomarkers.find((b) => b.history);
  const trendData = selectedBm?.history ?? [];

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <span className="font-display text-heading font-semibold text-ink-50">{labs.panelName}</span>
            <span className="ml-2 text-detail text-ink-500">collected {formatDate(labs.collectedOn)}</span>
          </div>
          <LabUploadSim markerCount={labs.biomarkers.length} />
        </div>
        <LabTable biomarkers={labs.biomarkers} selectedKey={selectedBm?.key} onSelect={setSelected} />
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader><CardTitle>Trend</CardTitle></CardHeader>
          <CardContent>
            {selectedBm && trendData.length > 0 ? (
              <>
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-body font-medium text-ink-100">{selectedBm.name}</span>
                  <span className="stat-mono text-body text-ink-300">{selectedBm.value} {selectedBm.unit}</span>
                </div>
                <TrendLine
                  data={trendData}
                  unit={selectedBm.unit}
                  optimalLow={selectedBm.optimalLow}
                  optimalHigh={selectedBm.optimalHigh}
                />
                <p className="mt-2 text-micro text-ink-500">Shaded band = optimal range. Select any marker with a trend icon to view its history.</p>
              </>
            ) : (
              <EmptyState title="Select a flagged marker to see its trend" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-gold-400" /> Explain labs</CardTitle>
            <AiLabel />
          </CardHeader>
          <CardContent>
            <p className="text-body leading-relaxed text-ink-300">{labs.summary}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Body Scan
// ---------------------------------------------------------------------------
function ScanTab({ id }: { id: string }) {
  const scan = getScanForClient(id);
  if (!scan) {
    return <EmptyState icon={<Activity className="h-6 w-6" />} title="No body scan on file" hint="Complete an InBody scan to populate this tab." />;
  }
  const metrics = [
    { label: "Weight", value: `${scan.weightKg} kg`, },
    { label: "Body fat", value: `${scan.bodyFatPct}%` },
    { label: "Skeletal muscle", value: `${scan.skeletalMuscleKg} kg` },
    { label: "Visceral fat", value: `Level ${scan.visceralFatLevel}` },
    { label: "BMR", value: `${scan.bmr} kcal` },
    { label: "Total body water", value: `${scan.totalBodyWaterPct}%` },
  ];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {metrics.map((m) => (
          <Card key={m.label} className="p-4">
            <span className="label-eyebrow">{m.label}</span>
            <p className="mt-1.5 font-display text-title font-bold text-ink-50">{m.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Progress</CardTitle>
            <span className="text-detail text-ink-500">Last scan {formatDate(scan.scannedOn)} · {scan.device}</span>
          </CardHeader>
          <CardContent>
            <TrendArea
              data={(scan.history ?? []) as never}
              series={[
                { key: "weightKg", label: "Weight (kg)", color: "#e93d3d" },
                { key: "skeletalMuscleKg", label: "Muscle (kg)", color: "#34d399" },
                { key: "bodyFatPct", label: "Body fat (%)", color: "#60a5fa" },
              ]}
            />
            <div className="mt-2 flex flex-wrap gap-3 text-detail">
              <Legend color="#e93d3d" label="Weight (kg)" />
              <Legend color="#34d399" label="Skeletal muscle (kg)" />
              <Legend color="#60a5fa" label="Body fat (%)" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Segmental lean mass</CardTitle></CardHeader>
          <CardContent className="space-y-2.5">
            {scan.segmental.map((s) => (
              <div key={s.segment}>
                <div className="flex items-center justify-between text-detail">
                  <span className="text-ink-300">{s.segment}</span>
                  <span className="stat-mono text-ink-200">{s.massKg} kg</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-ink-700">
                  <div
                    className={
                      "h-full rounded-full " +
                      (s.rating === "low" ? "bg-low" : s.rating === "high" ? "bg-optimal" : "bg-gold-400")
                    }
                    style={{ width: `${Math.min(100, (s.massKg / 30) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-ink-400">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} /> {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------
function RecsTab({ id }: { id: string }) {
  const recs = recommendationsForClient(id);
  if (recs.length === 0) {
    return (
      <EmptyState
        icon={<Sparkles className="h-6 w-6" />}
        title="No recommendations generated"
        hint="The rule-based engine produces recommendations once labs, goals, and symptoms align."
      />
    );
  }
  return (
    <div className="space-y-4">
      <Disclaimer />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {recs.map((r) => (
          <RecommendationCard key={r.id} rec={r} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
const TASK_TYPES: TaskType[] = [
  "Call client",
  "Send lab reminder",
  "Review results",
  "Schedule follow-up",
  "Check inventory",
  "Provider approval needed",
];

function TasksTab({ id }: { id: string }) {
  const { tasks, addTask, toggleTask, activeStaffId } = useStore();
  const client = getClient(id)!;
  const clientTasks = tasks.filter((t) => t.clientId === id);
  const [type, setType] = useState<TaskType>("Call client");

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>Tasks</CardTitle></CardHeader>
        <CardContent>
          {clientTasks.length === 0 ? (
            <EmptyState title="No tasks for this client" />
          ) : (
            <div className="space-y-1.5">
              {clientTasks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => toggleTask(t.id)}
                  className="flex w-full items-center gap-3 rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-2.5 text-left transition-colors hover:border-ink-700"
                >
                  {t.done ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-optimal" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-ink-500" />
                  )}
                  <div className="min-w-0 flex-1">
                    <span className={"block text-body " + (t.done ? "text-ink-500 line-through" : "text-ink-100")}>{t.title}</span>
                    <span className="text-micro text-ink-500">{t.type} · due {formatDate(t.dueDate)}</span>
                  </div>
                  <Badge tone={t.priority === "high" ? "high" : t.priority === "medium" ? "watch" : "neutral"}>{t.priority}</Badge>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-4 w-4 text-gold-400" /> New task</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as TaskType)}
            className="h-9 w-full rounded-lg border border-ink-700 bg-ink-900/70 px-3 text-body text-ink-100 focus-ring"
          >
            {TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <Button
            variant="primary"
            className="w-full"
            onClick={() =>
              addTask({
                clientId: id,
                type,
                title: `${type} — ${clientName(client)}`,
                assigneeId: activeStaffId,
                dueDate: "2026-06-15T12:00:00",
                priority: type === "Provider approval needed" ? "high" : "medium",
                done: false,
              })
            }
          >
            <Plus className="h-3.5 w-3.5" /> Add task
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------
function NotesTab({ id }: { id: string }) {
  const { notes, addNote, role } = useStore();
  const clientNotes = notes.filter((n) => n.clientId === id);
  const [body, setBody] = useState("");

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        {clientNotes.length === 0 ? (
          <EmptyState icon={<StickyNote className="h-6 w-6" />} title="No notes yet" />
        ) : (
          clientNotes.map((n) => (
            <Card key={n.id} className={"p-4 " + (n.pinned ? "border-gold-400/30" : "")}>
              <div className="mb-1.5 flex items-center gap-2">
                <Badge tone={n.author === "AI" ? "gold" : n.author === "Provider" ? "optimal" : "info"}>{n.author}</Badge>
                {n.author === "AI" && <AiLabel />}
                {n.pinned && <Badge tone="watch">Pinned</Badge>}
                <span className="ml-auto stat-mono text-micro text-ink-500">{formatDateTime(n.createdAt)}</span>
              </div>
              <p className="text-body leading-relaxed text-ink-300">{n.body}</p>
            </Card>
          ))
        )}
      </div>

      <div className="space-y-5">
        <AiDraftPanel client={getClient(id)!} />
        <Card className="h-fit">
          <CardHeader><CardTitle>Add {role === "Medical" ? "provider" : "coach"} note</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="Write a note for this client's chart…"
              className="w-full rounded-lg border border-ink-700 bg-ink-900/70 px-3 py-2 text-body text-ink-100 placeholder:text-ink-500 focus-ring"
            />
            <Button
              variant="primary"
              className="w-full"
              disabled={!body.trim()}
              onClick={() => {
                addNote({ clientId: id, author: role === "Medical" ? "Provider" : "Coach", body: body.trim() });
                setBody("");
              }}
            >
              Save note
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
