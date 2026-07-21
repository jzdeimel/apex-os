import Link from "next/link";
import { Compass, Home } from "lucide-react";
import { AlphaMark } from "@/components/brand/AlphaLogo";

/**
 * 404. A wrong URL should still look like the product, not a server default.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <AlphaMark size={40} />
      <p className="mt-5 stat-mono text-title font-semibold text-gold-400">404</p>
      <h1 className="mt-1 font-display text-heading font-semibold text-ink-50">This page isn&apos;t here</h1>
      <p className="mt-2 max-w-md text-detail leading-relaxed text-ink-400">
        The link may be old, or the record moved. Nothing is broken — you&apos;re just at an address that
        doesn&apos;t exist.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <Link
          href="/"
          className="focus-ring inline-flex items-center gap-2 rounded-control bg-gold-500 px-4 py-2.5 text-detail font-medium text-white transition-colors hover:bg-gold-600"
        >
          <Home className="h-4 w-4" /> Go home
        </Link>
        <Link
          href="/clients"
          className="focus-ring inline-flex items-center gap-2 rounded-control border border-ink-700 px-4 py-2.5 text-detail text-ink-300 transition-colors hover:text-ink-50"
        >
          <Compass className="h-4 w-4" /> Find a patient
        </Link>
      </div>
    </div>
  );
}
