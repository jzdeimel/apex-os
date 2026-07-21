/**
 * A fixed-window, per-IP rate limiter for the PUBLIC endpoints.
 *
 * WHAT THIS IS HONESTLY FOR. /api/public/* sits outside EasyAuth — it has to,
 * because a prospect has no account yet — so it is the only part of Apex facing
 * the open internet unauthenticated. Without a limiter, `/api/public/leads` is
 * a free lead-spam and DB-growth endpoint, and the intake submit is an oracle
 * you can hammer with guessed tokens.
 *
 * WHAT IT IS NOT. This is in-process memory, so the window is PER REPLICA:
 * with N replicas an attacker effectively gets N× the budget, and a restart
 * clears it. That is a real limitation, stated rather than papered over. It is
 * still worth shipping — it turns a trivially scriptable endpoint into one that
 * needs distributed effort — but the durable fix is a shared counter (Postgres
 * or Redis) and that lands with the first horizontal scale-out. Until then the
 * token space, not this, is what actually protects the intake link: 52 Crockford
 * characters is ~260 bits, which no request rate reaches.
 *
 * Deliberately NOT exposing the short-code lookup publicly: that space is ~40
 * bits, which a distributed attacker can walk. Long token only, on the internet.
 */

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

/** Bound the map so a spray of unique IPs cannot grow it without limit. */
const MAX_TRACKED = 10_000;

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function rateLimit(key: string, limit: number, windowMs: number, now: number): RateLimitResult {
  const existing = windows.get(key);

  if (!existing || now >= existing.resetAt) {
    if (windows.size >= MAX_TRACKED) {
      // Evict everything already expired; if that frees nothing, clear. Both are
      // better than unbounded growth, and a rate limiter that OOMs the process
      // is a denial of service it inflicted on itself.
      for (const [k, w] of windows) if (now >= w.resetAt) windows.delete(k);
      if (windows.size >= MAX_TRACKED) windows.clear();
    }
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSec: 0 };
  }

  existing.count += 1;
  const remaining = Math.max(0, limit - existing.count);
  return {
    ok: existing.count <= limit,
    remaining,
    retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

/**
 * The caller's IP, as seen through the Container Apps ingress.
 *
 * x-forwarded-for is attacker-controllable in general, but here it is set by
 * the platform ingress in front of the app, and the leftmost entry is the
 * client. Falling back to a constant means a missing header degrades to ONE
 * shared bucket — deliberately the strict direction, not the permissive one.
 */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return headers.get("x-client-ip") ?? "unknown";
}
