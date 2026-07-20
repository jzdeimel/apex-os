"use client";

import { usePathname } from "next/navigation";
import { LifeBuoy } from "lucide-react";
import { usePortal } from "@/lib/portalStore";

/**
 * "Something looks wrong" — the route back to a human.
 *
 * Two deliberate choices here.
 *
 * FIRST, it lives in normal document flow inside the sidebar rather than as a
 * floating button. A fixed launcher always hovers over whatever is scrolling
 * beneath it, and on a 390px screen that is not a hypothetical: the demo tour's
 * floating pill was landing directly on top of escalation text and eating a line
 * of real clinical content. There is no safe corner on a phone. In-flow costs
 * nothing and covers nothing.
 *
 * SECOND, the mail body is pre-filled with the context that makes a report
 * actionable — which page, which portal, and the build. The single most common
 * reason a bug report cannot be acted on is that nobody recorded where they
 * were standing when it happened, and the person reporting it is the least
 * equipped to know that mattered.
 *
 * No PHI is included. The route path and portal name are enough to reproduce.
 */

const SUPPORT_EMAIL = "zack@goalphahealth.com";

export function SupportLink({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const { portal } = usePortal();

  const subject = `Apex — issue on ${pathname}`;
  const body = [
    "What happened:",
    "",
    "",
    "What you expected instead:",
    "",
    "",
    "— — — — — — — — — — — — — —",
    "Sent from Apex. The lines below help us reproduce it.",
    `Page:   ${pathname}`,
    `Portal: ${portal.label}`,
    "Build:  Apex demo",
    "",
    "If it is visual, a screenshot helps more than anything else.",
  ].join("\n");

  const href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  if (compact) {
    return (
      <a
        href={href}
        className="focus-ring inline-flex items-center gap-1.5 rounded-lg text-[11px] text-ink-500 transition-colors hover:text-ink-200"
      >
        <LifeBuoy className="h-3.5 w-3.5" />
        Report a problem
      </a>
    );
  }

  return (
    <a
      href={href}
      className="focus-ring group flex items-start gap-2.5 rounded-xl border border-ink-800 bg-ink-900/60 p-3 transition-colors hover:border-ink-600 hover:bg-ink-900"
    >
      <LifeBuoy
        className="mt-0.5 h-4 w-4 shrink-0 transition-colors"
        style={{ color: portal.accent.hex }}
      />
      <span className="min-w-0">
        <span className="block text-[11px] font-medium text-ink-200">Need help, or found a bug?</span>
        <span className="mt-0.5 block break-words text-[11px] leading-relaxed text-ink-500">
          Email {SUPPORT_EMAIL} — this page and portal are filled in for you.
        </span>
      </span>
    </a>
  );
}
