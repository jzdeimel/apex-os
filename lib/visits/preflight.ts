"use client";

/**
 * A REAL device pre-flight for a telehealth visit.
 *
 * WHY THIS REPLACED THE OLD ONE. The previous check was `seededRandom(apptId)`:
 * three dice rolls that never touched `navigator.mediaDevices`, rendered to the
 * member as statements of fact about their own hardware ("We can't see a camera
 * on this device"), and — because the microphone result carried `blocking:true`
 * — able to DISABLE the Join button on a booked appointment with a working mic
 * and no way to re-check. A fabricated check that locks a patient out of seeing
 * their provider is the worst possible kind of fake: it does harm in the one
 * direction the member cannot argue with.
 *
 * This asks the browser instead. It is permission-aware: enumerateDevices()
 * reports devices with blank labels until permission is granted, so "no
 * devices" and "not yet allowed" are genuinely different answers and are
 * reported differently. Nothing here blocks Join on a guess — see `blocking`.
 */

export type PreflightStatus = "ok" | "warn" | "fail" | "checking";

export interface DeviceCheck {
  id: "camera" | "microphone";
  label: string;
  status: PreflightStatus;
  detail: string;
  fix?: string;
  /** Only ever true when the browser positively reported no such device. */
  blocking: boolean;
}

const CHECKING: DeviceCheck[] = [
  { id: "camera", label: "Camera", status: "checking", detail: "Checking…", blocking: false },
  { id: "microphone", label: "Microphone", status: "checking", detail: "Checking…", blocking: false },
];

export function checkingState(): DeviceCheck[] {
  return CHECKING.map((c) => ({ ...c }));
}

/**
 * Probe the real devices.
 *
 * Requests permission, because a label-less device list cannot distinguish "no
 * microphone" from "you haven't allowed one yet" — and telling somebody they
 * have no microphone when they simply have not clicked Allow is the exact bug
 * this replaces.
 */
export async function probeDevices(): Promise<DeviceCheck[]> {
  const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;

  if (!md?.enumerateDevices) {
    // An old or non-secure context. Say what is true — we could not check — and
    // do NOT block: the member may still have perfectly good hardware.
    return [
      unknown("camera", "Camera", "We couldn't check your camera in this browser."),
      unknown("microphone", "Microphone", "We couldn't check your microphone in this browser."),
    ];
  }

  let granted = false;
  let denied = false;
  try {
    const stream = await md.getUserMedia({ audio: true, video: true });
    granted = true;
    // Release immediately — holding the camera would light the indicator for
    // the whole waiting period, which reads as being recorded before the visit.
    stream.getTracks().forEach((t) => t.stop());
  } catch (err) {
    const name = (err as { name?: string } | undefined)?.name ?? "";
    // NotAllowedError = the person (or policy) said no. NotFoundError = there
    // genuinely is no device. Everything else is unknown, and unknown never
    // blocks.
    if (name === "NotAllowedError" || name === "SecurityError") denied = true;
    else if (name !== "NotFoundError" && name !== "OverconstrainedError") {
      try {
        const audio = await md.getUserMedia({ audio: true });
        audio.getTracks().forEach((t) => t.stop());
        granted = true;
      } catch {
        /* fall through to enumeration */
      }
    }
  }

  let devices: MediaDeviceInfo[] = [];
  try {
    devices = await md.enumerateDevices();
  } catch {
    return [
      unknown("camera", "Camera", "We couldn't check your camera."),
      unknown("microphone", "Microphone", "We couldn't check your microphone."),
    ];
  }

  const hasCam = devices.some((d) => d.kind === "videoinput");
  const hasMic = devices.some((d) => d.kind === "audioinput");

  const camera: DeviceCheck = hasCam
    ? { id: "camera", label: "Camera", status: "ok", detail: "Ready. You'll see a preview before anyone else does.", blocking: false }
    : denied
      ? {
          id: "camera",
          label: "Camera",
          status: "warn",
          detail: "Camera access isn't allowed yet.",
          fix: "Allow camera access in your browser, or join with audio only.",
          blocking: false,
        }
      : {
          id: "camera",
          label: "Camera",
          status: "warn",
          detail: "We can't see a camera on this device.",
          fix: "You can still join with audio only — your provider will hear you fine.",
          blocking: false,
        };

  const microphone: DeviceCheck = hasMic
    ? { id: "microphone", label: "Microphone", status: "ok", detail: "Ready.", blocking: false }
    : denied
      ? {
          id: "microphone",
          label: "Microphone",
          status: "warn",
          detail: "Microphone access isn't allowed yet.",
          fix: "Allow microphone access in your browser, then re-check.",
          // NOT blocking. Permission can be granted in a second, and the member
          // may also be dialling in by phone.
          blocking: false,
        }
      : {
          id: "microphone",
          label: "Microphone",
          status: "fail",
          detail: "No microphone found on this device.",
          fix: "Plug one in and re-check, or call the clinic to join by phone.",
          // The one genuinely blocking case, and only because the browser
          // positively reported no audio input after permission was granted.
          blocking: granted,
        };

  return [camera, microphone];
}

function unknown(id: DeviceCheck["id"], label: string, detail: string): DeviceCheck {
  return { id, label, status: "warn", detail, fix: "You can still try to join.", blocking: false };
}
