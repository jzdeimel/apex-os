"use client";

/**
 * The clinic's six published questions, as an accessible accordion.
 *
 * Accessibility notes, because this is the pattern most often shipped broken:
 *
 *  - The trigger is a real <button>. Not a div with onClick — a member using a
 *    keyboard or a screen reader has to be able to reach and operate it, and
 *    <button> gets Enter/Space, focus and role for free.
 *  - `aria-expanded` on the button and `aria-controls` pointing at the panel,
 *    with the panel carrying a matching id and `role="region"` labelled by the
 *    button. That triple is what makes a screen reader announce "collapsed"
 *    rather than silently reading a heading.
 *  - Each question sits inside a real heading element, so the six questions
 *    show up in a screen reader's heading list and can be jumped between. The
 *    heading level is a prop because this component gets dropped under an <h1>
 *    on the learn page and could sit deeper elsewhere.
 *  - One open at a time, which is the brief — so the panel is unmounted rather
 *    than hidden, and the closed state carries no focusable content.
 *
 * Motion is deliberately absent on the panel itself. An animated height on a
 * block of body copy reflows text mid-read, and there is no version of that
 * which is nicer than the content simply being there.
 */

import { useState } from "react";
import { FAQ } from "@/lib/education/faq";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { ChevronDown, Phone } from "lucide-react";
import Link from "next/link";

export function FaqAccordion({
  headingLevel = 3,
  className,
}: {
  /** Heading level for each question, so the page keeps a sane outline. */
  headingLevel?: 2 | 3 | 4;
  className?: string;
}) {
  // `null` rather than a default-open first item: opening one for the member
  // implies it is the important one, and the clinic does not rank them.
  const [open, setOpen] = useState<string | null>(null);
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";

  return (
    <div className={cn("space-y-2.5", className)}>
      {FAQ.map((f) => {
        const isOpen = open === f.id;
        const panelId = `${f.id}-panel`;
        const buttonId = `${f.id}-button`;

        return (
          <div
            key={f.id}
            className={cn(
              "overflow-hidden rounded-2xl border transition-colors",
              isOpen
                ? "border-gold-400/30 bg-ink-850"
                : "border-ink-700/70 bg-ink-850/60 hover:border-ink-600",
            )}
          >
            <Heading className="m-0">
              <button
                id={buttonId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : f.id)}
                className="focus-ring flex w-full items-start justify-between gap-4 px-4 py-4 text-left sm:px-5 sm:py-5"
              >
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block font-display text-[15px] font-semibold leading-snug sm:text-base",
                      isOpen ? "text-ink-50" : "text-ink-100",
                    )}
                  >
                    {f.question}
                  </span>
                  {/* The one-line answer stays visible when collapsed. A row of
                      six bare questions makes a member open all six to find the
                      one they wanted. */}
                  {!isOpen && (
                    <span className="mt-1.5 block text-[13px] leading-relaxed text-ink-400">
                      {f.short}
                    </span>
                  )}
                </span>
                <ChevronDown
                  aria-hidden
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0 transition-transform duration-200",
                    isOpen ? "rotate-180 text-gold-300" : "text-ink-500",
                  )}
                />
              </button>
            </Heading>

            {isOpen && (
              <div
                id={panelId}
                role="region"
                aria-labelledby={buttonId}
                className="px-4 pb-5 sm:px-5 sm:pb-6"
              >
                <div className="max-w-prose space-y-3.5 border-t border-ink-700/70 pt-4">
                  {f.answer.map((p, i) => (
                    <p key={i} className="text-[14px] leading-relaxed text-ink-300">
                      {p}
                    </p>
                  ))}
                </div>

                {f.seeAlso && (
                  <Link
                    href={f.seeAlso.href}
                    className="focus-ring mt-4 inline-flex items-center gap-1.5 rounded-lg text-[13px] font-medium text-gold-300 hover:text-gold-200"
                  >
                    {f.seeAlso.label}
                    <span aria-hidden>→</span>
                  </Link>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* The question none of the six answers is "what if my question isn't
          here", and the clinic's answer to that is a phone number. */}
      <p className="flex flex-wrap items-center gap-1.5 pt-2 text-[13px] leading-relaxed text-ink-500">
        <Phone aria-hidden className="h-3.5 w-3.5" />
        Something not covered here? Message your coach, or call{" "}
        <a
          href={`tel:${BRAND.telehealthPhone.replace(/[^\d]/g, "")}`}
          className="focus-ring rounded stat-mono text-ink-300 underline decoration-ink-600 underline-offset-2 hover:text-ink-100"
        >
          {BRAND.telehealthPhone}
        </a>
        .
      </p>
    </div>
  );
}
