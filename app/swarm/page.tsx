"use client";

import { useReducer, useEffect, useState, useMemo } from "react";
import {
  reduce,
  createInitialState,
  AGENTS,
  WORKFLOWS,
  workflowById,
  agentById,
  agentStatus,
  formatClock,
  estHoursSaved,
  type AgentId,
  type Run,
  type SwarmEvent,
  type SwarmState,
} from "@/lib/swarm";
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from "@/components/ui/primitives";
import { DashboardCard } from "@/components/DashboardCard";
import { Stagger, StaggerItem } from "@/components/motion";
import { Disclaimer } from "@/components/Disclaimer";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Radar,
  CalendarClock,
  FlaskConical,
  Brain,
  ShieldCheck,
  MessageSquare,
  Boxes,
  Receipt,
  BarChart3,
  Repeat,
  Network,
  Play,
  Pause,
  Zap,
  ZapOff,
  Plus,
  CheckCircle2,
  XCircle,
  Lock,
  Loader2,
  Activity,
  Cpu,
  GitBranch,
  Workflow as WorkflowIcon,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  Radar, CalendarClock, FlaskConical, Brain, ShieldCheck, MessageSquare, Boxes, Receipt, BarChart3, Repeat,
};

function AgentGlyph({ id, size = 16 }: { id: AgentId; size?: number }) {
  const a = agentById[id];
  const Icon = ICONS[a.icon] ?? Cpu;
  return <Icon style={{ width: size, height: size, color: a.color }} />;
}

const EVENT_TONE: Record<SwarmEvent["kind"], string> = {
  launch: "text-gold-300",
  handoff: "text-ink-200",
  complete: "text-optimal",
  gate: "text-watch",
  approve: "text-low",
  spawn: "text-ink-400",
  finish: "text-optimal",
};

export default function SwarmPage() {
  const [state, dispatch] = useReducer(reduce, undefined, createInitialState);
  const [launchWf, setLaunchWf] = useState(WORKFLOWS[0].id);

  useEffect(() => {
    const t = setInterval(() => dispatch({ type: "TICK" }), 1000);
    return () => clearInterval(t);
  }, []);

  const activeRuns = state.runs.filter((r) => r.status !== "done");
  const working = AGENTS.filter((a) => agentStatus(state, a.id).status === "working").length;
  const awaitingProvider = state.runs.filter(
    (r) => r.status === "awaiting" && r.steps[r.current].gate === "provider",
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="label-eyebrow">Autonomous operations · agent swarm</p>
          <h1 className="mt-1 flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-ink-50">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-gold-400 to-gold-600 text-white">
              <Network className="h-5 w-5" />
            </span>
            Agent Swarm
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-ink-800 bg-ink-900/70 px-2.5 py-1.5 text-xs text-ink-300">
            <span className={cn("h-2 w-2 rounded-full", state.paused ? "bg-ink-500" : "bg-optimal animate-pulse-soft")} />
            <span className="stat-mono">{formatClock(state.clock)}</span>
          </span>
          <Button size="sm" variant="outline" onClick={() => dispatch({ type: "TOGGLE_AUTONOMY" })}>
            {state.autonomy ? <Zap className="h-3.5 w-3.5 text-gold-300" /> : <ZapOff className="h-3.5 w-3.5" />}
            {state.autonomy ? "Autonomy: ON" : "Autonomy: OFF"}
          </Button>
          <Button size="sm" variant={state.paused ? "primary" : "outline"} onClick={() => dispatch({ type: "TOGGLE_PAUSE" })}>
            {state.paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            {state.paused ? "Resume" : "Pause"}
          </Button>
        </div>
      </div>

      {/* Metrics */}
      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StaggerItem className="h-full"><DashboardCard label="Workflows running" value={activeRuns.length} icon={<WorkflowIcon className="h-4 w-4" />} accent /></StaggerItem>
        <StaggerItem className="h-full"><DashboardCard label="Agents working" value={`${working}/${AGENTS.length}`} icon={<Cpu className="h-4 w-4" />} /></StaggerItem>
        <StaggerItem className="h-full"><DashboardCard label="Completed today" countTo={state.completedToday} icon={<CheckCircle2 className="h-4 w-4" />} delta="+18%" /></StaggerItem>
        <StaggerItem className="h-full"><DashboardCard label="Auto-approved" countTo={state.autoApproved} icon={<Zap className="h-4 w-4" />} hint="Governed ops gates" /></StaggerItem>
        <StaggerItem className="h-full"><DashboardCard label="Human escalations" value={awaitingProvider.length} icon={<Lock className="h-4 w-4" />} hint={`${state.escalations} today`} deltaTone="flat" /></StaggerItem>
        <StaggerItem className="h-full"><DashboardCard label="Est. hours saved" value={`${estHoursSaved(state.completedToday, state.autoApproved)}h`} icon={<Activity className="h-4 w-4" />} delta="+11%" /></StaggerItem>
      </Stagger>

      {/* Launch + compliance note */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <select
            value={launchWf}
            onChange={(e) => setLaunchWf(e.target.value)}
            className="h-9 rounded-lg border border-ink-700 bg-ink-900 px-3 text-sm text-ink-100 focus-ring"
          >
            {WORKFLOWS.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <Button size="sm" variant="primary" onClick={() => dispatch({ type: "LAUNCH", workflowId: launchWf })}>
            <Plus className="h-3.5 w-3.5" /> Launch workflow
          </Button>
        </div>
        <p className="inline-flex items-center gap-1.5 text-xs text-ink-500">
          <ShieldCheck className="h-3.5 w-3.5 text-gold-400" />
          Clinical (provider) gates always require a licensed human — even at full autonomy.
        </p>
      </div>

      {/* Network graph */}
      <SwarmGraph state={state} />

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Active workflows */}
        <div className="space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-ink-50">Active workflows</h2>
            <Badge tone="gold">{activeRuns.length} live</Badge>
          </div>
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {activeRuns.map((run) => (
                <motion.div
                  key={run.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.3 }}
                >
                  <RunPipeline run={run} onApprove={() => dispatch({ type: "APPROVE", runId: run.id })} onDecline={() => dispatch({ type: "DECLINE", runId: run.id })} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Activity feed */}
        <Card className="lg:sticky lg:top-24 lg:h-fit">
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4 text-gold-400" /> Live activity</CardTitle>
            <span className={cn("h-2 w-2 rounded-full", state.paused ? "bg-ink-600" : "bg-optimal animate-pulse-soft")} />
          </CardHeader>
          <CardContent>
            <div className="max-h-[440px] space-y-2 overflow-y-auto pr-1">
              <AnimatePresence initial={false}>
                {state.events.map((e) => (
                  <motion.div
                    key={e.id}
                    layout
                    initial={{ opacity: 0, x: 14, height: 0 }}
                    animate={{ opacity: 1, x: 0, height: "auto" }}
                    transition={{ duration: 0.25 }}
                    className="flex items-start gap-2.5 rounded-lg border border-ink-800/70 bg-ink-900/40 px-2.5 py-2"
                  >
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-ink-800">
                      {e.agent === "human" ? <ShieldCheck className="h-3.5 w-3.5 text-low" /> : e.agent === "system" ? <GitBranch className="h-3.5 w-3.5 text-ink-400" /> : <AgentGlyph id={e.agent} size={14} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-xs leading-snug", EVENT_TONE[e.kind])}>{e.text}</p>
                      <span className="stat-mono text-[10px] text-ink-600">{formatClock(e.clock)}</span>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Agent fleet */}
      <div>
        <h2 className="mb-3 font-display text-lg font-semibold text-ink-50">Agent fleet</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {AGENTS.map((a) => (
            <AgentCard key={a.id} id={a.id} state={state} />
          ))}
        </div>
      </div>

      <Disclaimer compact />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Network graph — the swarm "constellation"
// ---------------------------------------------------------------------------
const NODE_INITIALS: Record<AgentId, string> = {
  scout: "SC", concierge: "CN", phlebo: "PH", clio: "CL", sentinel: "SN",
  coach: "CH", quartermaster: "QM", ledger: "LG", atlas: "AT", echo: "EC",
};

function SwarmGraph({ state }: { state: SwarmState }) {
  const W = 600, H = 360, cx = W / 2, cy = H / 2, rx = 250, ry = 132;
  const pos = useMemo(() => {
    const m = {} as Record<AgentId, { x: number; y: number }>;
    AGENTS.forEach((a, i) => {
      const ang = (i / AGENTS.length) * Math.PI * 2 - Math.PI / 2;
      m[a.id] = { x: cx + rx * Math.cos(ang), y: cy + ry * Math.sin(ang) };
    });
    return m;
  }, [cx, cy]);

  // recent pulses to animate (age in sim-seconds)
  const recent = state.pulses.filter((p) => state.clock - p.clock <= 5);

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between px-5 pt-4">
        <CardTitle className="flex items-center gap-2"><Network className="h-4 w-4 text-gold-400" /> Swarm network</CardTitle>
        <span className="text-[11px] text-ink-500">live hand-offs between agents</span>
      </div>
      <div className="relative w-full">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" style={{ maxHeight: 380 }}>
          {/* spokes to the orchestrator core */}
          {AGENTS.map((a) => (
            <line key={`spoke-${a.id}`} x1={cx} y1={cy} x2={pos[a.id].x} y2={pos[a.id].y} stroke="#23272d" strokeWidth={1} />
          ))}

          {/* active hand-off lines */}
          <AnimatePresence>
            {recent.map((p) => (
              <motion.line
                key={`line-${p.id}`}
                x1={pos[p.from].x} y1={pos[p.from].y} x2={pos[p.to].x} y2={pos[p.to].y}
                stroke={agentById[p.from].color} strokeWidth={1.5}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.55, 0] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.4, ease: "easeInOut" }}
              />
            ))}
          </AnimatePresence>

          {/* traveling packets */}
          <AnimatePresence>
            {recent.map((p) => (
              <motion.circle
                key={`pkt-${p.id}`}
                r={4.5}
                fill={agentById[p.from].color}
                initial={{ cx: pos[p.from].x, cy: pos[p.from].y, opacity: 0 }}
                animate={{ cx: pos[p.to].x, cy: pos[p.to].y, opacity: [0, 1, 1, 0] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.2, ease: "easeInOut" }}
              />
            ))}
          </AnimatePresence>

          {/* orchestrator core */}
          <circle cx={cx} cy={cy} r={26} fill="#17191e" stroke="#3d0a0d" strokeWidth={1.5} />
          <motion.circle cx={cx} cy={cy} r={26} fill="none" stroke="#e93d3d" strokeWidth={1}
            animate={{ r: [26, 34, 26], opacity: [0.5, 0, 0.5] }} transition={{ duration: 3, repeat: Infinity }} />
          <text x={cx} y={cy - 1} textAnchor="middle" fontSize={11} fontWeight={700} fill="#f6aaaa">APEX</text>
          <text x={cx} y={cy + 10} textAnchor="middle" fontSize={6.5} fill="#7a838f" letterSpacing={1}>ORCHESTRATOR</text>

          {/* agent nodes */}
          {AGENTS.map((a) => {
            const st = agentStatus(state, a.id);
            const p = pos[a.id];
            const ringColor = st.status === "review" ? "#e0bd6e" : a.color;
            return (
              <g key={a.id}>
                {(st.status === "working" || st.status === "review") && (
                  <motion.circle cx={p.x} cy={p.y} r={16} fill="none" stroke={ringColor} strokeWidth={1.5}
                    animate={{ r: [16, 26, 16], opacity: [0.7, 0, 0.7] }} transition={{ duration: 1.8, repeat: Infinity }} />
                )}
                <circle cx={p.x} cy={p.y} r={16}
                  fill={st.status === "idle" ? "#15171c" : `${a.color}22`}
                  stroke={st.status === "idle" ? "#2a2f37" : ringColor}
                  strokeWidth={st.status === "idle" ? 1 : 1.8} />
                <text x={p.x} y={p.y + 3.5} textAnchor="middle" fontSize={9} fontWeight={700}
                  fill={st.status === "idle" ? "#6f7884" : ringColor}>{NODE_INITIALS[a.id]}</text>
                <text x={p.x} y={p.y + (p.y > cy ? 30 : -22)} textAnchor="middle" fontSize={8.5} fill="#94a1a6">{a.name}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Agent fleet card — visibly "alive" when working
// ---------------------------------------------------------------------------
function AgentCard({ id, state }: { id: AgentId; state: SwarmState }) {
  const a = agentById[id];
  const st = agentStatus(state, id);
  const active = st.status === "working";
  const review = st.status === "review";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-ink-850/70 p-3.5 transition-colors",
        active ? "border-ink-600" : review ? "border-watch/40" : "border-ink-800",
      )}
    >
      {/* live scan sheen when working */}
      {active && (
        <motion.div
          className="pointer-events-none absolute inset-0"
          style={{ background: `linear-gradient(115deg, transparent 30%, ${a.color}14 50%, transparent 70%)` }}
          animate={{ x: ["-100%", "100%"] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
        />
      )}

      <div className="relative flex items-start justify-between">
        <span className="relative grid h-9 w-9 place-items-center rounded-xl border" style={{ borderColor: `${a.color}44`, background: `${a.color}1a` }}>
          <AgentGlyph id={id} size={18} />
          {active && (
            <motion.span className="absolute inset-0 rounded-xl border" style={{ borderColor: a.color }}
              animate={{ scale: [1, 1.45], opacity: [0.6, 0] }} transition={{ duration: 1.6, repeat: Infinity }} />
          )}
        </span>
        {/* status chip */}
        {active ? (
          <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium" style={{ background: `${a.color}1f`, color: a.color }}>
            <Equalizer color={a.color} /> working
          </span>
        ) : review ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-watch/15 px-1.5 py-0.5 text-[9px] font-medium text-watch">
            <Lock className="h-2.5 w-2.5" /> review
          </span>
        ) : (
          <span className="rounded-full bg-ink-800 px-1.5 py-0.5 text-[9px] text-ink-500">idle</span>
        )}
      </div>

      <p className="relative mt-2.5 text-sm font-semibold text-ink-50">{a.name}</p>
      <p className="relative text-[11px] text-ink-500">{a.role}</p>
      <div className="relative mt-1.5 h-8">
        {st.status === "idle" ? (
          <span className="text-[11px] text-ink-600">Standing by…</span>
        ) : (
          <p className="line-clamp-2 text-[11px] text-ink-300">{st.task} <span className="text-ink-500">· {st.subject}</span></p>
        )}
      </div>
      <div className="relative mt-1 flex items-center justify-between border-t border-ink-800/70 pt-2 text-[10px] text-ink-500">
        <span>tasks today</span>
        <span className="stat-mono text-ink-300">{state.agentTasks[id]}</span>
      </div>
    </div>
  );
}

function Equalizer({ color }: { color: string }) {
  return (
    <span className="flex items-end gap-[1.5px]" style={{ height: 8 }}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          style={{ width: 2, background: color, borderRadius: 1 }}
          animate={{ height: [3, 8, 4, 7, 3] }}
          transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut", delay: i * 0.15 }}
        />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Run pipeline — alive active step + animated hand-offs
// ---------------------------------------------------------------------------
function RunPipeline({ run, onApprove, onDecline }: { run: Run; onApprove: () => void; onDecline: () => void }) {
  const wf = workflowById[run.workflowId];
  const awaitingGate = run.status === "awaiting" ? run.steps[run.current] : undefined;
  const pct = Math.round((run.steps.filter((s) => s.status === "done").length / run.steps.length) * 100);

  return (
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: wf.color }} />
          <span className="font-display text-sm font-semibold text-ink-50">{wf.name}</span>
          <span className="text-xs text-ink-400">· {run.subject}</span>
        </div>
        {run.status === "awaiting" ? (
          <Badge tone={awaitingGate?.gate === "provider" ? "high" : "watch"}>
            <Lock className="h-3 w-3" /> {awaitingGate?.gate === "provider" ? "Provider approval" : "Ops approval"}
          </Badge>
        ) : (
          <Badge tone="optimal"><Loader2 className="h-3 w-3 animate-spin" /> Running · {pct}%</Badge>
        )}
      </div>

      {/* steps */}
      <div className="flex items-stretch gap-0 overflow-x-auto pb-1">
        {run.steps.map((s, i) => {
          const a = agentById[s.agent];
          const isActive = s.status === "active";
          const isDone = s.status === "done";
          const isGate = s.status === "gate";
          return (
            <div key={i} className="flex items-center">
              <motion.div
                animate={isActive ? { boxShadow: [`0 0 0 0px ${a.color}00`, `0 0 0 3px ${a.color}22`, `0 0 0 0px ${a.color}00`] } : {}}
                transition={{ duration: 1.6, repeat: Infinity }}
                className={cn(
                  "relative w-[116px] shrink-0 overflow-hidden rounded-lg border px-2 py-2",
                  isActive && "border-ink-500 bg-ink-800/70",
                  isDone && "border-optimal/25 bg-optimal/[0.04]",
                  isGate && "border-watch/40 bg-watch/[0.06]",
                  s.status === "pending" && "border-ink-800 bg-ink-900/30 opacity-50",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="relative grid h-6 w-6 place-items-center rounded-md" style={{ background: `${a.color}1f` }}>
                    <AgentGlyph id={s.agent} size={13} />
                    {isActive && (
                      <motion.span className="absolute inset-0 rounded-md border" style={{ borderColor: a.color }}
                        animate={{ scale: [1, 1.5], opacity: [0.7, 0] }} transition={{ duration: 1.4, repeat: Infinity }} />
                    )}
                  </span>
                  {isDone && <CheckCircle2 className="h-3.5 w-3.5 text-optimal" />}
                  {isActive && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-200" />}
                  {isGate && <Lock className="h-3.5 w-3.5 text-watch" />}
                </div>
                <p className="mt-1.5 line-clamp-2 text-[10px] leading-tight text-ink-300">{s.label}</p>
                {isActive && (
                  <div className="relative mt-1 h-1 w-full overflow-hidden rounded-full bg-ink-700">
                    <motion.div className="h-full rounded-full bg-gold-400" animate={{ width: `${s.progress}%` }} transition={{ duration: 0.95, ease: "linear" }} />
                    <motion.div className="absolute inset-y-0 w-1/3 rounded-full" style={{ background: `linear-gradient(90deg, transparent, ${a.color}cc, transparent)` }}
                      animate={{ x: ["-120%", "320%"] }} transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }} />
                  </div>
                )}
              </motion.div>
              {i < run.steps.length - 1 && (
                <div className="relative mx-0.5 h-px w-4 shrink-0 bg-ink-700">
                  {isDone && (
                    <motion.span className="absolute -top-[3px] h-[7px] w-[7px] rounded-full" style={{ background: a.color }}
                      initial={{ left: "-10%", opacity: 0 }} animate={{ left: "100%", opacity: [0, 1, 0] }} transition={{ duration: 0.9 }} />
                  )}
                  <ChevronRight className="absolute -top-[7px] right-[-6px] h-3.5 w-3.5 text-ink-700" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* gate actions */}
      {run.status === "awaiting" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-2">
          <span className="flex items-center gap-1.5 text-xs text-ink-300">
            <Lock className="h-3.5 w-3.5 text-watch" />
            {awaitingGate?.gate === "provider"
              ? "Licensed provider approval required to proceed."
              : "Operations approval required to proceed."}
          </span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="success" onClick={onApprove}><CheckCircle2 className="h-3.5 w-3.5" /> Approve</Button>
            <Button size="sm" variant="danger" onClick={onDecline}><XCircle className="h-3.5 w-3.5" /> Decline</Button>
          </div>
        </div>
      )}
    </div>
  );
}
