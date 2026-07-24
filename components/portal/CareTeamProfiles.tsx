"use client";

/**
 * Portal · Care team profiles.
 *
 * This screen exists because the model this clinic sells is coach-supported
 * care, and the difference between coach-supported care and an app that texts
 * you is entirely a question of whether the member believes there is a person
 * on the other end. A roster of initials in a sidebar does not establish that.
 * Names, faces-in-lieu-of-faces, credentials, a real sentence about what
 * someone actually does, and a way to reach them does.
 *
 * Two deliberate ordering decisions:
 *
 *  - The member's OWN coach and provider come first and get the large
 *    treatment. Everyone else is context. A team page that opens with an
 *    alphabetical grid makes the member do the work of finding their own
 *    people, which is precisely backwards.
 *  - The coach comes before the provider. The coach is who they talk to most
 *    weeks; the provider is who signs the plan. Ordering by seniority would be
 *    an org chart, and an org chart is a document about the clinic, not about
 *    the member.
 *
 * Everything renders from lib/mock/staff + lib/mock/locations. Nothing here is
 * generated, randomised or dated, so the page is byte-identical every render.
 */

import * as React from "react";
import Link from "next/link";
import { Mail, MapPin, MessageSquare, Phone, Stethoscope, Users } from "lucide-react";

import { useMeClient } from "@/components/portal/PortalHeader";
import { staff, staffMap } from "@/lib/mock/staff";
import { locationMap, locationName } from "@/lib/mock/locations";
import { Card, CardContent, SectionTitle, Badge, EmptyState } from "@/components/ui/primitives";
import { Stagger, StaggerItem, FadeIn } from "@/components/portal/still";
import { cn } from "@/lib/utils";
import type { StaffMember } from "@/lib/types";

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

/**
 * Role as a member would say it, not as the schema stores it.
 *
 * "Medical" is an internal permission concept (see StaffMember.canApprove); no
 * member has ever described their doctor as "my Medical". Admin becomes
 * "Patient experience" because that is genuinely what the role does for the
 * person reading — it is not a euphemism, it is the member-facing truth.
 */
function memberFacingRole(s: StaffMember): string {
  if (s.role === "Medical") return "Provider";
  if (s.role === "Coach") return "Coach";
  return "Patient experience";
}

function roleTone(s: StaffMember): "gold" | "optimal" | "neutral" {
  if (s.role === "Medical") return "gold";
  if (s.role === "Coach") return "optimal";
  return "neutral";
}

/**
 * Initials chip. Staff have no photographs in this system and inventing them
 * would be a bigger lie than a monogram — StaffMember.avatarInitials is the
 * honest asset, so it gets designed properly rather than apologised for.
 */
function StaffChip({ s, size = "md" }: { s: StaffMember; size?: "md" | "lg" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-full border border-ink-600/70 bg-ink-800 font-display font-semibold text-ink-100",
        size === "lg" ? "h-14 w-14 text-heading" : "h-10 w-10 text-detail",
      )}
    >
      {s.avatarInitials}
    </span>
  );
}

/** Where this person works, in short names, comma-joined. */
function worksFrom(s: StaffMember): string {
  return s.locationIds.map((id) => locationName(id)).join(" · ");
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/**
 * The large card, used only for the member's own two people.
 *
 * `relationship` is passed in rather than derived because "Your coach" is a
 * statement about the reader, and the component should not have to know how
 * the reader relates to this record in order to say it.
 */
function PrimaryPersonCard({
  s,
  relationship,
  blurb,
  homeLocationId,
}: {
  s: StaffMember;
  relationship: string;
  blurb: string;
  homeLocationId: string;
}) {
  const home = locationMap[homeLocationId as keyof typeof locationMap];

  return (
    <Card className="h-full">
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <StaffChip s={s} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="label-eyebrow">{relationship}</p>
            <h3 className="mt-1.5 font-display text-title font-semibold leading-tight text-ink-50">
              {s.name}
              {s.credentials && (
                <span className="ml-2 text-detail font-normal text-ink-400">{s.credentials}</span>
              )}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone={roleTone(s)}>{memberFacingRole(s)}</Badge>
              {s.canApprove && <Badge tone="neutral">Can approve your plan</Badge>}
            </div>
          </div>
        </div>

        {/* The clinic's one-line bio, then our sentence about what this person
            does FOR THE MEMBER. The bio alone is written for staff directories
            and reads like one. */}
        {s.bio && <p className="mt-4 text-body leading-relaxed text-ink-200">{s.bio}</p>}
        <p className="mt-2 text-body leading-relaxed text-ink-400">{blurb}</p>

        <dl className="mt-5 space-y-2.5 border-t border-ink-700/70 pt-4 text-detail">
          <div className="flex items-start gap-2.5">
            <dt className="sr-only">Works from</dt>
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" aria-hidden="true" />
            <dd className="text-ink-300">{worksFrom(s)}</dd>
          </div>
          <div className="flex items-start gap-2.5">
            <dt className="sr-only">Email</dt>
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" aria-hidden="true" />
            <dd className="min-w-0">
              {/* break-all: a long address must wrap rather than widen the
                  card — at 390px an unbroken email is the whole viewport. */}
              <a href={`mailto:${s.email}`} className="focus-ring break-all rounded-control text-ink-300 hover:text-ink-50">
                {s.email}
              </a>
            </dd>
          </div>
          {home?.phone && (
            <div className="flex items-start gap-2.5">
              <dt className="sr-only">Clinic phone</dt>
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" aria-hidden="true" />
              <dd>
                <a href={`tel:${home.phone.replace(/[^0-9+]/g, "")}`} className="focus-ring rounded-control text-ink-300 hover:text-ink-50">
                  {home.phone}
                </a>
                <span className="ml-1.5 text-ink-500">· {home.short}</span>
              </dd>
            </div>
          )}
        </dl>

        {/* The portal thread is the preferred channel and is therefore the
            only styled action — everything above is a fallback, not a peer. */}
        <Link
          href="/portal/messages"
          className="focus-ring mt-5 inline-flex h-9 items-center justify-center gap-2 rounded-control bg-gold-500 px-4 text-detail font-medium text-[color:var(--on-swatch)] transition-colors hover:bg-gold-400 motion-reduce:transition-none"
        >
          <MessageSquare className="h-4 w-4" aria-hidden="true" />
          Message {s.name.split(" ").slice(-1)[0]}
        </Link>
      </CardContent>
    </Card>
  );
}

/** The compact card, used for everyone else at the member's clinic. */
function TeamPersonCard({ s }: { s: StaffMember }) {
  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col p-4">
        <div className="flex items-start gap-3">
          <StaffChip s={s} />
          <div className="min-w-0 flex-1">
            <p className="font-display text-detail font-semibold leading-tight text-ink-50">
              {s.name}
              {s.credentials && (
                <span className="ml-1.5 text-micro font-normal text-ink-500">{s.credentials}</span>
              )}
            </p>
            <p className="mt-1 text-micro text-ink-400">{memberFacingRole(s)}</p>
          </div>
        </div>
        {s.bio && <p className="mt-3 text-detail leading-relaxed text-ink-300">{s.bio}</p>}
        <p className="mt-auto pt-3 text-micro text-ink-500">{worksFrom(s)}</p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page body
// ---------------------------------------------------------------------------

export function CareTeamProfiles() {
  // Audit fix (GAP_ANALYSIS.md, "Portal renderable as a woman"): was the
  // non-reactive `me()` accessor, which pinned this to one male member and
  // would not re-render when the demo subject changed.
  const client = useMeClient();
  const coach = staffMap[client.coachId] as StaffMember | undefined;
  const provider = staffMap[client.providerId] as StaffMember | undefined;
  const home = locationMap[client.locationId];

  /**
   * The wider team = everyone else who works out of the member's home clinic.
   *
   * Filtered to the member's own location rather than showing all 24 staff:
   * a Myrtle Beach member scrolling past the entire Raleigh roster learns
   * nothing and loses the thread. Telehealth staff who cover the member's site
   * are already included by the locationIds membership test.
   */
  const wider = React.useMemo(() => {
    const mine = new Set([client.coachId, client.providerId]);
    const rank: Record<StaffMember["role"], number> = { Medical: 0, Coach: 1, Admin: 2 };
    return staff
      .filter((s) => !mine.has(s.id) && s.locationIds.includes(client.locationId))
      .sort((a, b) => rank[a.role] - rank[b.role] || a.name.localeCompare(b.name));
  }, [client.coachId, client.providerId, client.locationId]);

  return (
    <div className="space-y-10">
      {/* ---------------------------------------------------------------- */}
      {/* Your people                                                       */}
      {/* ---------------------------------------------------------------- */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Stethoscope className="h-4 w-4 text-gold-400" aria-hidden="true" />
          <SectionTitle>Your two people</SectionTitle>
        </div>
        <p className="max-w-prose text-body leading-relaxed text-ink-400">
          Between them they see everything: every lab, every scan, every note you send. You
          never have to explain your history twice.
        </p>

        {/* Explicit base grid-cols-1. A grid whose only column definition sits
            behind a breakpoint sizes its implicit column to content and blows
            out the phone layout. */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {coach ? (
            <FadeIn>
              <PrimaryPersonCard
                s={coach}
                relationship="Your coach"
                blurb="Your week-to-week point of contact — training, nutrition, sleep and the small adjustments between visits. Message them first; most questions never need to go further."
                homeLocationId={client.locationId}
              />
            </FadeIn>
          ) : (
            <EmptyState title="No coach assigned yet" hint="Your clinic will pair you with a coach before your plan starts." />
          )}

          {provider ? (
            <FadeIn delay={0.08}>
              <PrimaryPersonCard
                s={provider}
                relationship="Your provider"
                blurb="The licensed clinician who reviews your labs and approves your plan. Nothing on your protocol page gets there without their sign-off."
                homeLocationId={client.locationId}
              />
            </FadeIn>
          ) : (
            <EmptyState title="No provider assigned yet" hint="A provider is assigned once your first panel is ordered." />
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* The wider clinic                                                  */}
      {/* ---------------------------------------------------------------- */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-gold-400" aria-hidden="true" />
          <SectionTitle>The rest of the team at {home?.short ?? "your clinic"}</SectionTitle>
        </div>
        <p className="max-w-prose text-body leading-relaxed text-ink-400">
          People you&apos;ll meet at the front desk, cover your coach when they&apos;re out, or
          run your draw. Worth knowing the names.
        </p>

        {wider.length === 0 ? (
          <EmptyState title="No other staff listed at this site" />
        ) : (
          <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {wider.map((s) => (
              <StaggerItem key={s.id}>
                <TeamPersonCard s={s} />
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Where to find them                                                */}
      {/* ---------------------------------------------------------------- */}
      {home && (
        <section className="space-y-4">
          <SectionTitle>Where to find us</SectionTitle>
          <Card>
            <CardContent className="p-5">
              <p className="font-display text-body font-semibold text-ink-50">{home.name}</p>
              {home.address && <p className="mt-1.5 text-detail text-ink-300">{home.address}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-detail">
                {home.phone && (
                  <a
                    href={`tel:${home.phone.replace(/[^0-9+]/g, "")}`}
                    className="focus-ring inline-flex items-center gap-2 rounded-control text-ink-300 hover:text-ink-50"
                  >
                    <Phone className="h-4 w-4 text-ink-500" aria-hidden="true" />
                    {home.phone}
                  </a>
                )}
                <span className="text-ink-500">
                  {home.type === "virtual" ? "Telehealth · nationwide" : `${home.city}, ${home.state}`}
                </span>
              </div>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
