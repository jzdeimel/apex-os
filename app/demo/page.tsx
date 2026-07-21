"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { usePortal } from "@/lib/portalStore";
import { setDemoMember } from "@/components/portal/PortalHeader";
import { AlphaMark, AlphaLogo } from "@/components/brand/AlphaLogo";
import type { PortalId } from "@/lib/portals";

/**
 * The Demo Guide.
 *
 * Apex fans out across five consoles, and the interesting features gate on the
 * right persona AND the right member — titration wants a man on testosterone,
 * the women's-health panel wants a woman, recovery wants a member on that track.
 * Knowing that mapping is the difference between "let me show you" and a minute
 * of clicking. This page is that mapping, made one-tap: each row sets the persona
 * and, where it matters, the member, then jumps straight to the surface.
 *
 * Demo-only. It is a walkthrough index, not a product surface a real member ever
 * sees.
 */

interface Item {
  label: string;
  note: string;
  persona: PortalId;
  member?: string;
  href: string;
  external?: boolean; // pre-auth surface, no persona needed
}

interface Group {
  title: string;
  blurb: string;
  items: Item[];
}

const GROUPS: Group[] = [
  {
    title: "Member portal",
    blurb: "What a patient sees — where they log everything and watch their own progress.",
    items: [
      { label: "Member dashboard", note: "The one screen a member lives in", persona: "patient", member: "c-001", href: "/portal" },
      { label: "Protocol · levels · injection map · mixing calculator", note: "Male member on testosterone + peptides", persona: "patient", member: "c-001", href: "/portal/protocol" },
      { label: "Menopause tracker (women's protocol)", note: "Female member — HRT / perimenopause", persona: "patient", member: "c-016", href: "/portal/protocol" },
      { label: "Recovery & performance readiness", note: "Member on the recovery track", persona: "patient", member: "c-007", href: "/portal/protocol" },
      { label: "Labs + guided read", note: "~72 markers, explained", persona: "patient", member: "c-001", href: "/portal/labs" },
      { label: "Symptom journal + lab correlation", note: "How you feel, tied to the numbers", persona: "patient", member: "c-001", href: "/portal/journal" },
      { label: "Community — buddies, milestones, photos, squads, guides", note: "The bloodline", persona: "patient", member: "c-001", href: "/portal/community" },
      { label: "Messages (coach + provider threads)", note: "Two real threads", persona: "patient", member: "c-001", href: "/portal/messages" },
      { label: "Costs + membership tiers (HSA/FSA)", note: "What it costs, what's covered", persona: "patient", member: "c-001", href: "/portal/costs" },
      { label: "Who's seen my chart (access log)", note: "Every view, on the record", persona: "patient", member: "c-001", href: "/portal/access" },
    ],
  },
  {
    title: "Coach console",
    blurb: "The coach runs their whole day from here.",
    items: [
      { label: "Today queue", note: "Who needs a human, ranked", persona: "coach", href: "/coach" },
      { label: "My roster", note: "The book, sortable", persona: "coach", href: "/coach/roster" },
      { label: "Consults + prep brief", note: "Author a consult; AI prep", persona: "coach", href: "/coach/consults" },
      { label: "Care gaps", note: "What's overdue across the book", persona: "coach", href: "/coach/gaps" },
      { label: "Refills / subscriptions", note: "Standing protocols, what's stuck", persona: "coach", href: "/coach/subscriptions" },
    ],
  },
  {
    title: "Medical console",
    blurb: "Prescriber decision-support and sign-off. Clinical, sex-specific.",
    items: [
      { label: "Today (clinical)", note: "The provider's morning", persona: "clinic", href: "/clinic" },
      { label: "Sign queue — DURABLE write", note: "A co-sign writes a real hash-chained row to Postgres", persona: "clinic", href: "/clinic/sign" },
      { label: "Titration assistant (male TRT)", note: "T/E2/HCT/PSA trajectory + dose levers + HCT tracker", persona: "exec", href: "/clients/c-011?tab=titration" },
      { label: "Women's Health / HRT panel (female)", note: "Menopause staging + HRT levers + sexual health", persona: "exec", href: "/clients/c-016?tab=womens-health" },
      { label: "Controlled substances + lot recall", note: "Schedule III dispense gate, PDMP, recall", persona: "clinic", href: "/clinic/controlled" },
      { label: "Population risk radar", note: "HCT/E2/overdue-labs/credentials across sites", persona: "clinic", href: "/clinic/population" },
      { label: "Audit ledger (hash chain)", note: "Tamper-evident, verifiable", persona: "clinic", href: "/clinic/ledger" },
      { label: "Reach patient — call / text / video (ACS)", note: "Real ACS token + camera on the Contact tab", persona: "exec", href: "/clients/c-011?tab=contact" },
      { label: "Break-glass (out-of-location chart)", note: "Raleigh provider opens a Myrtle Beach chart", persona: "clinic", href: "/clients/c-005" },
    ],
  },
  {
    title: "Front desk",
    blurb: "Per-location reception — each desk sees only its own day.",
    items: [
      { label: "Day board (rooming, arrivals)", note: "Who's here, how long they've waited", persona: "desk", href: "/desk" },
      { label: "Room board", note: "The spatial view", persona: "desk", href: "/desk/rooms" },
      { label: "Book an appointment", note: "Desk-side booking", persona: "desk", href: "/desk/book" },
    ],
  },
  {
    title: "Owner console",
    blurb: "Everything across all locations. Money and clinical risk.",
    items: [
      { label: "Morning + money by location", note: "Which site is working vs leaking, ranked on MRR", persona: "exec", href: "/exec" },
      { label: "Capacity & load", note: "Rostered vs booked, per site", persona: "exec", href: "/exec/capacity" },
      { label: "Lead pipeline", note: "Where prospects sit", persona: "exec", href: "/exec/pipeline" },
      { label: "Analytics (revenue, retention)", note: "The deep financial view", persona: "exec", href: "/analytics" },
      { label: "Daily order report", note: "Fulfillment exceptions", persona: "exec", href: "/admin/daily-report" },
    ],
  },
  {
    title: "Public & shared",
    blurb: "The front door and the entry picker.",
    items: [
      { label: "Book a free consultation (public front door)", note: "Care track, location, contact → intake token", persona: "patient", href: "/book", external: true },
      { label: "Entry / persona picker", note: "How you choose a console", persona: "patient", href: "/", external: true },
    ],
  },
];

export default function DemoGuidePage() {
  const router = useRouter();
  const { setPortal } = usePortal();

  const go = (item: Item) => {
    if (!item.external) {
      setPortal(item.persona);
      if (item.member) setDemoMember(item.member);
    }
    router.push(item.href);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-5 py-8">
      <header className="flex flex-col gap-4 border-b border-ink-800 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <AlphaMark size={34} />
          <AlphaLogo height={18} />
        </div>
        <Link href="/" className="text-detail text-ink-500 hover:text-ink-200">
          ← Entry
        </Link>
      </header>

      <div>
        <h1 className="font-display text-display font-semibold tracking-tight text-ink-50">Demo guide</h1>
        <p className="mt-2 max-w-2xl text-body leading-relaxed text-ink-400">
          Every part of Apex, one tap away — each with the right console and member already set. Tap
          any row to jump straight there. (Demo aid, not a member surface.)
        </p>
      </div>

      {GROUPS.map((g) => (
        <section key={g.title}>
          <h2 className="font-display text-title font-semibold text-ink-50">{g.title}</h2>
          <p className="mt-0.5 text-detail text-ink-500">{g.blurb}</p>
          <div className="mt-3 space-y-2">
            {g.items.map((item) => (
              <button
                key={item.label + item.href}
                type="button"
                onClick={() => go(item)}
                className="focus-ring group flex w-full items-center justify-between gap-3 rounded-panel border border-ink-800 bg-ink-900/40 px-4 py-3 text-left transition-colors hover:border-ink-600 hover:bg-ink-850"
              >
                <div className="min-w-0">
                  <p className="truncate text-body font-medium text-ink-50">{item.label}</p>
                  <p className="truncate text-micro text-ink-500">
                    {item.note} · <span className="uppercase tracking-wide">{item.persona}</span>
                    {item.member ? ` · ${item.member}` : ""}
                  </p>
                </div>
                {item.external ? (
                  <ExternalLink className="h-4 w-4 shrink-0 text-ink-600 group-hover:text-gold-300" />
                ) : (
                  <ArrowRight className="h-4 w-4 shrink-0 text-ink-600 transition-transform group-hover:translate-x-0.5 group-hover:text-gold-300" />
                )}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
