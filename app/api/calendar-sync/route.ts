import { NextResponse } from "next/server";

import { fail, unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { googleFreeBusy, parseGoogleServiceAccount } from "@/lib/calendar/google";
import { nowIso } from "@/lib/clock";
import {
  markCalendarSyncError,
  readGoogleCalendarsForSync,
  replaceCalendarBusyWindow,
} from "@/lib/db/repo";

export const dynamic = "force-dynamic";

const credentials = () => process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON;

async function admin() {
  return guard("admin:calendars");
}

export async function GET() {
  const g = await admin();
  if (!g.ok) return g.res;
  try {
    const calendars = await readGoogleCalendarsForSync();
    let credentialsReady = true;
    try { parseGoogleServiceAccount(credentials()); } catch { credentialsReady = false; }
    const now = Date.now();
    return NextResponse.json({
      ok: true,
      credentialsReady,
      ready: credentialsReady && calendars.length > 0 && calendars.every((calendar) =>
        calendar.status === "connected" &&
        calendar.lastSyncedAt !== null &&
        now - calendar.lastSyncedAt.getTime() <= 15 * 60_000
      ),
      calendars: calendars.map((calendar) => ({
        id: calendar.id,
        staffId: calendar.staffId,
        staffName: calendar.staffName,
        status: calendar.status,
        lastSyncedAt: calendar.lastSyncedAt,
        lastErrorCode: calendar.lastErrorCode,
      })),
    });
  } catch (error) {
    return unavailable("calendar.status", error, "Calendar synchronization status is unavailable.");
  }
}

export async function POST() {
  const g = await admin();
  if (!g.ok) return g.res;
  try {
    parseGoogleServiceAccount(credentials());
  } catch {
    return fail(503, "Google Calendar credentials are not configured or valid. No calendars were synchronized.");
  }
  try {
    const calendars = await readGoogleCalendarsForSync();
    if (!calendars.length) return fail(409, "No Google calendars are connected to active staff.");
    const from = nowIso();
    const to = new Date(Date.parse(from) + 90 * 86_400_000).toISOString();
    const results: Array<{ calendarId: string; ok: boolean; busyBlockCount?: number; errorCode?: string }> = [];
    for (const calendar of calendars) {
      try {
        const busy = await googleFreeBusy({
          credentialsJson: credentials(),
          delegatedUserEmail: calendar.staffEmail,
          calendarId: calendar.externalCalendarId,
          from,
          to,
          timezone: "America/New_York",
        });
        await replaceCalendarBusyWindow({
          calendarId: calendar.id,
          staffId: calendar.staffId,
          from,
          to,
          busy,
          at: nowIso(),
        });
        results.push({ calendarId: calendar.id, ok: true, busyBlockCount: busy.length });
      } catch (error) {
        const text = error instanceof Error ? error.message : "provider error";
        const code = /unauthorized|permission|403|401/i.test(text) ? "authorization" : "provider-error";
        await markCalendarSyncError(calendar.id, code);
        results.push({ calendarId: calendar.id, ok: false, errorCode: code });
      }
    }
    const failed = results.filter((result) => !result.ok).length;
    return NextResponse.json({ ok: failed === 0, from, to, failed, results }, { status: failed ? 502 : 200 });
  } catch (error) {
    return unavailable("calendar.sync", error, "Google Calendar synchronization did not complete.");
  }
}
