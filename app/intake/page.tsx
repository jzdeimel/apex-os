import type { Metadata } from "next";
import Link from "next/link";
import { Phone } from "lucide-react";
import { SecureIntakeEntry } from "@/components/intake/SecureIntakeEntry";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Your intake - Alpha Health",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function IntakePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-ink-800/80">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/book" className="flex min-w-0 items-center gap-2.5 rounded-lg focus-ring">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gold-500 font-display text-body font-bold text-white">
              A
            </span>
            <span className="min-w-0">
              <span className="block truncate font-display text-body font-semibold text-ink-50">{BRAND.name}</span>
              <span className="block truncate text-micro text-ink-500">{BRAND.tagline}</span>
            </span>
          </Link>
          <a
            href={`tel:${BRAND.telehealthPhone}`}
            className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-body text-ink-300 hover:text-ink-50 focus-ring"
          >
            <Phone className="h-4 w-4" />
            <span className="stat-mono hidden sm:inline">{BRAND.telehealthPhone}</span>
          </a>
        </div>
      </header>
      <main className="flex-1 px-4 py-10 sm:px-6">
        <SecureIntakeEntry />
      </main>
      <footer className="border-t border-ink-800/80">
        <p className="mx-auto w-full max-w-5xl px-4 py-6 text-detail leading-relaxed text-ink-600 sm:px-6">
          {BRAND.name} - {BRAND.motto}. If you received this link by mistake, call us and we will void it.
        </p>
      </footer>
    </div>
  );
}
