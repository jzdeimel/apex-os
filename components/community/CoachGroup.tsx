"use client";

/**
 * The coach-hosted group.
 *
 * ── Why a group and not a forum ───────────────────────────────────────────
 * The open forum is the version of community that everyone asks for and nobody
 * should ship into a clinic. It has no host, so norms are set by whoever posts
 * most; it has no expertise, so the loudest confident answer wins; and it has
 * no owner, so when something goes wrong there is nobody whose job it was.
 *
 * This is the version that works: a small group, a named coach with their
 * credentials visible, and a moderator badge on every post they make. The
 * coach is not decoration — they are the reason a member believes an answer
 * here is worth anything, and they are the human half of the moderation the
 * keyword guard cannot do alone.
 *
 * ── The composer is the whole feature ─────────────────────────────────────
 * Everything a member types runs through classifyPost BEFORE it can be
 * published. When it trips, we do not scold and we do not silently drop it.
 * We show the member exactly what tripped, and offer to send the same words to
 * their own provider as an escalation — with the SLA clock it would get,
 * displayed before they commit, because "someone will get back to you" is what
 * they already don't believe.
 *
 * The alternative — publishing it — means the next thing this member reads is
 * another member's guess about his dose, on a page with the clinic's name at
 * the top. This turns that into a routed clinical question with an owner and a
 * due time. Same words, opposite outcome.
 *
 * The guard is a first pass and it is beatable; see lib/community/guard.ts for
 * an honest account of what it misses. The coach reading this group is the
 * control that catches what it misses.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Clock, Heart, Send, Shield, ShieldCheck } from "lucide-react";
import type { CoachGroup as CoachGroupType, GroupPost, PostClassification } from "@/lib/community/types";
import type { Client } from "@/lib/types";
import { classifyPost } from "@/lib/community/guard";
import {
  NOW,
  SLA_HOURS,
  formatSla,
  priorityFromText,
  raiseEscalation,
} from "@/lib/escalations/queue";
import { staffMap, staffName } from "@/lib/mock/staff";
import { commitEscalation } from "@/lib/mock/escalations";
import { appendLedger } from "@/lib/trace/ledger";
import { clientName } from "@/lib/mock/clients";
import { Badge, Button, Card, CardContent, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { FadeIn } from "@/components/motion";
import { cn, formatDateTime } from "@/lib/utils";

export function CoachGroup({
  group,
  posts,
  me,
  myHandle,
}: {
  group: CoachGroupType;
  posts: GroupPost[];
  /** The reading member. Used only to address the escalation — never rendered. */
  me: Client;
  /** How this member appears to everyone else. */
  myHandle: string;
}) {
  const { toast } = useToast();
  const coach = staffMap[group.coachId];

  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState<GroupPost[]>([]);
  /** Set when the guard blocks; cleared when the member edits or sends it on. */
  const [blocked, setBlocked] = useState<PostClassification | null>(null);
  const [routed, setRouted] = useState<string | null>(null);

  const all = useMemo(
    () => [...sent, ...posts].sort((a, b) => b.postedAt.localeCompare(a.postedAt)),
    [sent, posts],
  );

  /**
   * What the escalation WOULD look like if the member sends it.
   *
   * Built before the click so the SLA can be shown on the offer. Pure — the
   * real one is constructed again on send, from the same inputs, so what the
   * member was promised and what the provider receives cannot diverge.
   */
  const preview = useMemo(() => {
    if (!blocked?.suggestedEscalation) return null;
    const priority = priorityFromText(draft);
    const esc = raiseEscalation({
      id: "esc-preview",
      clientId: me.id,
      // The Escalation type models this as coach→provider, and there is no
      // member-raiser concept in it. Attributing it to the group's coach is the
      // honest mapping rather than a fiction: they host the group, the routed
      // question lands in their raised-by list, and they own closing the loop
      // with the member. A production schema would add a `raisedBy: member`
      // variant instead of borrowing the coach's id.
      raisedByStaffId: group.coachId,
      assignedToStaffId: me.providerId,
      kind: blocked.suggestedEscalation.kind,
      question: blocked.suggestedEscalation.question,
      sourceQuote: draft.trim(),
      raisedAt: NOW,
      priority,
    });
    return { esc, priority };
  }, [blocked, draft, me.id, me.providerId, group.coachId]);

  function submit() {
    const text = draft.trim();
    if (!text) return;

    const verdict = classifyPost(text);
    if (!verdict.safe) {
      setBlocked(verdict);
      return;
    }

    setSent((s) => [
      {
        id: `gp-new-${s.length + 1}`,
        groupId: group.id,
        handle: myHandle,
        author: "member",
        body: text,
        postedAt: NOW,
        cheers: 0,
      },
      ...s,
    ]);
    setDraft("");
    setBlocked(null);
    toast("Posted to the group", { desc: `${group.name} · you appear as ${myHandle}` });
  }

  function sendToProvider() {
    if (!preview) return;

    /**
     * The real write. Two halves, and both were missing.
     *
     * The escalation now goes into the shared store, so it genuinely appears in
     * queueFor(providerId) and the copy below stops being a claim the code did
     * not honour. And it appends a ledger row, because a member-initiated
     * clinical escalation is the highest-value audit event this module produces
     * — guard.ts argues the volume of blocked posts is itself a clinical
     * signal, and none of it was being recorded.
     *
     * In production these two writes share a transaction; the post itself is
     * never persisted, so the blocked text has no window in which it exists as
     * publishable content.
     */
    const committed = commitEscalation({
      ...preview.esc,
      id: `esc-member-${me.id}-${preview.esc.raisedAt.slice(0, 10)}`,
    });

    const row = appendLedger({
      actorId: me.id,
      actorName: clientName(me),
      actorRole: "Coach",
      action: "create",
      entity: "recommendation",
      entityId: committed.id,
      subjectId: me.id,
      subjectName: clientName(me),
      locationId: me.locationId,
      reason: "Member question blocked in community and routed to their provider",
      after: {
        priority: committed.priority,
        assignedTo: staffName(committed.assignedToStaffId),
        dueWithinHours: SLA_HOURS[committed.priority as keyof typeof SLA_HOURS],
        source: "community-guard",
      },
    });

    setRouted(formatSla(committed));
    setBlocked(null);
    setDraft("");
    toast("Sent to your provider", {
      desc: `${staffName(me.providerId)} · ${preview.priority.toLowerCase()} · due within ${SLA_HOURS[preview.priority]}h · ${row.id}`,
      tone: "info",
    });
  }

  return (
    <div className="space-y-5">
      {/* ── Host ───────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold-400/15 font-display text-body font-semibold text-gold-200">
            {coach?.avatarInitials ?? "AH"}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-heading font-semibold tracking-tight text-ink-50">
              {group.name}
            </h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-body text-ink-400">
              <span>
                Hosted by {coach?.name ?? staffName(group.coachId)}
                {coach?.credentials ? `, ${coach.credentials}` : ""}
              </span>
              <Badge tone="gold">
                <ShieldCheck className="h-3 w-3" />
                Moderator
              </Badge>
            </p>
            <p className="mt-2.5 max-w-prose text-body leading-relaxed text-ink-400">
              {group.charter}
            </p>
            <p className="mt-2 text-micro text-ink-500">
              <span className="stat-mono">{group.memberCount}</span> members · you post as{" "}
              <span className="text-ink-300">{myHandle}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Composer ───────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <Textarea
            rows={3}
            value={draft}
            placeholder="Training, food, sleep, showing up — what's going on this week?"
            onChange={(e) => {
              setDraft(e.target.value);
              // Editing clears the block. A member who reworded should not be
              // arguing with a stale verdict.
              if (blocked) setBlocked(null);
              if (routed) setRouted(null);
            }}
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-micro text-ink-500">
              <Shield className="h-3 w-3" />
              Medication and lab questions get routed to your provider, not posted.
            </p>
            <Button variant="primary" size="sm" onClick={submit} disabled={!draft.trim()}>
              <Send className="h-3.5 w-3.5" />
              Post
            </Button>
          </div>

          {/* ── The block, and the offer ─────────────────────────────────
              Shown inline, under the member's own words, still editable. The
              point is that this reads as a redirect, not a rejection. */}
          {blocked && preview && (
            <FadeIn y={6}>
              <div className="rounded-xl border border-watch/35 bg-watch/[0.07] p-4">
                <p className="flex items-center gap-2 text-body font-medium text-watch">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Let&apos;s get this to the right person
                </p>
                <p className="mt-2 text-body leading-relaxed text-ink-300">{blocked.reason}</p>

                {blocked.matched && blocked.matched.length > 0 && (
                  // Shown, not hidden. Opacity here just teaches people to
                  // guess at the filter and word around it.
                  <p className="mt-2 text-micro text-ink-500">
                    Flagged: {blocked.matched.join(" · ")}
                  </p>
                )}

                <div className="mt-3 rounded-lg bg-ink-900/70 p-3">
                  <p className="label-eyebrow">Send instead to</p>
                  <p className="mt-1 text-body text-ink-100">
                    {staffName(me.providerId)} · {blocked.suggestedEscalation?.kind}
                  </p>
                  <p className="mt-1.5 flex items-center gap-1.5 text-micro text-ink-400">
                    <Clock className="h-3 w-3" />
                    <span className="stat-mono">{preview.priority}</span>
                    <span aria-hidden>·</span>
                    answer due within{" "}
                    <span className="stat-mono">{SLA_HOURS[preview.priority]}h</span>
                  </p>
                  <p className="mt-2 border-l-2 border-ink-700 pl-2.5 text-detail italic leading-relaxed text-ink-400">
                    &ldquo;{draft.trim()}&rdquo;
                  </p>
                  <p className="mt-2 text-micro text-ink-500">
                    Sent exactly as you wrote it. Nothing gets posted to the group.
                  </p>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="primary" size="sm" onClick={sendToProvider}>
                    Send to {staffName(me.providerId)}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setBlocked(null)}>
                    Let me reword it
                  </Button>
                </div>
              </div>
            </FadeIn>
          )}

          {routed && (
            <FadeIn y={6}>
              <div className="flex items-start gap-2.5 rounded-xl border border-optimal/30 bg-optimal/[0.07] p-3.5">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-optimal" />
                <p className="text-body leading-relaxed text-ink-200">
                  On {staffName(me.providerId)}&apos;s desk with a clock on it —{" "}
                  <span className="stat-mono">{routed}</span>. You&apos;ll get the answer in
                  Messages.
                </p>
              </div>
            </FadeIn>
          )}
        </CardContent>
      </Card>

      {/* ── Thread ─────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        {all.map((p) => (
          <PostCard key={p.id} post={p} myHandle={myHandle} />
        ))}
      </div>
    </div>
  );
}

function PostCard({ post, myHandle }: { post: GroupPost; myHandle: string }) {
  const [cheered, setCheered] = useState(false);
  const isCoach = post.author === "coach";

  return (
    <Card className={cn(isCoach && "border-gold-400/25 bg-gold-400/[0.04]")}>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-detail font-semibold",
              isCoach ? "bg-gold-400/20 text-gold-200" : "bg-ink-700/70 text-ink-200",
            )}
          >
            {post.handle.slice(0, 2)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-body font-medium text-ink-100">{post.handle}</span>
              {isCoach && (
                <Badge tone="gold">
                  <ShieldCheck className="h-3 w-3" />
                  Coach
                </Badge>
              )}
              {post.handle === myHandle && !isCoach && <Badge tone="neutral">You</Badge>}
              <span className="text-micro text-ink-500">{formatDateTime(post.postedAt)}</span>
            </p>
            <p className="mt-2 whitespace-pre-line text-body leading-relaxed text-ink-300">
              {post.body}
            </p>

            <button
              onClick={() => setCheered((c) => !c)}
              aria-pressed={cheered}
              className={cn(
                "mt-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-micro transition-colors focus-ring",
                cheered
                  ? "border-optimal/30 bg-optimal/12 text-optimal"
                  : "border-ink-700 text-ink-400 hover:text-ink-100",
              )}
            >
              <Heart className={cn("h-3 w-3", cheered && "fill-current")} />
              <span className="stat-mono">{post.cheers + (cheered ? 1 : 0)}</span>
            </button>

            {post.replies && post.replies.length > 0 && (
              <div className="mt-4 space-y-3 border-l border-ink-700/70 pl-3.5">
                {post.replies.map((r) => (
                  <div key={r.id}>
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="text-detail font-medium text-ink-200">{r.handle}</span>
                      {r.author === "coach" && (
                        <Badge tone="gold">
                          <ShieldCheck className="h-3 w-3" />
                          Coach
                        </Badge>
                      )}
                      <span className="text-micro text-ink-500">
                        {formatDateTime(r.postedAt)}
                      </span>
                    </p>
                    <p className="mt-1 text-body leading-relaxed text-ink-400">{r.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
