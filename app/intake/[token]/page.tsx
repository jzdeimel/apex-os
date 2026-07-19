import Link from "next/link";
import { ShieldCheck, Lock, Phone, AlertTriangle } from "lucide-react";
import { IntakeWizard } from "@/components/intake/IntakeWizard";
import { inviteByToken, intakeInvites, NOW } from "@/lib/mock/intake";
import { checkToken, GENERIC_TOKEN_FAILURE, SHORT_CODE_BITS } from "@/lib/intake/tokens";
import { BRAND } from "@/lib/brand";
import { Button, Badge } from "@/components/ui/primitives";
import { locationName } from "@/lib/mock/locations";

/**
 * Public intake — /intake/<token>
 *
 * PRE-AUTH SURFACE. Nobody here has an account, so this page renders standalone:
 * its own header, no sidebar, no topbar, nothing that implies a session exists.
 * That is not only cosmetic — app chrome on a pre-auth page is how a phishing
 * page gets its credibility, and it trains members to expect the logged-in shell
 * in places where it cannot be trusted.
 *
 * The token in the URL is the entire access-control decision. See
 * lib/intake/tokens.ts for what that has to be worth and what the audited system
 * got wrong.
 */

export const metadata = {
  title: "Your intake — Alpha Health",
  // Pre-auth pages that contain a bearer token must never be indexed, and the
  // token must never leak through a Referer header to an analytics vendor.
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

/** Shared public chrome. Deliberately minimal — a mark, a phone number, nothing clickable that leaves. */
function PublicHeader() {
  return (
    <header className="border-b border-ink-800/80">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/book" className="flex min-w-0 items-center gap-2.5 focus-ring rounded-lg">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gold-500 font-display text-sm font-bold text-white">
            A
          </span>
          <span className="min-w-0">
            <span className="block truncate font-display text-sm font-semibold text-ink-50">
              {BRAND.name}
            </span>
            <span className="block truncate text-[11px] text-ink-500">{BRAND.tagline}</span>
          </span>
        </Link>
        <a
          href={`tel:${BRAND.telehealthPhone}`}
          className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-ink-300 hover:text-ink-50 focus-ring"
        >
          <Phone className="h-4 w-4" />
          <span className="stat-mono hidden sm:inline">{BRAND.telehealthPhone}</span>
        </a>
      </div>
    </header>
  );
}

function PublicFooter() {
  return (
    <footer className="mt-12 border-t border-ink-800/80">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        <p className="text-xs leading-relaxed text-ink-600">
          Demo environment. {BRAND.name} · {BRAND.motto} · Nothing on this page is
          transmitted, stored, or treated as medical advice.
        </p>
      </div>
    </footer>
  );
}

/**
 * The one screen every failed lookup gets.
 *
 * Expired, already used, and never-existed all render THIS — identically. An
 * anonymous visitor who can tell those apart has an oracle that confirms which
 * codes are real, which is exactly what an enumeration attack needs. The
 * distinction is recorded in the audit log, where it belongs, and nowhere else.
 */
function InvalidLink() {
  const demos = intakeInvites
    .filter((i) => checkToken(i, NOW) === "ok")
    .slice(0, 3);

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-14 sm:px-6">
      <div className="card p-6 sm:p-8">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-high/15 text-high">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight text-ink-50">
          This link isn't valid
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-400">{GENERIC_TOKEN_FAILURE}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <a href={`tel:${BRAND.telehealthPhone}`}>
            <Button variant="primary" className="gap-1.5">
              <Phone className="h-4 w-4" />
              Call {BRAND.telehealthPhone}
            </Button>
          </a>
          <Link href="/book">
            <Button variant="outline">Start over</Button>
          </Link>
        </div>
      </div>

      {/* Demo affordance. In production nothing like this exists — the whole
          point of the generic message is that the visitor learns nothing. */}
      <div className="mt-5 rounded-2xl border border-dashed border-ink-700 p-5">
        <p className="label-eyebrow">Demo note</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-400">
          You reached the same screen an expired link, a used link, and a link that
          never existed all reach. That is deliberate: telling the visitor which one
          it was confirms the code exists, and the short code is only ~
          {SHORT_CODE_BITS} bits. Live demo links:
        </p>
        <ul className="mt-3 space-y-1.5">
          {demos.map((i) => (
            <li key={i.id}>
              <Link
                href={`/intake/${i.token}`}
                className="stat-mono text-xs text-gold-300 hover:underline"
              >
                {i.prefill.firstName} {i.prefill.lastName} · {i.shortCode}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function IntakeTokenPage({ params }: { params: { token: string } }) {
  const invite = inviteByToken(decodeURIComponent(params.token));
  const verdict = checkToken(invite, NOW);

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />

      <main className="flex-1">
        {verdict !== "ok" || !invite ? (
          <InvalidLink />
        ) : (
          <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
            <div className="mb-7">
              <p className="label-eyebrow">Step 1 of your journey</p>
              <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink-50">
                Before your free consultation
              </h1>
              <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-ink-400">
                About four minutes. Your answers go straight to the clinician you'll be
                speaking with, so the call is spent on you instead of on a clipboard.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Badge tone="gold">
                  {invite.prefill.track === "female" ? "Women's health" : "Men's health"}
                </Badge>
                <Badge tone="neutral">{locationName(invite.prefill.locationId)}</Badge>
                <span className="flex items-center gap-1.5 text-xs text-ink-500">
                  <Lock className="h-3.5 w-3.5" />
                  Private link · expires 72 hours after it was sent · single use
                </span>
              </div>
            </div>

            <IntakeWizard invite={invite} />

            <div className="mt-8 flex items-start gap-2.5 rounded-2xl border border-ink-800 bg-ink-900/30 p-4">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" />
              <p className="text-xs leading-relaxed text-ink-500">
                This link identifies you, so don't forward it. It stops working once you
                submit, and again after 72 hours. If you got it by mistake, call{" "}
                {BRAND.telehealthPhone} and we'll void it.
              </p>
            </div>
          </div>
        )}
      </main>

      <PublicFooter />
    </div>
  );
}
