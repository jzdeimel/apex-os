"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Clock3,
  FileWarning,
  Loader2,
  Paperclip,
  ShieldCheck,
  UserCheck,
  type LucideIcon,
} from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import type {
  CommunityModerationAction,
  CommunityModerationStatus,
} from "@/lib/community/moderation";

interface ModerationPayload {
  ok: boolean;
  ownerOnly: boolean;
  canModerate: boolean;
  canManagePolicy: boolean;
  now: string;
  queue: Array<{
    case: {
      id: string;
      ownerStaffId: string;
      severity: "critical" | "high" | "medium" | "low";
      status: CommunityModerationStatus;
      firstResponseDueAt: string;
      resolutionDueAt: string;
      firstRespondedAt: string | null;
      action: CommunityModerationAction | null;
      resolution: string | null;
    };
    post: {
      id: string;
      authorHandle: string;
      authorKind: string;
      body: string;
      status: string;
      postedAt: string;
    };
    group: { id: string; name: string; ownerStaffId: string };
    owner: { id: string; name: string; active: boolean } | null;
    reports: Array<{ id: string; reason: string; detail: string | null; createdAt: string }>;
  }>;
}

interface GroupPayload {
  ok: boolean;
  canManage: boolean;
  attachmentStorageReady: boolean;
  moderatorCandidates: Array<{
    id: string;
    name: string;
    title: string | null;
    accessProfile: string;
  }>;
  groups: Array<{
    id: string;
    name: string;
    charter: string;
    locationId: string | null;
    ownerStaffId: string;
    backupStaffId: string | null;
    status: string;
    criticalResponseMinutes: number;
    highResponseMinutes: number;
    mediumResponseMinutes: number;
    lowResponseMinutes: number;
    contentRetentionDays: number;
    moderationEvidenceRetentionDays: number;
    attachmentRetentionDays: number;
    attachmentsEnabled: boolean;
    maxAttachmentBytes: number;
    allowedAttachmentMimeTypes: string[];
    owner: { id: string; name: string; active: boolean } | null;
    backup: { id: string; name: string; active: boolean } | null;
  }>;
}

const ACTION_LABELS: Record<CommunityModerationAction, string> = {
  none: "No content action",
  "hide-post": "Hide post",
  "remove-post": "Remove post",
  "warn-member": "Record warning delivered",
  "suspend-member": "Suspend community access",
  "route-to-care-team": "Route concern to care team",
};

function queueState(item: ModerationPayload["queue"][number], nowIso: string) {
  if (item.case.status === "resolved" || item.case.status === "dismissed") return "closed";
  const now = new Date(nowIso).getTime();
  if (!item.case.firstRespondedAt && now > new Date(item.case.firstResponseDueAt).getTime()) {
    return "response-overdue";
  }
  if (now > new Date(item.case.resolutionDueAt).getTime()) return "resolution-overdue";
  return "on-track";
}

function dueLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function severityTone(severity: string): "high" | "watch" | "low" | "neutral" {
  if (severity === "critical") return "high";
  if (severity === "high") return "watch";
  if (severity === "medium") return "low";
  return "neutral";
}

function ModerationCaseCard({
  item,
  now,
  canModerate,
  onChanged,
}: {
  item: ModerationPayload["queue"][number];
  now: string;
  canModerate: boolean;
  onChanged: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [action, setAction] = useState<CommunityModerationAction>("hide-post");
  const [resolution, setResolution] = useState("");
  const [working, setWorking] = useState(false);
  const state = queueState(item, now);

  async function transition(status: CommunityModerationStatus) {
    setWorking(true);
    try {
      const response = await fetch("/api/community/moderation", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: item.case.id,
          status,
          ...(status === "resolved" || status === "dismissed"
            ? { action: status === "dismissed" ? "none" : action, resolution }
            : {}),
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Moderation action was not confirmed.");
      toast(status === "in-review" ? "Case acknowledged" : "Case closed", {
        desc: `${item.group.name} · ${item.post.authorHandle}`,
        tone: "info",
      });
      await onChanged();
    } catch (error) {
      toast("Moderation action failed", {
        desc: error instanceof Error ? error.message : "Please retry.",
        tone: "warn",
      });
    } finally {
      setWorking(false);
    }
  }

  return (
    <Card className={state.includes("overdue") ? "border-high/35" : undefined}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={severityTone(item.case.severity)}>{item.case.severity}</Badge>
            <Badge tone={state.includes("overdue") ? "high" : "optimal"}>
              {state === "response-overdue"
                ? "Response overdue"
                : state === "resolution-overdue"
                  ? "Resolution overdue"
                  : state === "closed"
                    ? "Closed"
                    : "On track"}
            </Badge>
            <Badge tone="neutral">{item.reports.length} report{item.reports.length === 1 ? "" : "s"}</Badge>
          </div>
          <CardTitle className="mt-3">{item.group.name} · {item.post.authorHandle}</CardTitle>
        </div>
        <div className="text-right text-micro leading-relaxed text-ink-500">
          <p className="flex items-center justify-end gap-1.5">
            <UserCheck className="h-3 w-3" />
            {item.owner?.name ?? item.case.ownerStaffId}
          </p>
          <p className="mt-1 flex items-center justify-end gap-1.5">
            <Clock3 className="h-3 w-3" />
            respond by {dueLabel(item.case.firstResponseDueAt)}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <blockquote className="rounded-control border-l-2 border-ink-600 bg-ink-950/45 p-3 text-body leading-relaxed text-ink-300">
          “{item.post.body}”
        </blockquote>
        <div className="flex flex-wrap gap-2">
          {[...new Set(item.reports.map((report) => report.reason))].map((reason) => (
            <Badge key={reason} tone="watch">{reason.replaceAll("-", " ")}</Badge>
          ))}
        </div>
        {canModerate && item.case.status !== "resolved" && item.case.status !== "dismissed" && (
          <div className="grid gap-3 border-t border-ink-800 pt-4 lg:grid-cols-[0.8fr_1.5fr_auto]">
            <label className="space-y-1.5 text-micro text-ink-400">
              Resolution action
              <Select value={action} onChange={(event) => setAction(event.target.value as CommunityModerationAction)}>
                {Object.entries(ACTION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </label>
            <label className="space-y-1.5 text-micro text-ink-400">
              Moderator note
              <Input
                value={resolution}
                onChange={(event) => setResolution(event.target.value)}
                placeholder="What was reviewed and what happened next?"
                maxLength={5_000}
              />
            </label>
            <div className="flex items-end gap-2">
              {item.case.status === "open" && (
                <Button variant="outline" size="sm" disabled={working} onClick={() => void transition("in-review")}>
                  Acknowledge
                </Button>
              )}
              <Button
                variant="success"
                size="sm"
                disabled={working || !resolution.trim()}
                onClick={() => void transition("resolved")}
              >
                {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Resolve
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const EMPTY_FORM = {
  id: "",
  name: "",
  charter: "Habits, training, food, recovery, events, and wins. No medication, dosing, or lab advice.",
  ownerStaffId: "",
  backupStaffId: "",
  criticalResponseMinutes: 15,
  highResponseMinutes: 60,
  mediumResponseMinutes: 240,
  lowResponseMinutes: 1440,
  contentRetentionDays: 365,
  moderationEvidenceRetentionDays: 2555,
  attachmentRetentionDays: 365,
};

function PolicyEditor({
  payload,
  onChanged,
}: {
  payload: GroupPayload;
  onChanged: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [working, setWorking] = useState(false);

  function edit(group?: GroupPayload["groups"][number]) {
    setForm(
      group
        ? {
            id: group.id,
            name: group.name,
            charter: group.charter,
            ownerStaffId: group.ownerStaffId,
            backupStaffId: group.backupStaffId ?? "",
            criticalResponseMinutes: group.criticalResponseMinutes,
            highResponseMinutes: group.highResponseMinutes,
            mediumResponseMinutes: group.mediumResponseMinutes,
            lowResponseMinutes: group.lowResponseMinutes,
            contentRetentionDays: group.contentRetentionDays,
            moderationEvidenceRetentionDays: group.moderationEvidenceRetentionDays,
            attachmentRetentionDays: group.attachmentRetentionDays,
          }
        : EMPTY_FORM,
    );
    setEditing(true);
  }

  async function save() {
    setWorking(true);
    try {
      const id = form.id || form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const response = await fetch("/api/community/groups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          id,
          backupStaffId: form.backupStaffId || null,
          attachmentsEnabled: false,
        }),
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error ?? "Community policy was not saved.");
      toast("Community policy saved", {
        desc: "Ownership, SLA, and retention are now auditable.",
        tone: "info",
      });
      setEditing(false);
      await onChanged();
    } catch (error) {
      toast("Policy save failed", {
        desc: error instanceof Error ? error.message : "Please retry.",
        tone: "warn",
      });
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="space-y-3" aria-labelledby="community-policy-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="community-policy-title" className="font-display text-heading font-semibold text-ink-50">
            Owned groups and policy
          </h3>
          <p className="mt-1 text-detail text-ink-500">
            Every room has a primary moderator, backup, response clock, and recorded retention window.
          </p>
        </div>
        {payload.canManage && (
          <Button variant="outline" size="sm" onClick={() => edit()}>
            Add group
          </Button>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {payload.groups.map((group) => (
          <Card key={group.id}>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="font-display text-body font-semibold text-ink-50">{group.name}</h4>
                  <p className="mt-1 text-detail leading-relaxed text-ink-400">{group.charter}</p>
                </div>
                <Badge tone={group.status === "active" ? "optimal" : "watch"}>{group.status}</Badge>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-detail">
                <div>
                  <dt className="label-eyebrow">Primary</dt>
                  <dd className="mt-1 text-ink-200">{group.owner?.name ?? group.ownerStaffId}</dd>
                </div>
                <div>
                  <dt className="label-eyebrow">Backup</dt>
                  <dd className="mt-1 text-ink-200">{group.backup?.name ?? "Not assigned"}</dd>
                </div>
                <div>
                  <dt className="label-eyebrow">Response SLA</dt>
                  <dd className="mt-1 stat-mono text-ink-200">
                    {group.criticalResponseMinutes}m / {group.highResponseMinutes}m / {group.mediumResponseMinutes}m
                  </dd>
                </div>
                <div>
                  <dt className="label-eyebrow">Retention</dt>
                  <dd className="mt-1 stat-mono text-ink-200">{group.contentRetentionDays}d content</dd>
                </div>
              </dl>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-800 pt-3">
                <p className="flex items-center gap-1.5 text-micro text-ink-500">
                  <Paperclip className="h-3 w-3" />
                  {group.attachmentsEnabled
                    ? "Private attachments enabled"
                    : "Attachments locked until storage + scanning are ready"}
                </p>
                {payload.canManage && (
                  <Button variant="ghost" size="sm" onClick={() => edit(group)}>Edit policy</Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {payload.groups.length === 0 && (
        <div className="rounded-panel border border-dashed border-ink-700 p-6 text-center">
          <ShieldCheck className="mx-auto h-6 w-6 text-ink-500" />
          <p className="mt-3 text-body font-medium text-ink-200">No community group is launchable yet</p>
          <p className="mt-1 text-detail text-ink-500">
            Assign a primary and backup moderator before enrolling patients.
          </p>
        </div>
      )}

      {editing && (
        <Card className="border-gold-400/25">
          <CardHeader>
            <CardTitle>Community operating policy</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <label className="space-y-1.5 text-micro text-ink-400">
              Group name
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>
            <label className="space-y-1.5 text-micro text-ink-400">
              Stable group id
              <Input
                value={form.id}
                onChange={(event) => setForm({ ...form, id: event.target.value })}
                placeholder="Generated from name if blank"
              />
            </label>
            <label className="space-y-1.5 text-micro text-ink-400">
              Primary moderator
              <Select
                value={form.ownerStaffId}
                onChange={(event) => setForm({ ...form, ownerStaffId: event.target.value })}
              >
                <option value="">Select an active coach or operations owner</option>
                {payload.moderatorCandidates
                  .filter((candidate) => candidate.accessProfile === "coach")
                  .map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name} · {candidate.accessProfile}
                  </option>
                  ))}
              </Select>
            </label>
            <label className="space-y-1.5 text-micro text-ink-400">
              Backup moderator
              <Select
                value={form.backupStaffId}
                onChange={(event) => setForm({ ...form, backupStaffId: event.target.value })}
              >
                <option value="">Select backup</option>
                {payload.moderatorCandidates
                  .filter((candidate) => candidate.id !== form.ownerStaffId)
                  .map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name} · {candidate.accessProfile}
                    </option>
                  ))}
              </Select>
            </label>
            <label className="space-y-1.5 text-micro text-ink-400 lg:col-span-2">
              Charter
              <Textarea
                rows={3}
                value={form.charter}
                onChange={(event) => setForm({ ...form, charter: event.target.value })}
              />
            </label>
            <div className="grid grid-cols-2 gap-3 lg:col-span-2 lg:grid-cols-4">
              {([
                ["Critical response (min)", "criticalResponseMinutes"],
                ["High response (min)", "highResponseMinutes"],
                ["Medium response (min)", "mediumResponseMinutes"],
                ["Low response (min)", "lowResponseMinutes"],
              ] as const).map(([label, key]) => (
                <label key={key} className="space-y-1.5 text-micro text-ink-400">
                  {label}
                  <Input
                    type="number"
                    min={5}
                    value={form[key]}
                    onChange={(event) => setForm({ ...form, [key]: Number(event.target.value) })}
                  />
                </label>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 lg:col-span-2 sm:grid-cols-3">
              {([
                ["Content retention (days)", "contentRetentionDays"],
                ["Moderation evidence (days)", "moderationEvidenceRetentionDays"],
                ["Attachment retention (days)", "attachmentRetentionDays"],
              ] as const).map(([label, key]) => (
                <label key={key} className="space-y-1.5 text-micro text-ink-400">
                  {label}
                  <Input
                    type="number"
                    min={30}
                    max={3650}
                    value={form[key]}
                    onChange={(event) => setForm({ ...form, [key]: Number(event.target.value) })}
                  />
                </label>
              ))}
            </div>
            <div className="lg:col-span-2 flex flex-wrap items-center justify-between gap-3 border-t border-ink-800 pt-4">
              <p className="flex items-center gap-2 text-detail text-ink-500">
                <FileWarning className="h-4 w-4" />
                Attachments stay off until private storage and malware scanning pass deployment checks.
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                <Button
                  variant="primary"
                  disabled={working || !form.name.trim() || !form.charter.trim() || !form.ownerStaffId}
                  onClick={() => void save()}
                >
                  {working && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save policy
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

interface EligibleClient {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  email: string | null;
  assignedCoachId: string | null;
  membership: { groupId: string; status: string; handle: string } | null;
}

function MemberEnrollment({
  groups,
  canModerate,
}: {
  groups: GroupPayload["groups"];
  canModerate: boolean;
}) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EligibleClient[]>([]);
  const [selected, setSelected] = useState<EligibleClient | null>(null);
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [handle, setHandle] = useState("");
  const [working, setWorking] = useState(false);

  if (!canModerate || groups.length === 0) return null;

  async function search() {
    if (query.trim().length < 2) return;
    setWorking(true);
    try {
      const response = await fetch(`/api/community/members?q=${encodeURIComponent(query.trim())}`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; clients?: EligibleClient[]; error?: string }
        | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error ?? "Patient search failed.");
      setResults(payload.clients ?? []);
    } catch (error) {
      toast("Patient search failed", {
        desc: error instanceof Error ? error.message : "Please retry.",
        tone: "warn",
      });
    } finally {
      setWorking(false);
    }
  }

  function select(client: EligibleClient) {
    setSelected(client);
    const matchingGroup = groups.find((group) => group.ownerStaffId === client.assignedCoachId);
    setGroupId(matchingGroup?.id ?? groups[0]?.id ?? "");
    setHandle(client.membership?.handle ?? "");
  }

  async function save(active: boolean) {
    if (!selected || !groupId || !handle.trim()) return;
    setWorking(true);
    try {
      const response = await fetch("/api/community/members", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          groupId,
          clientId: selected.id,
          handle: handle.trim(),
          active,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Enrollment was not confirmed.");
      toast(active ? "Patient enrolled" : "Patient removed", {
        desc: active ? `${handle.trim()} · coach-owned room` : "Community access ended; history remains retained.",
        tone: "info",
      });
      setSelected(null);
      setResults([]);
      setQuery("");
      setHandle("");
    } catch (error) {
      toast("Enrollment failed", {
        desc: error instanceof Error ? error.message : "Please retry.",
        tone: "warn",
      });
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="space-y-3" aria-labelledby="community-enrollment-title">
      <div>
        <h3 id="community-enrollment-title" className="font-display text-heading font-semibold text-ink-50">
          Patient enrollment
        </h3>
        <p className="mt-1 text-detail text-ink-500">
          Community is opt-in. A patient may join only the room owned by their assigned coach.
        </p>
      </div>
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex gap-2">
            <label className="flex-1 space-y-1.5 text-micro text-ink-400">
              Find patient by name or email
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void search();
                  }
                }}
                placeholder="At least two characters"
              />
            </label>
            <div className="flex items-end">
              <Button variant="outline" disabled={working || query.trim().length < 2} onClick={() => void search()}>
                {working && <Loader2 className="h-4 w-4 animate-spin" />}
                Search
              </Button>
            </div>
          </div>
          {results.length > 0 && !selected && (
            <div className="divide-y divide-ink-800 rounded-control border border-ink-800">
              {results.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 p-3 text-left transition hover:bg-ink-800/45"
                  onClick={() => select(client)}
                >
                  <span>
                    <span className="block text-body font-medium text-ink-100">
                      {client.preferredName || client.firstName} {client.lastName}
                    </span>
                    <span className="mt-0.5 block text-micro text-ink-500">{client.email ?? "No email"}</span>
                  </span>
                  <Badge tone={client.membership?.status === "active" ? "optimal" : "neutral"}>
                    {client.membership?.status === "active" ? client.membership.handle : "Not enrolled"}
                  </Badge>
                </button>
              ))}
            </div>
          )}
          {selected && (
            <div className="grid gap-3 border-t border-ink-800 pt-4 lg:grid-cols-[1fr_1fr_auto]">
              <label className="space-y-1.5 text-micro text-ink-400">
                Coach-owned group
                <Select value={groupId} onChange={(event) => setGroupId(event.target.value)}>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>{group.name} · {group.owner?.name ?? "coach"}</option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1.5 text-micro text-ink-400">
                Patient handle
                <Input
                  value={handle}
                  maxLength={32}
                  onChange={(event) => setHandle(event.target.value)}
                  placeholder="IronOak42"
                />
              </label>
              <div className="flex items-end gap-2">
                <Button variant="ghost" onClick={() => setSelected(null)}>Cancel</Button>
                {selected.membership?.status === "active" && (
                  <Button variant="danger" disabled={working || !handle.trim()} onClick={() => void save(false)}>
                    Remove
                  </Button>
                )}
                <Button variant="primary" disabled={working || !handle.trim()} onClick={() => void save(true)}>
                  Enroll
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

export function CommunityModerationCenter() {
  const [moderation, setModeration] = useState<ModerationPayload | null>(null);
  const [groups, setGroups] = useState<GroupPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [queueResponse, groupResponse] = await Promise.all([
        fetch("/api/community/moderation", { cache: "no-store" }),
        fetch("/api/community/groups", { cache: "no-store" }),
      ]);
      if (queueResponse.status === 403 || groupResponse.status === 403) {
        setModeration(null);
        setGroups(null);
        setError(null);
        return;
      }
      const queuePayload = (await queueResponse.json().catch(() => null)) as ModerationPayload | null;
      const groupPayload = (await groupResponse.json().catch(() => null)) as GroupPayload | null;
      if (!queueResponse.ok || !queuePayload?.ok) {
        throw new Error("Moderation data is unavailable in this environment.");
      }
      if (!groupResponse.ok || !groupPayload?.ok) {
        throw new Error("Community policy is unavailable in this environment.");
      }
      setModeration(queuePayload);
      setGroups(groupPayload);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Moderation data is unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const queue = moderation?.queue ?? [];
    return {
      total: queue.length,
      critical: queue.filter((item) => item.case.severity === "critical").length,
      overdue: queue.filter((item) => queueState(item, moderation?.now ?? new Date().toISOString()).includes("overdue")).length,
      owned: queue.filter((item) => item.owner?.active !== false).length,
    };
  }, [moderation]);
  const metricCards: Array<[string, number, LucideIcon]> = [
    ["Open cases", counts.total, AlertTriangle],
    ["Critical", counts.critical, FileWarning],
    ["Overdue", counts.overdue, Clock3],
    ["Owned", counts.owned, UserCheck],
  ];

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-5 text-body text-ink-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading moderation ownership and SLA…
        </CardContent>
      </Card>
    );
  }
  if (!moderation && !error) return null;

  return (
    <section className="space-y-5" aria-labelledby="moderation-center-title">
      <div className="rounded-panel border border-ink-700 bg-ink-900/45 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="label-eyebrow">Moderation operations</p>
            <h2 id="moderation-center-title" className="mt-1 font-display text-title font-semibold text-ink-50">
              Named owners, visible clocks
            </h2>
            <p className="mt-2 max-w-3xl text-body leading-relaxed text-ink-400">
              Reports never disappear into a generic inbox. The group owner receives the case,
              the backup remains visible, and every resolution is written to the Apex ledger.
            </p>
          </div>
          <Badge tone={counts.overdue ? "high" : "optimal"}>
            {counts.overdue ? `${counts.overdue} overdue` : "SLA clear"}
          </Badge>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {metricCards.map(([label, value, Icon]) => (
            <div key={String(label)} className="rounded-control border border-ink-800 bg-ink-950/45 p-3">
              <p className="label-eyebrow flex items-center gap-1.5">
                <Icon className="h-3 w-3" />
                {String(label)}
              </p>
              <p className="stat-mono mt-2 text-title font-semibold text-ink-50">{String(value)}</p>
            </div>
          ))}
        </div>
      </div>

      {error ? (
        <Card className="border-watch/30">
          <CardContent className="flex items-start gap-3 p-5">
            <Archive className="mt-0.5 h-4 w-4 text-watch" />
            <div>
              <p className="text-body font-medium text-ink-100">Moderation preview is visible, durable data is unavailable</p>
              <p className="mt-1 text-detail text-ink-500">{error}</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {groups && <PolicyEditor payload={groups} onChanged={load} />}
          {groups && (
            <MemberEnrollment
              groups={groups.groups}
              canModerate={moderation?.canModerate ?? false}
            />
          )}
          <section className="space-y-3" aria-labelledby="moderation-queue-title">
            <div>
              <h3 id="moderation-queue-title" className="font-display text-heading font-semibold text-ink-50">
                Report queue
              </h3>
              <p className="mt-1 text-detail text-ink-500">
                Earliest response deadline first. Coaches see cases they own; operations and owners see the full queue.
              </p>
            </div>
            {moderation?.queue.length ? (
              <div className="space-y-3">
                {moderation.queue.map((item) => (
                  <ModerationCaseCard
                    key={item.case.id}
                    item={item}
                    now={moderation.now}
                    canModerate={moderation.canModerate}
                    onChanged={load}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-panel border border-dashed border-ink-700 p-7 text-center">
                <ShieldCheck className="mx-auto h-6 w-6 text-optimal" />
                <p className="mt-3 text-body font-medium text-ink-200">No open moderation cases</p>
                <p className="mt-1 text-detail text-ink-500">
                  New reports will appear here with an owner and first-response deadline.
                </p>
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
