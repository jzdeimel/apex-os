"use client";

import { useMemo, useState } from "react";
import { Ban, Check, Send, ShieldCheck, Users } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  Textarea,
  Input,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import {
  EXCLUSION_LABEL,
  EXCLUSION_WHY,
  SEGMENTS,
  SEGMENT_BY_ID,
  previewBroadcast,
  reachabilitySnapshot,
  sendBroadcast,
  type BroadcastResult,
} from "@/lib/ops/broadcast";
import { SCOPE_DESCRIPTION, SCOPE_LABEL } from "@/lib/comms/consent";
import type { ConsentScope, ContactChannel } from "@/lib/comms/types";
import { locationName } from "@/lib/mock/locations";
import { cn } from "@/lib/utils";

/**
 * BROADCAST.
 *
 * The layout makes one claim: the excluded count is not a footnote, it is the
 * compliance artifact. So it sits beside reach at identical weight, broken out
 * by reason, with the named members behind each reason one click away — because
 * "88 excluded" is a number and "88 people we were not permitted to text" is a
 * fact somebody can check.
 *
 * The send control is disabled until a preview exists and stays disabled on a
 * scope mismatch. Scope laundering — sending a promotional offer under the
 * operational scope because operational consent is near-universal — is the one
 * mistake on this screen that is deliberate rather than careless, so it is a
 * hard stop rather than a warning banner somebody dismisses.
 */
const CHANNELS: ContactChannel[] = ["SMS", "Email", "Portal message"];
const SCOPES: ConsentScope[] = ["operational", "clinical", "marketing"];

export default function BroadcastPage() {
  const { toast } = useToast();
  // Opens on a marketing SMS to lapsed members — deliberately the combination
  // with the largest exclusion count. A compliance surface that opens on the
  // one audience where every guard passes teaches an operator nothing about
  // what the guards do.
  const [segmentId, setSegmentId] = useState("lapsed");
  const [channel, setChannel] = useState<ContactChannel>("SMS");
  const [scope, setScope] = useState<ConsentScope>("marketing");
  const [subject, setSubject] = useState("We'd like to see you back");
  const [body, setBody] = useState(
    "Hi — it's been a while. If you'd like to pick your program back up, reply here or book from the portal and we'll take it from there.",
  );
  const [openReason, setOpenReason] = useState<string | null>(null);
  const [result, setResult] = useState<BroadcastResult | null>(null);
  const [sending, setSending] = useState(false);

  const segment = SEGMENT_BY_ID[segmentId];
  const preview = useMemo(
    () => previewBroadcast(segmentId, channel, scope),
    [segmentId, channel, scope],
  );
  const reach = useMemo(() => reachabilitySnapshot(channel, scope), [channel, scope]);

  async function onSend() {
    setSending(true);
    try {
      const r = await sendBroadcast(preview, body, channel === "Email" ? subject : undefined);
      setResult(r);
      toast(`Queued ${r.sent} messages`, {
        desc: `${preview.excluded.length} members excluded and recorded on ledger row ${r.ledgerRowId}.`,
        tone: "success",
      });
    } catch (e) {
      toast("Broadcast blocked", {
        desc: e instanceof Error ? e.message : "Preview did not clear.",
        tone: "warn",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
        <p className="label-eyebrow">Operations</p>
        <h1 className="font-display text-title font-semibold text-ink-50">Broadcast</h1>
        <p className="mt-1 max-w-2xl text-body text-ink-400">
          Consent is evaluated before anything is composed. The number that keeps
          this clinic compliant is the excluded count, not the reach.
        </p>

      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* ---------------------------------------------------------------- */}
        {/* Compose                                                           */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Audience</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="label-eyebrow" htmlFor="segment">
                  Segment
                </label>
                <Select
                  id="segment"
                  className="mt-1.5"
                  value={segmentId}
                  onChange={(e) => {
                    setSegmentId(e.target.value);
                    setResult(null);
                  }}
                >
                  {SEGMENTS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
                {segment && (
                  <p className="mt-1.5 text-detail text-ink-400">
                    {segment.description} Natural scope:{" "}
                    <span className="text-ink-200">{SCOPE_LABEL[segment.naturalScope]}</span>.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="label-eyebrow" htmlFor="channel">
                    Channel
                  </label>
                  <Select
                    id="channel"
                    className="mt-1.5"
                    value={channel}
                    onChange={(e) => {
                      setChannel(e.target.value as ContactChannel);
                      setResult(null);
                    }}
                  >
                    {CHANNELS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="label-eyebrow" htmlFor="scope">
                    Consent scope
                  </label>
                  <Select
                    id="scope"
                    className="mt-1.5"
                    value={scope}
                    onChange={(e) => {
                      setScope(e.target.value as ConsentScope);
                      setResult(null);
                    }}
                  >
                    {SCOPES.map((s) => (
                      <option key={s} value={s}>
                        {SCOPE_LABEL[s]}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <p className="text-detail text-ink-500">{SCOPE_DESCRIPTION[scope]}</p>

              <div className="rounded-xl border border-ink-700/60 bg-ink-900/40 p-3 text-detail text-ink-400">
                Clinic-wide, <span className="stat-mono text-ink-200">{reach.reachable}</span> of{" "}
                <span className="stat-mono text-ink-200">{reach.total}</span> members
                ({Math.round(reach.share * 100)}%) hold live {scope} consent on {channel}.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Message</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {channel === "Email" && (
                <div>
                  <label className="label-eyebrow" htmlFor="subject">
                    Subject
                  </label>
                  <Input
                    id="subject"
                    className="mt-1.5"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                </div>
              )}
              <div>
                <label className="label-eyebrow" htmlFor="body">
                  Body
                </label>
                <Textarea
                  id="body"
                  className="mt-1.5"
                  rows={5}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
                <p className="mt-1.5 text-detail text-ink-500">
                  <span className="stat-mono">{body.length}</span> characters. Under
                  the clinical scope this may contain PHI; under operational or
                  marketing it must not.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Preview — reach and exclusions at equal weight                    */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="card p-4">
              <p className="label-eyebrow">Matched</p>
              <p className="stat-mono mt-1 text-title text-ink-200">{preview.matched}</p>
              <p className="mt-1 text-micro text-ink-500">Before any guard ran.</p>
            </div>
            <div className="card border-optimal/30 p-4">
              <p className="label-eyebrow">Will receive</p>
              <p className="stat-mono mt-1 text-title text-optimal">{preview.eligible.length}</p>
              <p className="mt-1 text-micro text-ink-500">Consent verified per member.</p>
            </div>
            <div className="card border-high/30 p-4">
              <p className="label-eyebrow">Excluded</p>
              <p className="stat-mono mt-1 text-title text-high">{preview.excluded.length}</p>
              <p className="mt-1 text-micro text-ink-500">
                The number that keeps you compliant.
              </p>
            </div>
          </div>

          {preview.scopeMismatch && (
            <div className="flex items-start gap-3 rounded-2xl border border-high/50 bg-high/[0.09] p-4">
              <Ban className="mt-0.5 h-5 w-5 shrink-0 text-high" />
              <div>
                <p className="text-body font-medium text-ink-50">Send blocked — scope mismatch</p>
                <p className="mt-1 text-body leading-relaxed text-ink-300">
                  {preview.scopeMismatchDetail}
                </p>
              </div>
            </div>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Why {preview.excluded.length} members are excluded</CardTitle>
              <ShieldCheck className="h-4 w-4 text-ink-500" />
            </CardHeader>
            <CardContent className="space-y-2">
              {preview.exclusionBreakdown.length === 0 ? (
                <p className="text-body text-ink-400">
                  Nobody in this segment is excluded on this channel and scope.
                </p>
              ) : (
                preview.exclusionBreakdown.map((b) => (
                  <div
                    key={b.reason}
                    className="rounded-xl border border-ink-700/60 bg-ink-900/40"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setOpenReason(openReason === b.reason ? null : b.reason)
                      }
                      className="focus-ring flex w-full items-center justify-between gap-3 rounded-xl p-3.5 text-left"
                    >
                      <span className="min-w-0">
                        <span className="block text-body text-ink-100">
                          {EXCLUSION_LABEL[b.reason]}
                        </span>
                        <span className="mt-0.5 block text-detail leading-relaxed text-ink-500">
                          {EXCLUSION_WHY[b.reason]}
                        </span>
                      </span>
                      <span className="stat-mono shrink-0 text-heading text-high">{b.count}</span>
                    </button>
                    {openReason === b.reason && (
                      <ul className="max-h-56 overflow-y-auto border-t border-ink-700/60 px-3.5 py-2 text-detail">
                        {b.members.slice(0, 60).map((m) => (
                          <li
                            key={m.clientId}
                            className="flex items-center justify-between gap-3 py-1"
                          >
                            <span className="text-ink-300">{m.name}</span>
                            <span className="text-ink-600">{locationName(m.locationId)}</span>
                          </li>
                        ))}
                        {b.members.length > 60 && (
                          <li className="py-1 text-ink-600">
                            +{b.members.length - 60} more
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-body text-ink-400">
                <Users className="h-4 w-4 text-ink-500" />
                {preview.canSend ? (
                  <span>
                    Sending to{" "}
                    <span className="stat-mono text-ink-100">{preview.eligible.length}</span>{" "}
                    members, skipping{" "}
                    <span className="stat-mono text-high">{preview.excluded.length}</span>.
                  </span>
                ) : (
                  <span>Send unavailable — preview has not cleared.</span>
                )}
              </div>
              <Button
                variant="primary"
                onClick={onSend}
                disabled={!preview.canSend || sending || body.trim().length === 0}
              >
                <Send className="h-3.5 w-3.5" />
                {sending ? "Queuing…" : "Send broadcast"}
              </Button>
            </CardContent>
          </Card>

          {result && (
            <div className="flex items-start gap-3 rounded-2xl border border-optimal/30 bg-optimal/[0.07] p-4">
              <Check className="mt-0.5 h-5 w-5 shrink-0 text-optimal" />
              <div className="text-body leading-relaxed text-ink-300">
                <p className="font-medium text-ink-50">
                  Queued <span className="stat-mono">{result.sent}</span> messages.
                </p>
                <p className="mt-1">
                  Batch <span className="stat-mono text-ink-200">{result.batchId}</span> ·
                  ledger row{" "}
                  <span className="stat-mono text-ink-200">{result.ledgerRowId}</span>. The
                  exclusion tally is on that row, not only on this screen — a
                  record that only proves what was sent cannot answer who was
                  protected.
                </p>
                {result.refused > 0 && (
                  <p className={cn("mt-1 text-watch")}>
                    <span className="stat-mono">{result.refused}</span> refused at
                    send time despite clearing preview. State changed between
                    preview and send — this is why the guard lives in the send
                    path and not in this page.
                  </p>
                )}
              </div>
            </div>
          )}

          <p className="text-detail leading-relaxed text-ink-500">
            Nothing transmits in this build. Every message still goes through the
            single guarded send path individually, each with its own idempotency
            key, so a double-clicked send is a no-op rather than a double send.
            Quiet hours and the per-member weekly cap are enforced there and are
            reflected in the exclusion breakdown above.
          </p>
        </div>
      </div>

      <div className="mt-6">
        <p className="label-eyebrow">Segment definitions</p>
        <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {SEGMENTS.map((s) => (
            <div key={s.id} className="rounded-xl border border-ink-700/70 bg-ink-850/60 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-body font-medium text-ink-100">{s.name}</p>
                <Badge tone={s.naturalScope === "marketing" ? "high" : "neutral"}>
                  {SCOPE_LABEL[s.naturalScope]}
                </Badge>
              </div>
              <p className="mt-1.5 text-detail leading-relaxed text-ink-400">{s.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
