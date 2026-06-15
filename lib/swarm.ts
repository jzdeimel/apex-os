// =============================================================================
// Apex — Agent Swarm orchestration engine (deterministic simulation, mock-only)
// A fleet of specialized AI agents runs multi-step clinic workflows, hands off
// tasks to one another, and escalates to humans at approval gates.
// No real LLM. Time advances on a simulated clock so SSR/hydration stay stable.
// Compliance rule: PROVIDER (clinical) gates ALWAYS require a human — even in
// full-autonomy mode. Only operational gates auto-approve.
// =============================================================================

import { clients, clientName } from "@/lib/mock/clients";
import { seededRandom } from "@/lib/utils";

export type AgentId =
  | "scout"
  | "concierge"
  | "phlebo"
  | "clio"
  | "sentinel"
  | "coach"
  | "quartermaster"
  | "ledger"
  | "atlas"
  | "echo";

export interface SwarmAgentDef {
  id: AgentId;
  name: string;
  role: string;
  icon: string; // lucide icon name, mapped in the component
  color: string;
}

export const AGENTS: SwarmAgentDef[] = [
  { id: "scout", name: "Scout", role: "Lead Intake", icon: "Radar", color: "#e93d3d" },
  { id: "concierge", name: "Concierge", role: "Scheduling", icon: "CalendarClock", color: "#60a5fa" },
  { id: "phlebo", name: "Phlebo", role: "Lab Orchestration", icon: "FlaskConical", color: "#a78bfa" },
  { id: "clio", name: "Clio", role: "Clinical AI", icon: "Brain", color: "#34d399" },
  { id: "sentinel", name: "Sentinel", role: "Compliance & Safety", icon: "ShieldCheck", color: "#f59e0b" },
  { id: "coach", name: "Coach", role: "Client Engagement", icon: "MessageSquare", color: "#2dd4bf" },
  { id: "quartermaster", name: "Quartermaster", role: "Supply Chain", icon: "Boxes", color: "#fb923c" },
  { id: "ledger", name: "Ledger", role: "Billing & Membership", icon: "Receipt", color: "#818cf8" },
  { id: "atlas", name: "Atlas", role: "Analytics", icon: "BarChart3", color: "#38bdf8" },
  { id: "echo", name: "Echo", role: "Retention", icon: "Repeat", color: "#f472b6" },
];

export const agentById = Object.fromEntries(AGENTS.map((a) => [a.id, a])) as Record<AgentId, SwarmAgentDef>;

export type GateKind = "provider" | "ops";

export interface StepDef {
  label: string;
  agent: AgentId;
  ticks: number; // how many sim ticks this step takes
  gate?: GateKind;
}

export interface WorkflowDef {
  id: string;
  name: string;
  trigger: string;
  color: string;
  steps: StepDef[];
}

export const WORKFLOWS: WorkflowDef[] = [
  {
    id: "onboarding",
    name: "New Patient Onboarding",
    trigger: "Lead created",
    color: "#e93d3d",
    steps: [
      { label: "Capture & enrich lead", agent: "scout", ticks: 2 },
      { label: "Book initial consult", agent: "concierge", ticks: 2 },
      { label: "Order Alpha Base Panel", agent: "phlebo", ticks: 2 },
      { label: "Ingest lab results", agent: "phlebo", ticks: 3 },
      { label: "Generate AI recommendations", agent: "clio", ticks: 3 },
      { label: "Run contraindication checks", agent: "sentinel", ticks: 2 },
      { label: "Provider approval", agent: "sentinel", ticks: 1, gate: "provider" },
      { label: "Send plan & welcome", agent: "coach", ticks: 2 },
    ],
  },
  {
    id: "resultsPlan",
    name: "Results → Plan",
    trigger: "Results ready",
    color: "#a78bfa",
    steps: [
      { label: "Verify resulted panel", agent: "phlebo", ticks: 2 },
      { label: "Generate recommendations", agent: "clio", ticks: 3 },
      { label: "Compliance & safety check", agent: "sentinel", ticks: 2 },
      { label: "Provider approval", agent: "sentinel", ticks: 1, gate: "provider" },
      { label: "Notify client of plan", agent: "coach", ticks: 2 },
    ],
  },
  {
    id: "reorder",
    name: "Inventory Reorder",
    trigger: "Stock ≤ reorder point",
    color: "#fb923c",
    steps: [
      { label: "Forecast demand", agent: "quartermaster", ticks: 2 },
      { label: "Compare third-party vendors", agent: "quartermaster", ticks: 2 },
      { label: "Draft purchase order", agent: "quartermaster", ticks: 2 },
      { label: "Ops approval", agent: "quartermaster", ticks: 1, gate: "ops" },
      { label: "Submit PO to vendor", agent: "quartermaster", ticks: 2 },
    ],
  },
  {
    id: "winback",
    name: "Churn Win-back",
    trigger: "Churn risk ↑",
    color: "#f472b6",
    steps: [
      { label: "Detect at-risk client", agent: "echo", ticks: 2 },
      { label: "Build outreach segment", agent: "atlas", ticks: 2 },
      { label: "Draft re-engagement message", agent: "coach", ticks: 2 },
      { label: "Marketing approval", agent: "coach", ticks: 1, gate: "ops" },
      { label: "Send win-back touch", agent: "coach", ticks: 2 },
    ],
  },
  {
    id: "renewal",
    name: "Membership Renewal",
    trigger: "Renews in 7 days",
    color: "#818cf8",
    steps: [
      { label: "Detect upcoming renewal", agent: "ledger", ticks: 2 },
      { label: "Send renewal reminder", agent: "coach", ticks: 2 },
      { label: "Process renewal", agent: "ledger", ticks: 2 },
    ],
  },
  {
    id: "refill",
    name: "Refill Check-in",
    trigger: "Protocol day 25 of 30",
    color: "#2dd4bf",
    steps: [
      { label: "Send check-in", agent: "coach", ticks: 2 },
      { label: "Re-order follow-up labs", agent: "phlebo", ticks: 2 },
      { label: "Adjust protocol draft", agent: "clio", ticks: 3 },
      { label: "Provider approval", agent: "sentinel", ticks: 1, gate: "provider" },
      { label: "Confirm next phase", agent: "coach", ticks: 2 },
    ],
  },
];

export const workflowById = Object.fromEntries(WORKFLOWS.map((w) => [w.id, w])) as Record<string, WorkflowDef>;

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

export type StepStatus = "pending" | "active" | "done" | "gate";
export interface RunStep {
  label: string;
  agent: AgentId;
  ticks: number;
  gate?: GateKind;
  status: StepStatus;
  progress: number; // 0..100
}
export type RunStatus = "running" | "awaiting" | "done";
export interface Run {
  id: string;
  workflowId: string;
  subject: string;
  steps: RunStep[];
  current: number;
  status: RunStatus;
  startedClock: number;
}

export type EventKind = "launch" | "handoff" | "complete" | "gate" | "approve" | "spawn" | "finish";
export interface SwarmEvent {
  id: number;
  clock: number;
  agent: AgentId | "human" | "system";
  text: string;
  kind: EventKind;
}

// A hand-off pulse for the network graph (agent A → agent B at a moment).
export interface Pulse {
  id: number;
  from: AgentId;
  to: AgentId;
  clock: number;
}

export interface SwarmState {
  clock: number; // simulated seconds since midnight
  paused: boolean;
  autonomy: boolean;
  runs: Run[];
  events: SwarmEvent[];
  pulses: Pulse[];
  completedToday: number;
  escalations: number; // provider gates that required a human
  autoApproved: number;
  agentTasks: Record<AgentId, number>;
  seq: number;
}

const TICK_SECONDS = 4;
const MAX_RUNS = 6;
const MAX_EVENTS = 60;
const MAX_PULSES = 18;
// Non-gate steps are stretched so progress bars visibly glide between ticks.
const STEP_SCALE = 2.4;

function makeRun(workflowId: string, subject: string, clock: number, id: string): Run {
  const wf = workflowById[workflowId];
  return {
    id,
    workflowId,
    subject,
    startedClock: clock,
    current: 0,
    status: "running",
    steps: wf.steps.map((s, i) => ({
      label: s.label,
      agent: s.agent,
      ticks: s.gate ? 1 : Math.max(3, Math.round(s.ticks * STEP_SCALE)),
      gate: s.gate,
      status: i === 0 ? "active" : "pending",
      progress: 0,
    })),
  };
}

function subjectFor(workflowId: string, n: number): string {
  if (workflowId === "reorder") {
    const items = ["BPC-157 · Raleigh", "Semaglutide · Myrtle Beach", "NAD+ · Myrtle Beach", "GHK-Cu · Myrtle Beach", "VIP nasal spray · Myrtle Beach", "Tirzepatide · Raleigh"];
    return items[n % items.length];
  }
  const c = clients[(n * 7) % clients.length];
  return clientName(c);
}

// Deterministic initial state — a few runs already in flight + seed history.
export function createInitialState(): SwarmState {
  const baseClock = 9 * 3600 + 12 * 60; // 09:12:00
  const agentTasks = Object.fromEntries(AGENTS.map((a) => [a.id, 0])) as Record<AgentId, number>;
  // seed some throughput
  const seedCounts: Partial<Record<AgentId, number>> = { scout: 38, concierge: 31, phlebo: 27, clio: 22, sentinel: 19, coach: 44, quartermaster: 12, ledger: 9, atlas: 7, echo: 6 };
  for (const [k, v] of Object.entries(seedCounts)) agentTasks[k as AgentId] = v!;

  const runs: Run[] = [
    makeRun("onboarding", subjectFor("onboarding", 3), baseClock - 40, "run-1"),
    makeRun("resultsPlan", subjectFor("resultsPlan", 9), baseClock - 25, "run-2"),
    makeRun("reorder", subjectFor("reorder", 1), baseClock - 15, "run-3"),
    makeRun("winback", subjectFor("winback", 5), baseClock - 8, "run-4"),
  ];
  // advance a couple so they're mid-flight / at a gate
  runs[0].current = 4; runs[0].steps[0].status = "done"; runs[0].steps[1].status = "done"; runs[0].steps[2].status = "done"; runs[0].steps[3].status = "done"; runs[0].steps[4].status = "active"; runs[0].steps[4].progress = 40;
  runs[1].current = 3; runs[1].steps[0].status = "done"; runs[1].steps[1].status = "done"; runs[1].steps[2].status = "done"; runs[1].steps[3].status = "gate"; runs[1].status = "awaiting";
  runs[2].current = 1; runs[2].steps[0].status = "done"; runs[2].steps[1].status = "active"; runs[2].steps[1].progress = 55;

  const events: SwarmEvent[] = [
    { id: 5, clock: baseClock - 4, agent: "sentinel", text: `Escalated to provider — ${runs[1].subject} plan awaiting human approval`, kind: "gate" },
    { id: 4, clock: baseClock - 12, agent: "clio", text: `Generated 3 AI recommendations for ${runs[0].subject}`, kind: "complete" },
    { id: 3, clock: baseClock - 20, agent: "quartermaster", text: "Compared 3 third-party vendors for BPC-157", kind: "complete" },
    { id: 2, clock: baseClock - 28, agent: "concierge", text: `Booked initial consult for ${runs[0].subject}`, kind: "complete" },
    { id: 1, clock: baseClock - 40, agent: "scout", text: `New lead captured & enriched — ${runs[0].subject}`, kind: "launch" },
  ];

  return {
    clock: baseClock,
    paused: false,
    autonomy: true,
    runs,
    events,
    pulses: [],
    completedToday: 128,
    escalations: 14,
    autoApproved: 86,
    agentTasks,
    seq: 100,
  };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export type SwarmAction =
  | { type: "TICK" }
  | { type: "APPROVE"; runId: string }
  | { type: "DECLINE"; runId: string }
  | { type: "LAUNCH"; workflowId: string; subject?: string }
  | { type: "TOGGLE_PAUSE" }
  | { type: "TOGGLE_AUTONOMY" };

function pushEvent(state: SwarmState, e: Omit<SwarmEvent, "id" | "clock">): SwarmEvent {
  return { ...e, id: ++state.seq, clock: state.clock };
}

function pushPulse(state: SwarmState, from: AgentId, to: AgentId) {
  if (from === to) return;
  state.pulses.push({ id: ++state.seq, from, to, clock: state.clock });
  if (state.pulses.length > MAX_PULSES) state.pulses = state.pulses.slice(-MAX_PULSES);
}

function advanceRun(run: Run, state: SwarmState, newEvents: SwarmEvent[]) {
  if (run.status !== "running") return;
  const step = run.steps[run.current];
  if (!step || step.status === "gate") return;
  step.status = "active";
  step.progress = Math.min(100, step.progress + Math.ceil(100 / step.ticks));
  if (step.progress < 100) return;

  // step complete
  step.status = "done";
  step.progress = 100;
  state.agentTasks[step.agent] = (state.agentTasks[step.agent] ?? 0) + 1;
  newEvents.push(pushEvent(state, { agent: step.agent, text: `${step.label} · ${run.subject}`, kind: "complete" }));

  const next = run.current + 1;
  if (next >= run.steps.length) {
    run.status = "done";
    state.completedToday += 1;
    newEvents.push(pushEvent(state, { agent: "system", text: `Workflow complete — ${workflowById[run.workflowId].name} · ${run.subject}`, kind: "finish" }));
    return;
  }
  const nextStep = run.steps[next];
  run.current = next;
  pushPulse(state, step.agent, nextStep.agent);
  if (nextStep.gate) {
    nextStep.status = "gate";
    run.status = "awaiting";
    if (nextStep.gate === "provider") {
      state.escalations += 1;
      newEvents.push(pushEvent(state, { agent: nextStep.agent, text: `Escalated to provider — ${run.subject} requires human approval`, kind: "gate" }));
    } else {
      newEvents.push(pushEvent(state, { agent: nextStep.agent, text: `Awaiting ops approval — ${run.subject}`, kind: "gate" }));
    }
  } else {
    nextStep.status = "active";
    newEvents.push(pushEvent(state, { agent: nextStep.agent, text: `Picked up: ${nextStep.label} · ${run.subject}`, kind: "handoff" }));
  }
}

function resumeAfterGate(run: Run, state: SwarmState, newEvents: SwarmEvent[], approver: SwarmEvent["agent"], label: string) {
  const step = run.steps[run.current];
  step.status = "done";
  step.progress = 100;
  state.agentTasks[step.agent] = (state.agentTasks[step.agent] ?? 0) + 1;
  newEvents.push(pushEvent(state, { agent: approver, text: `${label} — ${run.subject}`, kind: "approve" }));
  const next = run.current + 1;
  if (next >= run.steps.length) {
    run.status = "done";
    state.completedToday += 1;
    newEvents.push(pushEvent(state, { agent: "system", text: `Workflow complete — ${workflowById[run.workflowId].name} · ${run.subject}`, kind: "finish" }));
    return;
  }
  run.current = next;
  pushPulse(state, step.agent, run.steps[next].agent);
  run.steps[next].status = "active";
  run.status = "running";
}

export function reduce(prev: SwarmState, action: SwarmAction): SwarmState {
  // shallow clone with deep-ish copy of runs/steps so React sees changes
  const state: SwarmState = {
    ...prev,
    runs: prev.runs.map((r) => ({ ...r, steps: r.steps.map((s) => ({ ...s })) })),
    events: [...prev.events],
    pulses: [...prev.pulses],
    agentTasks: { ...prev.agentTasks },
  };
  const newEvents: SwarmEvent[] = [];

  switch (action.type) {
    case "TOGGLE_PAUSE":
      state.paused = !state.paused;
      return state;
    case "TOGGLE_AUTONOMY":
      state.autonomy = !state.autonomy;
      return state;

    case "APPROVE": {
      const run = state.runs.find((r) => r.id === action.runId && r.status === "awaiting");
      if (run) resumeAfterGate(run, state, newEvents, "human", "Approved by human");
      break;
    }
    case "DECLINE": {
      const run = state.runs.find((r) => r.id === action.runId && r.status === "awaiting");
      if (run) {
        run.status = "done";
        run.steps[run.current].status = "done";
        newEvents.push(pushEvent(state, { agent: "human", text: `Declined — ${run.subject} routed back to care team`, kind: "approve" }));
      }
      break;
    }
    case "LAUNCH": {
      if (state.runs.filter((r) => r.status !== "done").length < MAX_RUNS) {
        const subject = action.subject ?? subjectFor(action.workflowId, state.seq);
        const run = makeRun(action.workflowId, subject, state.clock, `run-${++state.seq}`);
        state.runs.unshift(run);
        newEvents.push(pushEvent(state, { agent: run.steps[0].agent, text: `Launched ${workflowById[action.workflowId].name} · ${subject}`, kind: "launch" }));
      }
      break;
    }

    case "TICK": {
      if (state.paused) return prev;
      state.clock += TICK_SECONDS;

      // auto-approve OPS gates under autonomy (provider gates always wait for a human)
      for (const run of state.runs) {
        if (run.status === "awaiting") {
          const step = run.steps[run.current];
          if (state.autonomy && step.gate === "ops") {
            state.autoApproved += 1;
            resumeAfterGate(run, state, newEvents, step.agent, "Auto-approved (governed)");
          }
        }
      }

      // advance running runs
      for (const run of state.runs) advanceRun(run, state, newEvents);

      // retire finished runs after they linger one tick; keep board lively
      const activeCount = state.runs.filter((r) => r.status !== "done").length;

      // spawn new work occasionally
      const rand = seededRandom(`spawn-${state.seq}-${state.clock}`);
      if (activeCount < MAX_RUNS && rand() < 0.45) {
        const wf = WORKFLOWS[Math.floor(rand() * WORKFLOWS.length)];
        const subject = subjectFor(wf.id, state.seq + state.clock);
        const run = makeRun(wf.id, subject, state.clock, `run-${++state.seq}`);
        state.runs.push(run);
        newEvents.push(pushEvent(state, { agent: "system", text: `Trigger: ${wf.trigger} → spawned ${wf.name} · ${subject}`, kind: "spawn" }));
      }

      // drop the oldest done runs if we have too many
      const done = state.runs.filter((r) => r.status === "done");
      if (done.length > 3) {
        const dropIds = new Set(done.slice(0, done.length - 3).map((r) => r.id));
        state.runs = state.runs.filter((r) => !dropIds.has(r.id));
      }
      break;
    }
  }

  if (newEvents.length) {
    state.events = [...newEvents.reverse(), ...state.events].slice(0, MAX_EVENTS);
  }
  return state;
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function agentStatus(state: SwarmState, id: AgentId): { status: "working" | "review" | "idle"; task?: string; subject?: string } {
  for (const run of state.runs) {
    if (run.status === "awaiting") {
      const step = run.steps[run.current];
      if (step.agent === id && step.gate) return { status: "review", task: step.label, subject: run.subject };
    }
  }
  for (const run of state.runs) {
    if (run.status === "running") {
      const step = run.steps[run.current];
      if (step.agent === id && step.status === "active") return { status: "working", task: step.label, subject: run.subject };
    }
  }
  return { status: "idle" };
}

export function formatClock(seconds: number): string {
  const s = ((seconds % 86400) + 86400) % 86400;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function estHoursSaved(completedToday: number, autoApproved: number): number {
  // ~9 min of manual coordination saved per automated step-set + approvals
  return Math.round(((completedToday * 9 + autoApproved * 3) / 60) * 10) / 10;
}
