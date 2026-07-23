"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CircleAlert,
  MessageSquare,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  ShieldCheck,
} from "lucide-react";
import type {
  Call,
  CallClient,
  CallState,
} from "@azure/communication-calling";

import { normalizeUsPhoneNumber } from "@/lib/communications/calling";
import { getClient } from "@/lib/mock/clients";

interface CallPatientProps {
  clientId: string;
  clientName?: string;
  phone?: string | null;
}

interface AcsTokenResponse {
  ok?: boolean;
  error?: string;
  token?: string;
  userId?: string;
  expiresOn?: string;
  displayName?: string;
  callerId?: string | null;
  pstnConfigured?: boolean;
}

type UiCallState = "idle" | "preparing" | "error" | CallState;

function stateLabel(state: UiCallState) {
  switch (state) {
    case "idle":
      return "Ready";
    case "preparing":
      return "Preparing secure call";
    case "Connecting":
      return "Dialing";
    case "Ringing":
      return "Ringing";
    case "Connected":
      return "Connected";
    case "Disconnecting":
      return "Ending";
    case "Disconnected":
      return "Call ended";
    case "error":
      return "Call not started";
    default:
      return state;
  }
}

function elapsedLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function CallPatient({
  clientId,
  clientName,
  phone,
}: CallPatientProps) {
  const seeded = getClient(clientId);
  const patientName =
    clientName ||
    (seeded ? `${seeded.firstName} ${seeded.lastName}` : "patient");
  const rawPhone = phone !== undefined ? phone : (seeded?.phone ?? null);
  const dialNumber = useMemo(
    () => normalizeUsPhoneNumber(rawPhone),
    [rawPhone],
  );

  const [state, setState] = useState<UiCallState>("idle");
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [detail, setDetail] = useState<string | null>(null);
  const [auditWarning, setAuditWarning] = useState<string | null>(null);
  const [callerId, setCallerId] = useState<string | null>(null);

  const callRef = useRef<Call | null>(null);
  const clientRef = useRef<CallClient | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const connectedAtRef = useRef<number | null>(null);
  const connectedLoggedRef = useRef(false);
  const finalLoggedRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const call = callRef.current;
      if (call && call.state !== "Disconnected") void call.hangUp();
      void clientRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    if (state !== "Connected") return;
    const timer = window.setInterval(() => {
      const connectedAt = connectedAtRef.current;
      if (connectedAt) {
        setElapsed(Math.max(0, Math.floor((Date.now() - connectedAt) / 1000)));
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [state]);

  async function recordCallEvent(
    event: "started" | "connected" | "ended" | "failed",
    options: {
      callId?: string;
      durationSeconds?: number;
      reason?: string;
      keepalive?: boolean;
    } = {},
  ) {
    const requestId = requestIdRef.current;
    if (!requestId) throw new Error("The call request has no audit reference.");
    const response = await fetch("/api/communications/calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        requestId,
        event,
        callId: options.callId,
        durationSeconds: options.durationSeconds,
        reason: options.reason?.slice(0, 500),
      }),
      keepalive: options.keepalive,
    });
    const payload = (await response.json().catch(() => null)) as
      | { ok?: boolean; error?: string }
      | null;
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error || "The call audit record was not saved.");
    }
  }

  async function markFinal(
    event: "ended" | "failed",
    call: Call | null,
    reason?: string,
  ) {
    if (finalLoggedRef.current) return;
    finalLoggedRef.current = true;
    const connectedAt = connectedAtRef.current;
    const durationSeconds = connectedAt
      ? Math.max(0, Math.round((Date.now() - connectedAt) / 1000))
      : undefined;
    try {
      await recordCallEvent(event, {
        callId: call?.id,
        durationSeconds,
        reason,
        keepalive: true,
      });
    } catch {
      if (mountedRef.current) {
        setAuditWarning(
          "The call ended, but its final status did not save. Keep this chart open and retry before documenting another contact.",
        );
      }
    }
  }

  async function startCall() {
    if (!dialNumber || state === "preparing") return;

    setState("preparing");
    setDetail(null);
    setAuditWarning(null);
    setCallerId(null);
    setElapsed(0);
    setMuted(false);
    connectedAtRef.current = null;
    connectedLoggedRef.current = false;
    finalLoggedRef.current = false;
    requestIdRef.current = crypto.randomUUID();

    // The audit row is created before ACS receives a phone number. If the
    // durable write path is unavailable, Apex refuses to place an unrecorded
    // patient call.
    try {
      await recordCallEvent("started");
    } catch (error) {
      setState("error");
      setDetail(
        error instanceof Error
          ? error.message
          : "The call was not started because its audit record could not be created.",
      );
      return;
    }

    let token: AcsTokenResponse;
    try {
      const response = await fetch("/api/acs/token", { method: "POST" });
      token = (await response.json()) as AcsTokenResponse;
      if (!response.ok || !token.ok || !token.token) {
        throw new Error(token.error || "Azure calling is unavailable.");
      }
      if (!token.pstnConfigured || !token.callerId) {
        throw new Error(
          "Apex ACS is connected, but a public caller-ID number has not been provisioned.",
        );
      }
      setCallerId(token.callerId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Azure calling is unavailable.";
      await markFinal("failed", null, message);
      setState("error");
      setDetail(message);
      return;
    }

    try {
      const [{ CallClient }, { AzureCommunicationTokenCredential }] =
        await Promise.all([
          import("@azure/communication-calling"),
          import("@azure/communication-common"),
        ]);
      const credential = new AzureCommunicationTokenCredential(token.token);
      const callClient = new CallClient();
      clientRef.current = callClient;

      const deviceManager = await callClient.getDeviceManager();
      const permission = await deviceManager.askDevicePermission({
        audio: true,
        video: false,
      });
      if (!permission.audio) {
        throw new Error(
          "Microphone access is required. Allow it in the browser and try again.",
        );
      }

      const callAgent = await callClient.createCallAgent(credential, {
        displayName: token.displayName || "Alpha Health",
      });
      const call = callAgent.startCall(
        [{ phoneNumber: dialNumber }],
        { alternateCallerId: { phoneNumber: token.callerId } },
      );
      callRef.current = call;
      setState(call.state);

      const onMuted = () => {
        if (mountedRef.current) setMuted(call.isMuted);
      };
      const onState = () => {
        if (!mountedRef.current) return;
        setState(call.state);

        if (call.state === "Connected" && !connectedLoggedRef.current) {
          connectedLoggedRef.current = true;
          connectedAtRef.current = Date.now();
          void recordCallEvent("connected", { callId: call.id }).catch(() => {
            if (mountedRef.current) {
              setAuditWarning(
                "The call is connected, but its connected status has not saved yet.",
              );
            }
          });
        }

        if (call.state === "Disconnected") {
          const reason = call.callEndReason
            ? `ACS ${call.callEndReason.code}${
                call.callEndReason.subCode
                  ? `/${call.callEndReason.subCode}`
                  : ""
              }`
            : undefined;
          void markFinal(
            connectedAtRef.current ? "ended" : "failed",
            call,
            reason,
          );
          call.off("stateChanged", onState);
          call.off("isMutedChanged", onMuted);
          void clientRef.current?.dispose();
          clientRef.current = null;
          callRef.current = null;
        }
      };

      call.on("stateChanged", onState);
      call.on("isMutedChanged", onMuted);
      // Reconcile the state that exists at subscription time, then enrich the
      // already-durable attempt with the ACS reference. The repository refuses
      // a late "started" event from regressing a connected/final call.
      onState();
      void recordCallEvent("started", { callId: call.id }).catch(() => {
        if (mountedRef.current) {
          setAuditWarning(
            "The call started, but its ACS reference has not saved yet.",
          );
        }
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The call could not be started.";
      await markFinal("failed", callRef.current, message);
      setState("error");
      setDetail(message);
      void clientRef.current?.dispose();
      clientRef.current = null;
      callRef.current = null;
    }
  }

  async function toggleMute() {
    const call = callRef.current;
    if (!call) return;
    try {
      if (call.isMuted) await call.unmute();
      else await call.mute();
    } catch {
      setDetail("The microphone control did not apply. Check the browser permission.");
    }
  }

  async function hangUp() {
    const call = callRef.current;
    if (!call) return;
    setState("Disconnecting");
    try {
      await call.hangUp();
    } catch {
      setDetail("The hang-up request did not complete. Close this call panel.");
    }
  }

  const active =
    state !== "idle" &&
    state !== "error" &&
    state !== "Disconnected";

  return (
    <section className="rounded-panel border border-ink-700/70 bg-ink-850/60">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-800/70 px-4 py-3">
        <div>
          <p className="text-detail font-medium text-ink-100">
            Call {patientName}
          </p>
          <p className="mt-0.5 text-micro text-ink-500">
            Outbound voice through Azure Communication Services
          </p>
        </div>
        <span className="flex items-center gap-1.5 text-micro text-ink-500">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald" aria-hidden />
          Care-team scoped · audited
        </span>
      </header>

      <div className="space-y-4 p-4">
        {!dialNumber ? (
          <div className="flex items-start gap-2 rounded-control border border-watch/30 bg-watch/5 px-3 py-3">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-watch" aria-hidden />
            <div>
              <p className="text-detail font-medium text-watch">
                Correct the phone number before calling
              </p>
              <p className="mt-1 text-micro leading-relaxed text-ink-400">
                Apex could not safely convert this chart value to a US E.164
                number. The call was not attempted.
              </p>
            </div>
          </div>
        ) : !active && state !== "Disconnected" ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void startCall()}
              className="focus-ring flex items-center justify-center gap-2 rounded-control bg-emerald px-4 py-3 text-detail font-semibold text-ink-950 transition-colors hover:bg-emerald/90"
            >
              <Phone className="h-4 w-4" aria-hidden />
              {state === "error" ? "Try call again" : "Call patient"}
            </button>
            <button
              type="button"
              disabled
              className="flex cursor-not-allowed items-center justify-center gap-2 rounded-control border border-ink-800 px-4 py-3 text-detail text-ink-600"
              title="SMS requires a verified messaging number and patient consent workflow."
            >
              <MessageSquare className="h-4 w-4" aria-hidden />
              Text · setup pending
            </button>
          </div>
        ) : (
          <div className="rounded-control border border-ink-700 bg-ink-950/50 p-4">
            <div className="flex items-center gap-3">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  state === "Connected"
                    ? "bg-emerald"
                    : state === "Disconnected"
                      ? "bg-ink-600"
                      : "animate-pulse bg-gold-300"
                }`}
              />
              <div>
                <p className="text-body font-medium text-ink-100">
                  {stateLabel(state)}
                </p>
                <p className="text-micro text-ink-500">
                  {state === "Connected"
                    ? elapsedLabel(elapsed)
                    : dialNumber}
                  {callerId ? ` · from ${callerId}` : ""}
                </p>
              </div>
            </div>

            {active && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void toggleMute()}
                  disabled={!callRef.current}
                  className="focus-ring flex items-center justify-center gap-2 rounded-control border border-ink-700 px-4 py-2.5 text-detail text-ink-200 hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {muted ? (
                    <MicOff className="h-4 w-4" aria-hidden />
                  ) : (
                    <Mic className="h-4 w-4" aria-hidden />
                  )}
                  {muted ? "Unmute" : "Mute"}
                </button>
                <button
                  type="button"
                  onClick={() => void hangUp()}
                  disabled={!callRef.current}
                  className="focus-ring flex items-center justify-center gap-2 rounded-control bg-high/90 px-4 py-2.5 text-detail font-medium text-white hover:bg-high disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <PhoneOff className="h-4 w-4" aria-hidden />
                  End call
                </button>
              </div>
            )}
          </div>
        )}

        {state === "Disconnected" && (
          <button
            type="button"
            onClick={() => {
              setState("idle");
              setDetail(null);
              setAuditWarning(null);
            }}
            className="focus-ring w-full rounded-control border border-ink-700 px-4 py-2.5 text-detail text-ink-200 hover:bg-ink-800"
          >
            Start another call
          </button>
        )}

        {detail && (
          <p className="rounded-control border border-high/30 bg-high/5 px-3 py-2 text-micro leading-relaxed text-high">
            {detail}
          </p>
        )}
        {auditWarning && (
          <p className="rounded-control border border-watch/30 bg-watch/5 px-3 py-2 text-micro leading-relaxed text-watch">
            {auditWarning}
          </p>
        )}

        <p className="text-micro leading-relaxed text-ink-600">
          Apex creates the patient contact record before dialing and records
          connection, completion, duration, and ACS result without storing an
          audio recording.
        </p>
      </div>
    </section>
  );
}
