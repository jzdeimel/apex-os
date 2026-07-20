import type { Appointment } from "@/lib/types";
import {
  startVideoVisit,
  videoLinkActive,
  ACS_DEMO_DISCLOSURE,
  VIDEO_LINK_TTL_MINUTES,
  type VideoVisit,
} from "@/lib/azure/communication";
import { findAppointment } from "@/lib/booking/availability";
import { staffMap } from "@/lib/mock/staff";
import { seededRandom, absolute } from "@/lib/utils";

/**
 * The telehealth room.
 *
 * Thin on purpose: the room itself is `startVideoVisit` in
 * lib/azure/communication.ts, which models Azure Communication Services Rooms.
 * This module adds the two things a member-facing visit screen needs and an
 * SDK does not provide — a pre-flight check, and a join window.
 *
 * WHY ACS RATHER THAN A VIDEO VENDOR
 *   Restating the point from the adapter because it is the reason this file
 *   looks the way it does: every third-party video platform in a telehealth
 *   path is another company holding a clinical conversation. Another BAA,
 *   another subprocessor, another breach that becomes Alpha Health's breach
 *   notification, another vendor that can decide next quarter that healthcare
 *   is no longer a supported use case. ACS keeps the room inside the same
 *   tenant and the same BAA as the database the visit is documented in, so
 *   there is no third party in the PHI path at all. That is worth more than any
 *   feature a vendor could offer, and it is why nothing in this module reaches
 *   for an external SDK.
 *
 * WHY A PRE-FLIGHT CHECK IS NOT COSMETIC
 *   The most common way a telehealth visit fails is not the network — it is a
 *   member discovering at 2:00pm that the browser never had camera permission.
 *   Ten minutes of a clinician's day disappear into "can you hear me now". The
 *   check runs BEFORE the join button is live, and a failing camera does not
 *   block the visit: audio-only is a real telehealth visit and the screen says
 *   so rather than stranding someone.
 *
 * DEMO STATE. Nothing below touches `navigator.mediaDevices`. Results are
 * seeded from the appointment id so a screenshot is reproducible, and the
 * disclosure from the adapter is re-exported so no surface can render this
 * without it.
 */

const NOW = "2026-06-12T09:00:00";

/** The join button goes live this long before the appointment starts. */
export const JOIN_WINDOW_OPENS_MIN = 10;

/** And stays live this long after, so a late member is not locked out. */
export const JOIN_GRACE_MIN = 20;

export type CheckStatus = "ok" | "warn" | "fail" | "checking";

export interface PreflightCheck {
  id: "camera" | "microphone" | "connection" | "browser";
  label: string;
  status: CheckStatus;
  /** What the member sees. Plain, and never blames them. */
  detail: string;
  /** What to do about it, when there is something to do. */
  fix?: string;
  /** False when this check failing still permits the visit to go ahead. */
  blocking: boolean;
}

export type JoinState = "too-early" | "open" | "in-progress" | "expired" | "not-telehealth";

export interface VisitRoomState {
  appointmentId: string;
  appointment: Appointment;
  /** The ACS-shaped room. Absent when the adapter refused. */
  room?: VideoVisit;
  error?: string;
  preflight: PreflightCheck[];
  /** True when nothing blocking failed. */
  ready: boolean;
  /** True when the member can join right now. */
  joinable: boolean;
  joinState: JoinState;
  /** Member-facing sentence for the current join state. */
  joinHint: string;
  opensAt: string;
  closesAt: string;
  /** Who will be in the room, in member-facing language. */
  attendees: { name: string; role: string; you: boolean }[];
  linkTtlMinutes: number;
  demo: true;
  disclosure: string;
}

// ---------------------------------------------------------------------------
// Pre-flight
// ---------------------------------------------------------------------------

function preflightFor(apptId: string): PreflightCheck[] {
  const rand = seededRandom(`preflight:${apptId}`);
  const cameraRoll = rand();
  const micRoll = rand();
  const netRoll = rand();

  const camera: PreflightCheck =
    cameraRoll > 0.85
      ? {
          id: "camera",
          label: "Camera",
          status: "warn",
          detail: "We can't see a camera on this device.",
          fix: "You can still join with audio only — your provider will hear you fine.",
          blocking: false,
        }
      : {
          id: "camera",
          label: "Camera",
          status: "ok",
          detail: "Ready. You'll see a preview before anyone else does.",
          blocking: false,
        };

  const microphone: PreflightCheck =
    micRoll > 0.94
      ? {
          id: "microphone",
          label: "Microphone",
          status: "fail",
          detail: "No microphone available.",
          // Audio is the one genuinely blocking requirement: a visit where the
          // member cannot speak is not a visit.
          fix: "Check your browser's microphone permission, or call us and we'll switch this to a phone visit.",
          blocking: true,
        }
      : {
          id: "microphone",
          label: "Microphone",
          status: "ok",
          detail: "Ready. We'll check your level when you join.",
          blocking: true,
        };

  const connection: PreflightCheck =
    netRoll > 0.78
      ? {
          id: "connection",
          label: "Connection",
          status: "warn",
          detail: "Your connection is a little light for video.",
          fix: "Move closer to your router, or join by audio if it drops.",
          blocking: false,
        }
      : {
          id: "connection",
          label: "Connection",
          status: "ok",
          detail: "Strong enough for video both ways.",
          blocking: false,
        };

  const browser: PreflightCheck = {
    id: "browser",
    label: "Browser",
    status: "ok",
    detail: "Supported. Nothing to install and nothing to download.",
    blocking: true,
  };

  return [camera, microphone, connection, browser];
}

// ---------------------------------------------------------------------------
// Join window
// ---------------------------------------------------------------------------

function shift(iso: string, minutes: number): string {
  return absolute(absolute(iso).getTime() + minutes * 60_000).toISOString().slice(0, 19);
}

function joinStateFor(appt: Appointment, at: string): JoinState {
  const opens = shift(appt.start, -JOIN_WINDOW_OPENS_MIN);
  const ends = shift(appt.start, appt.durationMin + JOIN_GRACE_MIN);
  if (at < opens) return "too-early";
  if (at > ends) return "expired";
  if (at >= appt.start) return "in-progress";
  return "open";
}

const JOIN_HINTS: Record<JoinState, string> = {
  "too-early": "The room opens 10 minutes before your start time. Run the checks now so there's nothing to fix later.",
  open: "The room is open. Your provider joins at your start time — you won't be sitting alone in a lobby.",
  "in-progress": "Your visit has started. Join now.",
  expired: "This room has closed. Message your care team and we'll get you rebooked — nothing is lost.",
  "not-telehealth": "This visit happens in the clinic. There's no room to join.",
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Everything a visit screen needs for one appointment.
 *
 * Returns `null` only when the appointment does not exist — every other
 * failure is expressed in the returned state, because a screen that renders
 * nothing tells the member nothing.
 */
export function roomFor(apptId: string, at: string = NOW): VisitRoomState | null {
  const appt = findAppointment(apptId);
  if (!appt) return null;

  const isVirtual = appt.locationId === "telehealth" || appt.type === "Telehealth";
  const preflight = preflightFor(apptId);
  const ready = preflight.every((c) => !c.blocking || c.status === "ok");

  const result = startVideoVisit(appt.id, {
    staffId: appt.staffId,
    clientId: appt.clientId,
    at: shift(appt.start, -JOIN_WINDOW_OPENS_MIN),
  });
  const room = result.value;

  const state: JoinState = !isVirtual ? "not-telehealth" : joinStateFor(appt, at);
  const linkLive = room ? videoLinkActive(room, at) : false;

  const clinician = staffMap[appt.staffId];

  return {
    appointmentId: appt.id,
    appointment: appt,
    room,
    error: result.ok ? undefined : result.error,
    preflight,
    ready,
    // Every gate has to pass: it must be a video visit, in its window, with a
    // live link and a working microphone. Any one of them failing is a specific
    // message rather than a greyed-out button with no explanation.
    joinable: isVirtual && (state === "open" || state === "in-progress") && linkLive && ready,
    joinState: state,
    joinHint: JOIN_HINTS[state],
    opensAt: shift(appt.start, -JOIN_WINDOW_OPENS_MIN),
    closesAt: shift(appt.start, appt.durationMin + JOIN_GRACE_MIN),
    attendees: [
      {
        name: clinician?.name ?? "Your care team",
        role: clinician?.credentials ? `${clinician.role} · ${clinician.credentials}` : clinician?.role ?? "Care team",
        you: false,
      },
      { name: appt.clientName, role: "You", you: true },
    ],
    linkTtlMinutes: VIDEO_LINK_TTL_MINUTES,
    demo: true,
    disclosure: ACS_DEMO_DISCLOSURE,
  };
}

/**
 * What the member is promised about the room, shown next to the join button.
 *
 * Recording is the load-bearing line. It is off, this build has no path to turn
 * it on, and saying so plainly is worth more to a member deciding whether to be
 * honest about their symptoms than any amount of encryption copy.
 */
export const ROOM_ASSURANCES = [
  "Not recorded. There is no button anywhere in Apex that turns recording on.",
  "Only the two of you are admitted — the room has a named roster, not a link anyone can walk into.",
  "Your join link is single-visit and expires. It stops working after your visit whether you used it or not.",
  "Video runs on Alpha Health's own Microsoft infrastructure. No outside video company is in the call.",
] as const;
