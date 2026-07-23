"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Clock3,
  Flag,
  Loader2,
  MessageCircle,
  Paperclip,
  Send,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import Link from "next/link";

import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import {
  COMMUNITY_REPORT_REASONS,
  type CommunityReportReason,
} from "@/lib/community/moderation";

interface CommunityPayload {
  ok: boolean;
  enrolled: boolean;
  community: null | {
    membership: { handle: string; joinedAt: string };
    group: {
      id: string;
      name: string;
      charter: string;
      owner: { id: string; name: string };
      backup: { id: string; name: string } | null;
      policy: {
        attachmentsEnabled: boolean;
        maxAttachmentBytes: number;
        allowedAttachmentMimeTypes: string[];
        responseMinutes: Record<"critical" | "high" | "medium" | "low", number>;
        contentRetentionDays: number;
        attachmentRetentionDays: number;
      };
    };
    posts: Array<{
      id: string;
      parentPostId: string | null;
      authorKind: "member" | "staff";
      authorHandle: string;
      body: string;
      postedAt: string;
      isMine: boolean;
      canBlock: boolean;
      attachments: Array<{
        id: string;
        originalName: string;
        mimeType: string;
        byteSize: number;
      }>;
    }>;
  };
}

function requestId() {
  return crypto.randomUUID().replaceAll("-", "");
}

function formatPosted(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function PatientCommunity() {
  const { toast } = useToast();
  const [payload, setPayload] = useState<CommunityPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [routeOffer, setRouteOffer] = useState<string | null>(null);
  const [reportPostId, setReportPostId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState<CommunityReportReason>("privacy");
  const [reportDetail, setReportDetail] = useState("");
  const [workingPostId, setWorkingPostId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/patient/community", { cache: "no-store" });
      const result = (await response.json().catch(() => null)) as
        | (CommunityPayload & { error?: string })
        | null;
      if (!response.ok || !result?.ok) throw new Error(result?.error ?? "Community is unavailable.");
      setPayload(result);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Community is unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const topLevel = useMemo(
    () => payload?.community?.posts.filter((post) => !post.parentPostId) ?? [],
    [payload],
  );

  async function post() {
    const text = draft.trim();
    if (!text) return;
    setPosting(true);
    setRouteOffer(null);
    try {
      const response = await fetch("/api/patient/community", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: text, requestId: requestId() }),
      });
      const result = (await response.json().catch(() => null)) as
        | { error?: string; routeRequired?: boolean }
        | null;
      if (response.status === 422 && result?.routeRequired) {
        setRouteOffer(result.error ?? "This belongs in a private message to your coach.");
        return;
      }
      if (!response.ok) throw new Error(result?.error ?? "Your post was not confirmed.");
      setDraft("");
      toast("Posted to your group", {
        desc: `Visible as ${payload?.community?.membership.handle ?? "your community handle"}`,
        tone: "info",
      });
      await load();
    } catch (postError) {
      toast("Post failed", {
        desc: postError instanceof Error ? postError.message : "Please retry.",
        tone: "warn",
      });
    } finally {
      setPosting(false);
    }
  }

  async function sendToCoach() {
    const text = draft.trim();
    if (!text) return;
    setPosting(true);
    try {
      const response = await fetch("/api/patient/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: text, requestId: requestId() }),
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error ?? "Your coach message was not confirmed.");
      setDraft("");
      setRouteOffer(null);
      toast("Sent privately to your coach", {
        desc: "Nothing was posted to the community.",
        tone: "info",
      });
    } catch (messageError) {
      toast("Private message failed", {
        desc: messageError instanceof Error ? messageError.message : "Please retry.",
        tone: "warn",
      });
    } finally {
      setPosting(false);
    }
  }

  async function submitReport() {
    if (!reportPostId) return;
    setWorkingPostId(reportPostId);
    try {
      const response = await fetch("/api/patient/community/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          postId: reportPostId,
          requestId: requestId(),
          reason: reportReason,
          detail: reportDetail,
        }),
      });
      const result = (await response.json().catch(() => null)) as
        | { error?: string; firstResponseDueAt?: string | null }
        | null;
      if (!response.ok) throw new Error(result?.error ?? "Your report was not confirmed.");
      toast("Report sent to the moderator", {
        desc: result?.firstResponseDueAt
          ? `First response due ${formatPosted(result.firstResponseDueAt)}`
          : "The owned moderation queue has it.",
        tone: "info",
      });
      setReportPostId(null);
      setReportDetail("");
    } catch (reportError) {
      toast("Report failed", {
        desc: reportError instanceof Error ? reportError.message : "Please retry.",
        tone: "warn",
      });
    } finally {
      setWorkingPostId(null);
    }
  }

  async function block(postId: string) {
    setWorkingPostId(postId);
    try {
      const response = await fetch("/api/patient/community/block", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ postId, blocked: true, reason: "Patient-controlled community boundary" }),
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error ?? "The block was not confirmed.");
      toast("Member blocked", {
        desc: "Their posts are hidden from your feed. They are not notified.",
        tone: "info",
      });
      await load();
    } catch (blockError) {
      toast("Block failed", {
        desc: blockError instanceof Error ? blockError.message : "Please retry.",
        tone: "warn",
      });
    } finally {
      setWorkingPostId(null);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto min-h-screen max-w-4xl px-5 py-10">
        <div className="flex items-center gap-3 text-body text-ink-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your community…
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto min-h-screen max-w-4xl px-5 py-10">
        <Link href="/patient" className="inline-flex items-center gap-2 text-detail text-gold-300">
          <ArrowLeft className="h-4 w-4" /> Back to your portal
        </Link>
        <Card className="mt-6 border-watch/30">
          <CardContent className="p-6">
            <AlertTriangle className="h-5 w-5 text-watch" />
            <h1 className="mt-3 font-display text-title text-ink-50">Community unavailable</h1>
            <p className="mt-2 text-body text-ink-400">{error}</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!payload?.enrolled || !payload.community) {
    return (
      <main className="mx-auto min-h-screen max-w-4xl px-5 py-10">
        <Link href="/patient" className="inline-flex items-center gap-2 text-detail text-gold-300">
          <ArrowLeft className="h-4 w-4" /> Back to your portal
        </Link>
        <Card className="mt-6">
          <CardContent className="p-7 text-center">
            <UsersRound className="mx-auto h-7 w-7 text-ink-500" />
            <h1 className="mt-4 font-display text-title text-ink-50">Your community room is not assigned yet</h1>
            <p className="mx-auto mt-2 max-w-xl text-body leading-relaxed text-ink-400">
              Community is opt-in. Your coach must place you in an owned, moderated room before posts become visible.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const community = payload.community;
  return (
    <main className="mx-auto min-h-screen max-w-4xl px-5 py-8 sm:px-8 sm:py-12">
      <Link href="/patient" className="inline-flex items-center gap-2 text-detail text-gold-300 hover:text-gold-200">
        <ArrowLeft className="h-4 w-4" /> Back to your portal
      </Link>
      <header className="mt-6 border-b border-ink-700/70 pb-7">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="optimal"><ShieldCheck className="h-3 w-3" /> Moderated</Badge>
          <Badge tone="neutral">You post as {community.membership.handle}</Badge>
        </div>
        <h1 className="mt-4 font-display text-display text-ink-50">{community.group.name}</h1>
        <p className="mt-3 max-w-3xl text-body leading-relaxed text-ink-400">{community.group.charter}</p>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-detail text-ink-500">
          <span>Primary moderator: <strong className="font-medium text-ink-300">{community.group.owner.name}</strong></span>
          <span>Backup: <strong className="font-medium text-ink-300">{community.group.backup?.name ?? "Clinic operations"}</strong></span>
          <span className="flex items-center gap-1.5">
            <Clock3 className="h-3.5 w-3.5" />
            urgent reports answered within {community.group.policy.responseMinutes.high} minutes
          </span>
        </div>
      </header>

      <Card className="mt-7">
        <CardContent className="space-y-3 p-5">
          <Textarea
            rows={3}
            value={draft}
            maxLength={3_000}
            placeholder="Share a win, habit, event, training day, meal, or something that helped you show up."
            onChange={(event) => {
              setDraft(event.target.value);
              setRouteOffer(null);
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-micro text-ink-500">
              <Paperclip className="h-3 w-3" />
              {community.group.policy.attachmentsEnabled
                ? "Attachments are released only after malware scanning."
                : "Attachments are currently off while private scanning is completed."}
            </p>
            <Button variant="primary" size="sm" disabled={posting || !draft.trim()} onClick={() => void post()}>
              {posting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Post
            </Button>
          </div>
          {routeOffer && (
            <div className="rounded-control border border-watch/30 bg-watch/[0.06] p-4">
              <p className="flex items-center gap-2 text-body font-medium text-watch">
                <MessageCircle className="h-4 w-4" />
                This belongs in a private conversation
              </p>
              <p className="mt-2 text-detail leading-relaxed text-ink-300">{routeOffer}</p>
              <Button className="mt-3" variant="primary" size="sm" onClick={() => void sendToCoach()}>
                Send these words privately to my coach
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <section className="mt-7 space-y-4" aria-label="Community posts">
        {topLevel.length ? (
          topLevel.map((post) => (
            <Card key={post.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink-100">{post.authorHandle}</span>
                      {post.authorKind === "staff" && <Badge tone="gold">Moderator</Badge>}
                      {post.isMine && <Badge tone="neutral">You</Badge>}
                    </p>
                    <p className="mt-1 text-micro text-ink-500">{formatPosted(post.postedAt)}</p>
                  </div>
                  {!post.isMine && (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Report post by ${post.authorHandle}`}
                        onClick={() => setReportPostId(post.id)}
                      >
                        <Flag className="h-3.5 w-3.5" /> Report
                      </Button>
                      {post.canBlock && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={workingPostId === post.id}
                          aria-label={`Block ${post.authorHandle}`}
                          onClick={() => void block(post.id)}
                        >
                          <Ban className="h-3.5 w-3.5" /> Block
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                <p className="mt-4 whitespace-pre-line text-body leading-relaxed text-ink-300">{post.body}</p>
                {post.attachments.length > 0 && (
                  <ul className="mt-4 space-y-2">
                    {post.attachments.map((attachment) => (
                      <li key={attachment.id} className="flex items-center gap-2 rounded-control border border-ink-800 p-2.5 text-detail text-ink-300">
                        <Paperclip className="h-3.5 w-3.5 text-optimal" />
                        {attachment.originalName}
                        <Badge tone="optimal">Scanned</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="rounded-panel border border-dashed border-ink-700 p-8 text-center">
            <UsersRound className="mx-auto h-7 w-7 text-ink-500" />
            <p className="mt-3 text-body font-medium text-ink-200">No posts yet</p>
            <p className="mt-1 text-detail text-ink-500">Start with something that helped you show up this week.</p>
          </div>
        )}
      </section>

      {reportPostId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/85 p-4" role="dialog" aria-modal="true" aria-labelledby="report-title">
          <Card className="w-full max-w-lg border-watch/30">
            <CardContent className="space-y-4 p-6">
              <div>
                <h2 id="report-title" className="font-display text-title text-ink-50">Report this post</h2>
                <p className="mt-2 text-detail leading-relaxed text-ink-400">
                  The named group moderator receives this with a response deadline. The author is not told who reported it.
                </p>
              </div>
              <label className="space-y-1.5 text-micro text-ink-400">
                Reason
                <Select value={reportReason} onChange={(event) => setReportReason(event.target.value as CommunityReportReason)}>
                  {COMMUNITY_REPORT_REASONS.map((reason) => (
                    <option key={reason} value={reason}>{reason.replaceAll("-", " ")}</option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1.5 text-micro text-ink-400">
                What should the moderator know? (optional)
                <Input value={reportDetail} maxLength={2_000} onChange={(event) => setReportDetail(event.target.value)} />
              </label>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setReportPostId(null)}>Cancel</Button>
                <Button variant="danger" disabled={workingPostId === reportPostId} onClick={() => void submitReport()}>
                  <Flag className="h-4 w-4" /> Send report
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}
