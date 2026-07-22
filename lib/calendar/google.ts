import { createHash } from "node:crypto";
import { JWT } from "google-auth-library";

const FREE_BUSY_SCOPE = "https://www.googleapis.com/auth/calendar.freebusy";
const FREE_BUSY_URL = "https://www.googleapis.com/calendar/v3/freeBusy";

type ServiceAccount = {
  type: "service_account";
  client_email: string;
  private_key: string;
  token_uri?: string;
};

export type GoogleBusyWindow = { id: string; start: string; end: string };

export function parseGoogleServiceAccount(raw: string | undefined): ServiceAccount {
  if (!raw) throw new Error("Google Calendar credentials are not configured.");
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("Google Calendar credentials are invalid JSON."); }
  if (!value || typeof value !== "object") throw new Error("Google Calendar credentials are invalid.");
  const candidate = value as Partial<ServiceAccount>;
  if (
    candidate.type !== "service_account" ||
    typeof candidate.client_email !== "string" ||
    !candidate.client_email.endsWith(".gserviceaccount.com") ||
    typeof candidate.private_key !== "string" ||
    !candidate.private_key.includes("BEGIN PRIVATE KEY") ||
    (candidate.token_uri && candidate.token_uri !== "https://oauth2.googleapis.com/token")
  ) {
    throw new Error("Google Calendar service-account credentials failed validation.");
  }
  return candidate as ServiceAccount;
}

export async function googleFreeBusy(input: {
  credentialsJson: string | undefined;
  delegatedUserEmail: string;
  calendarId: string;
  from: string;
  to: string;
  timezone: string;
}): Promise<GoogleBusyWindow[]> {
  const credentials = parseGoogleServiceAccount(input.credentialsJson);
  if (!input.delegatedUserEmail.toLowerCase().endsWith("@goalphahealth.com")) {
    throw new Error("Google Calendar delegation is limited to the Alpha Health Workspace domain.");
  }
  const auth = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [FREE_BUSY_SCOPE],
    subject: input.delegatedUserEmail,
  });
  const response = await auth.request<{
    calendars?: Record<string, { busy?: Array<{ start?: string; end?: string }>; errors?: Array<{ reason?: string }> }>;
  }>({
    url: FREE_BUSY_URL,
    method: "POST",
    data: {
      timeMin: input.from,
      timeMax: input.to,
      timeZone: input.timezone,
      calendarExpansionMax: 1,
      items: [{ id: input.calendarId }],
    },
  });
  const calendar = response.data.calendars?.[input.calendarId];
  if (!calendar || calendar.errors?.length) {
    throw new Error(`Google Calendar free/busy failed: ${calendar?.errors?.[0]?.reason ?? "calendar unavailable"}`);
  }
  return (calendar.busy ?? []).flatMap((window) => {
    if (!window.start || !window.end) return [];
    const digest = createHash("sha256").update(`${input.calendarId}\0${window.start}\0${window.end}`).digest("hex");
    return [{ id: `gcal-${digest.slice(0, 40)}`, start: window.start, end: window.end }];
  });
}

