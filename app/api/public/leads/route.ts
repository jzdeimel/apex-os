import { NextResponse } from "next/server";
import { fail, serverError, unavailable } from "@/lib/api/respond";
import { createLeadWithInvite } from "@/lib/db/repo";
import { intakeEntryPath, mintIntakeToken } from "@/lib/intake/mint";
import { sha256 } from "@/lib/trace/hash";
import { rateLimit, clientIp } from "@/lib/api/rateLimit";

/**
 * PUBLIC — capture a lead from the booking form and return its intake link.
 *
 * This is one of exactly two unauthenticated endpoints in Apex. A prospect has
 * no account yet, so requiring auth here would mean no one can ever become a
 * patient. Everything that follows from that is deliberate:
 *
 *  - RATE LIMITED per IP (see lib/api/rateLimit.ts for what that does and does
 *    not protect).
 *  - The token is minted SERVER-SIDE from crypto.randomBytes and only its
 *    SHA-256 is stored; the raw value is returned exactly once, in this
 *    response, and never logged.
 *  - No enumeration surface: the response never reveals whether an email or
 *    phone already exists in the funnel. Every accepted submission looks the
 *    same from outside.
 *  - Field validation mirrors the client form, because a public endpoint cannot
 *    trust that the client ran any.
 *
 * Before this existed, /book minted a token in the browser from a seeded PRNG
 * and stored nothing at all — the lead's name, email, phone, location and
 * reason were dropped, and the link it produced could never resolve.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Generous enough for a real person retrying a form; not enough to script. */
const LIMIT = 5;
const WINDOW_MS = 10 * 60 * 1000;

const TRACKS = new Set(["male", "female", "men", "women"]);

interface Body {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  track?: string;
  locationId?: string;
  modality?: string;
  reason?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
/** 10+ digits after stripping punctuation — permissive, deliberately. */
const isPhone = (v: string) => v.replace(/\D/g, "").length >= 10;
const attributionValue = (value: unknown) =>
  typeof value === "string" ? value.trim().slice(0, 200) || undefined : undefined;

export async function POST(req: Request) {
  const now = Date.now();
  const rl = rateLimit(`leads:${clientIp(req.headers)}`, LIMIT, WINDOW_MS, now);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed body." }, { status: 400 });
  }

  const firstName = (body.firstName ?? "").trim();
  const lastName = (body.lastName ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const phone = (body.phone ?? "").trim();

  const problems: string[] = [];
  if (!firstName) problems.push("First name is required.");
  if (!lastName) problems.push("Last name is required.");
  if (!email || !isEmail(email)) problems.push("A valid email is required.");
  if (!phone || !isPhone(phone)) problems.push("A valid phone number is required.");
  if (body.track && !TRACKS.has(body.track)) problems.push("Unknown care track.");
  if (problems.length) {
    return NextResponse.json({ ok: false, error: problems.join(" "), problems }, { status: 400 });
  }

  const at = new Date(now).toISOString();
  const minted = mintIntakeToken(at);

  try {
    const { leadId } = await createLeadWithInvite({
      firstName,
      lastName,
      email,
      phone,
      track: body.track,
      preferredLocationId: body.locationId,
      modality: body.modality,
      reason: (body.reason ?? "").trim().slice(0, 2000) || undefined,
      source: "website",
      utmSource: attributionValue(body.utmSource),
      utmMedium: attributionValue(body.utmMedium),
      utmCampaign: attributionValue(body.utmCampaign),
      tokenSha256: sha256(minted.token),
      expiresAt: minted.expiresAt,
      at,
    });

    // The raw token leaves the server exactly here, exactly once.
    return NextResponse.json({
      ok: true,
      durable: true,
      leadId,
      intakePath: intakeEntryPath(minted.token),
      expiresAt: minted.expiresAt,
    });
  } catch (err) {
    // No database — say so honestly. A booking form that silently swallows a
    // prospect is worse than one that admits it is down.
    return unavailable("public.leads", err, 'We could not save your request. Please try again or call us.');
  }
}
