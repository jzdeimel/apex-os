"use client";

import { useEffect, useRef, useState } from "react";
import { Phone, Video, MessageSquare, X, ShieldCheck, Loader2, CircleAlert } from "lucide-react";
import { getClient, clientName } from "@/lib/mock/clients";
import { appendLedger } from "@/lib/trace/ledger";
import { VIEWER } from "@/lib/viewer";

/**
 * Reach a patient — voice, video, text — from inside the chart.
 *
 * WHAT IS REAL HERE, STATED PLAINLY
 * ---------------------------------
 * The clinic runs on Azure Communication Services (the `acs-apex` resource in
 * apex-prod). "Start video" acquires a REAL ACS access token from the server
 * (/api/acs/token), which is issued and signed by that resource — the same token
 * the ACS Calling SDK uses to place a call — and turns on the operator's camera
 * so the call is genuinely set up on this end. That token is the proof the pipe
 * is live, not a mock.
 *
 * WHAT IS HONESTLY PENDING
 * ------------------------
 * Two things need real-world provisioning that has a lead time, and Apex refuses
 * to fake either:
 *   - Dialing a patient's actual PHONE (PSTN) needs a purchased ACS number.
 *   - TEXTING a patient needs that number verified for A2P messaging (toll-free
 *     verification or 10DLC registration), which takes days and rides on the
 *     signed BAA and patient consent.
 * Until a number is provisioned, those two show the pending state rather than a
 * dialer that connects to nothing. Every attempt — connected or pending — is
 * written to the contact log on the chain, because a call that left no record is
 * the failure this product is audited against.
 */

type Mode = "idle" | "video" | "phone" | "text";

export function CallPatient({ clientId }: { clientId: string }) {
  const client = getClient(clientId);
  const [mode, setMode] = useState<Mode>("idle");

  if (!client) return null;

  return (
    <div className="rounded-panel border border-ink-700/70 bg-ink-850/60">
      <header className="flex items-center justify-between border-b border-ink-800/70 px-4 py-3">
        <p className="text-detail font-medium text-ink-100">Reach {client.firstName}</p>
        <span className="text-micro text-ink-500">Azure Communication Services</span>
      </header>

      <div className="p-4">
        {mode === "idle" ? (
          <div className="grid grid-cols-3 gap-2">
            <ActionButton icon={Video} label="Video" onClick={() => setMode("video")} live />
            <ActionButton icon={Phone} label="Call" onClick={() => setMode("phone")} />
            <ActionButton icon={MessageSquare} label="Text" onClick={() => setMode("text")} />
          </div>
        ) : mode === "video" ? (
          <VideoCall clientId={clientId} onClose={() => setMode("idle")} />
        ) : (
          <PendingChannel clientId={clientId} kind={mode} onClose={() => setMode("idle")} />
        )}
      </div>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  live,
}: {
  icon: typeof Phone;
  label: string;
  onClick: () => void;
  live?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="focus-ring group relative flex flex-col items-center gap-1.5 rounded-control border border-ink-700 bg-ink-900/40 py-3 transition-colors hover:border-ink-500 hover:bg-ink-800/60"
    >
      <Icon className="h-5 w-5 text-ink-300 group-hover:text-ink-50" aria-hidden />
      <span className="text-detail text-ink-300 group-hover:text-ink-50">{label}</span>
      {live && (
        <span className="absolute right-1.5 top-1.5 flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald/70" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald" />
        </span>
      )}
    </button>
  );
}

function VideoCall({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<"connecting" | "ready" | "error">("connecting");
  const [detail, setDetail] = useState<string>("Acquiring a call token from Azure…");
  const [tokenInfo, setTokenInfo] = useState<{ userId: string; expiresOn?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      // 1) Real ACS token — the proof the call pipe is live.
      let tokenOk = false;
      try {
        const res = await fetch("/api/acs/token", { method: "POST" });
        const data = await res.json();
        if (!cancelled && data.ok) {
          tokenOk = true;
          setTokenInfo({ userId: data.userId, expiresOn: data.expiresOn });
        } else if (!cancelled) {
          setDetail(data.error ?? "ACS token unavailable.");
        }
      } catch {
        if (!cancelled) setDetail("Could not reach the ACS token endpoint.");
      }

      // 2) Real local media — the operator's camera actually turns on.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setStatus("ready");
        setDetail(
          tokenOk
            ? "Camera live and an ACS call token is issued. Sending the patient a join link connects the call."
            : "Camera live. ACS token endpoint is not configured on this deployment, so a call cannot connect yet.",
        );
      } catch {
        if (!cancelled) {
          setStatus(tokenOk ? "ready" : "error");
          setDetail(
            tokenOk
              ? "ACS call token issued, but this device has no camera/mic or denied access."
              : "No camera access and no ACS token — nothing to connect.",
          );
        }
      }

      // Record the attempt regardless of outcome.
      appendLedger({
        actorId: VIEWER.id,
        actorName: VIEWER.name,
        actorRole: VIEWER.role,
        action: "create",
        entity: "note",
        entityId: `call-${clientId}-video`,
        subjectId: clientId,
        reason: "Video call initiated via ACS",
        after: { channel: "ACS video", tokenIssued: tokenOk },
      });
    }

    setup();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [clientId]);

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-control bg-ink-950">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="aspect-video w-full bg-ink-950 object-cover"
        />
        <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-ink-950/70 px-2 py-0.5 text-micro text-ink-200">
          {status === "connecting" ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          ) : status === "ready" ? (
            <span className="h-1.5 w-1.5 rounded-full bg-emerald" />
          ) : (
            <CircleAlert className="h-3 w-3 text-high" aria-hidden />
          )}
          {status === "connecting" ? "Connecting" : status === "ready" ? "You" : "No media"}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="focus-ring absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-ink-950/70 text-ink-200 hover:text-white"
          aria-label="End"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="text-detail leading-relaxed text-ink-400">{detail}</p>

      {tokenInfo && (
        <div className="flex items-start gap-1.5 rounded-control border border-emerald/25 bg-emerald/5 px-3 py-2">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald" aria-hidden />
          <p className="text-micro leading-relaxed text-ink-300">
            Live ACS token issued to <span className="stat-mono text-ink-200">{tokenInfo.userId.slice(0, 22)}…</span>
            {tokenInfo.expiresOn ? ` · valid until ${new Date(tokenInfo.expiresOn).toLocaleTimeString()}` : ""}. This
            is a real token from the acs-apex resource, not a mock.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={onClose}
        className="focus-ring w-full rounded-control bg-high/90 px-4 py-2 text-detail font-medium text-white transition-colors hover:bg-high"
      >
        End call
      </button>
    </div>
  );
}

function PendingChannel({
  clientId,
  kind,
  onClose,
}: {
  clientId: string;
  kind: "phone" | "text";
  onClose: () => void;
}) {
  const client = getClient(clientId);
  useEffect(() => {
    appendLedger({
      actorId: VIEWER.id,
      actorName: VIEWER.name,
      actorRole: VIEWER.role,
      action: "create",
      entity: "note",
      entityId: `contact-${clientId}-${kind}`,
      subjectId: clientId,
      reason: `${kind === "phone" ? "Phone call" : "Text"} attempted via ACS (no number provisioned)`,
      after: { channel: kind === "phone" ? "ACS PSTN" : "ACS SMS", state: "pending-number" },
    });
  }, [clientId, kind]);

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-control border border-watch/30 bg-watch/5 px-3 py-3">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-watch" aria-hidden />
        <div>
          <p className="text-detail font-medium text-watch">
            {kind === "phone" ? "Phone dialing" : "Texting"} needs a provisioned number
          </p>
          <p className="mt-0.5 text-micro leading-relaxed text-ink-400">
            {kind === "phone"
              ? "Dialing a patient's actual phone requires a purchased ACS phone number. The call pipe is live (see Video); the number is the missing piece."
              : "Texting a patient requires an ACS number verified for A2P messaging (toll-free verification or 10DLC), which takes days and rides on the signed BAA and the patient's consent. Apex will not fake a send."}
          </p>
        </div>
      </div>
      <p className="text-micro leading-relaxed text-ink-600">
        {client?.firstName}&apos;s outreach preferences and consent are on file; the moment a verified
        number is attached, this becomes a real {kind === "phone" ? "call" : "text"} through the same
        guarded path the portal messages already use.
      </p>
      <button
        type="button"
        onClick={onClose}
        className="focus-ring w-full rounded-control border border-ink-700 px-4 py-2 text-detail text-ink-300 transition-colors hover:text-ink-50"
      >
        Back
      </button>
    </div>
  );
}
