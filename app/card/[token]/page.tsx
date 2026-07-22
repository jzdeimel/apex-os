import { AlertTriangle, Phone, ShieldAlert, Clock } from "lucide-react";
import { CARD_DISCLAIMER, buildEmergencyCard, cardForToken, type EmergencyCard } from "@/lib/emergency/card";
import { BRAND } from "@/lib/brand";
import { formatDay } from "@/lib/protocol/runway";
import { readEmergencyCard } from "@/lib/db/repo";
import { sha256 } from "@/lib/trace/hash";
import { IS_DEMO } from "@/lib/config";
import { headers } from "next/headers";

/**
 * PUBLIC EMERGENCY CARD — /card/<token>
 *
 * A phone screen held up to a triage nurse. Everything about this page is
 * shaped by that one scene:
 *
 *  - **Standalone.** No sidebar, no topbar, nothing implying a session. The
 *    reader is a stranger with no account, the same reasoning as the public
 *    intake page: app chrome on an unauthenticated surface borrows credibility
 *    it has not earned.
 *  - **No interaction.** Everything is on screen at once. Nothing expands,
 *    nothing tabs, nothing needs a tap. The only tappable thing is the clinic's
 *    phone number, which is the action the page exists to produce.
 *  - **Big type, high contrast.** Read at arm's length, over someone's
 *    shoulder, on a cracked screen, in a bright room.
 *  - **Never an amount.** Name and route only. A dose printed here is a dose
 *    frozen at the moment the card was made; the provider titrates and the card
 *    does not. See lib/emergency/card.ts.
 */

export const metadata = {
  title: "Emergency summary — Alpha Health",
  // A bearer token in the URL must never be indexed, and must never leak to a
  // third party through a Referer header.
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

const STALE_STYLE = {
  current: { wrap: "border-ink-700 bg-ink-900", text: "text-ink-300", icon: "text-ink-400" },
  aging: { wrap: "border-watch/40 bg-watch/10", text: "text-ink-100", icon: "text-watch" },
  stale: { wrap: "border-high/50 bg-high/15", text: "text-ink-50", icon: "text-high" },
} as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-ink-800 pt-5">
      <h2 className="text-detail font-semibold uppercase tracking-[0.14em] text-ink-500">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-5 py-12">
      <h1 className="font-display text-title font-semibold text-ink-50">This card is not available</h1>
      <p className="mt-3 text-body leading-relaxed text-ink-300">
        The link may have expired or been mistyped. If you are treating an Alpha Health member, call{" "}
        <a href={`tel:${BRAND.telehealthPhone}`} className="stat-mono underline">
          {BRAND.telehealthPhone}
        </a>{" "}
        and the on-call team can confirm what they are on.
      </p>
    </main>
  );
}

function CardBody({ card }: { card: EmergencyCard }) {
  const stale = STALE_STYLE[card.staleness];

  return (
    <main className="mx-auto w-full max-w-xl px-5 py-6 sm:py-10">
      {/* What this is — first thing on the page, before any clinical content. */}
      <div className="rounded-2xl border-2 border-high/60 bg-high/15 p-4">
        <p className="flex items-center gap-2 text-body font-bold uppercase tracking-[0.12em] text-high">
          <ShieldAlert className="h-5 w-5 shrink-0" />
          Emergency summary
        </p>
        <p className="mt-2 text-body font-medium leading-relaxed text-ink-50">{CARD_DISCLAIMER}</p>
      </div>

      {/* Staleness — loud when it needs to be, quiet when it does not. */}
      <div className={`mt-3 flex items-start gap-2.5 rounded-2xl border p-4 ${stale.wrap}`}>
        <Clock className={`mt-0.5 h-5 w-5 shrink-0 ${stale.icon}`} />
        <div className="min-w-0">
          <p className={`text-body font-semibold leading-snug ${stale.text}`}>
            {card.staleness === "stale"
              ? "This card is out of date"
              : card.staleness === "aging"
                ? "This card may be out of date"
                : "This card is current"}
          </p>
          <p className="mt-1 text-body leading-relaxed text-ink-300">{card.stalenessNote}</p>
          <p className="stat-mono mt-2 text-body text-ink-400">
            Last updated {formatDay(card.generatedOn)}
          </p>
        </div>
      </div>

      {/* Identity ---------------------------------------------------------- */}
      <header className="mt-7">
        <p className="text-detail font-semibold uppercase tracking-[0.14em] text-ink-500">Patient</p>
        <h1 className="mt-1.5 font-display text-display font-bold leading-[1.05] tracking-tight text-ink-50">
          {card.name}
        </h1>
        <p className="stat-mono mt-2 text-heading text-ink-200">
          Age {card.age} · {card.sex === "male" ? "Male" : "Female"} · MRN {card.mrn}
        </p>
        <p className="mt-1.5 text-body leading-relaxed text-ink-500">
          Alpha Health records age and an Alpha-issued MRN. No date of birth is printed here because none is
          held — confirm identity with the patient or their ID.
        </p>
      </header>

      <div className="mt-7 space-y-5">
        {/* Prescribed --------------------------------------------------------- */}
        <Section title="Currently prescribed">
          {card.prescribed.length === 0 ? (
            <p className="text-heading leading-relaxed text-ink-200">
              No active Alpha Health prescription is attached to this card. That is not the same as nothing
              at all — call the clinic.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {card.prescribed.map((p) => (
                <li key={p.name} className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
                  <p className="text-heading font-semibold leading-snug text-ink-50">{p.name}</p>
                  {/* No route is a real answer, and it is printed as one. A
                      guessed route on this page is worse than a gap. */}
                  <p className="stat-mono mt-1 text-body text-ink-300">
                    {p.route ?? "Route not recorded — confirm with the clinic"}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 rounded-xl border border-ink-700 bg-ink-900/60 p-3 text-body leading-relaxed text-ink-200">
            <span className="font-semibold text-ink-50">No amounts are listed, deliberately.</span> Doses are
            adjusted over time and a figure printed on a card is a figure frozen at the day it was printed.
            Call the clinic for the current prescription.
          </p>
        </Section>

        {/* Allergies ---------------------------------------------------------- */}
        <Section title="Allergies">
          {card.allergiesRecorded && card.allergies.length > 0 ? (
            <ul className="space-y-2">
              {card.allergies.map((a) => (
                <li key={a} className="rounded-2xl border border-high/50 bg-high/10 p-4 text-heading font-semibold text-ink-50">
                  {a}
                </li>
              ))}
            </ul>
          ) : (
            /* Never "No known allergies". We hold no allergy record, and printing
               a clearance we cannot support is the single most dangerous thing
               this page could do. */
            <div className="flex items-start gap-2.5 rounded-2xl border border-watch/40 bg-watch/10 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-watch" />
              <p className="text-heading font-medium leading-relaxed text-ink-50">
                No allergy history is recorded at Alpha Health. This is not a clearance — ask the patient and
                confirm independently.
              </p>
            </div>
          )}
        </Section>

        {/* Risk flags ---------------------------------------------------------- */}
        {card.riskFlags.length > 0 && (
          <Section title="Flagged on their chart">
            <ul className="space-y-2.5">
              {card.riskFlags.map((f) => (
                <li key={f.label} className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
                  <p className="text-heading font-semibold text-ink-50">{f.label}</p>
                  <p className="mt-1 text-body leading-relaxed text-ink-300">{f.detail}</p>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Care team ----------------------------------------------------------- */}
        <Section title="Care team">
          <a
            href={`tel:${card.careTeam.phone}`}
            className="focus-ring flex items-center gap-3 rounded-2xl border-2 border-optimal/50 bg-optimal/10 p-4"
          >
            <Phone className="h-6 w-6 shrink-0 text-optimal" />
            <span className="min-w-0">
              <span className="block text-body text-ink-300">
                {card.careTeam.location?.name ?? BRAND.name}
              </span>
              <span className="stat-mono block text-title font-bold text-ink-50">{card.careTeam.phone}</span>
            </span>
          </a>

          <dl className="mt-3 space-y-2">
            {card.careTeam.provider && (
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 rounded-xl border border-ink-800 p-3">
                <dt className="text-body text-ink-500">Provider</dt>
                <dd className="text-heading font-medium text-ink-50">
                  {card.careTeam.provider.name}
                  {card.careTeam.provider.credentials ? `, ${card.careTeam.provider.credentials}` : ""}
                </dd>
              </div>
            )}
            {card.careTeam.coach && (
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 rounded-xl border border-ink-800 p-3">
                <dt className="text-body text-ink-500">Coach</dt>
                <dd className="text-heading font-medium text-ink-50">{card.careTeam.coach.name}</dd>
              </div>
            )}
            {card.careTeam.location?.address && (
              <div className="rounded-xl border border-ink-800 p-3">
                <dt className="text-body text-ink-500">Clinic</dt>
                <dd className="mt-0.5 text-heading text-ink-100">{card.careTeam.location.address}</dd>
              </div>
            )}
          </dl>
        </Section>
      </div>

      {/* Footer ------------------------------------------------------------- */}
      <footer className="mt-8 border-t border-ink-800 pt-5">
        <p className="stat-mono text-body text-ink-400">
          Generated {formatDay(card.generatedOn)} · record last changed {formatDay(card.sourcedOn)}
        </p>
        <p className="mt-2 text-body leading-relaxed text-ink-500">
          {BRAND.name} — {BRAND.tagline}. Demo data. Not medical advice and not a medical record.
        </p>
      </footer>
    </main>
  );
}

async function resolveCard(token: string): Promise<EmergencyCard | null> {
  try {
    const h = await headers();
    const row = await readEmergencyCard(sha256(token), new Date().toISOString(), {
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-client-ip") ?? undefined,
      userAgent: h.get("user-agent") ?? undefined,
    });
    if (row) return buildEmergencyCard(row.clientId, new Date().toISOString());
  } catch {
    if (!IS_DEMO) return null;
  }
  return IS_DEMO ? cardForToken(token) : null;
}

export default async function EmergencyCardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const card = await resolveCard(token);
  if (!card) return <NotFound />;
  return <CardBody card={card} />;
}
