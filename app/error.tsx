"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw, Home } from "lucide-react";
import { AlphaMark } from "@/components/brand/AlphaLogo";

/**
 * Route-level error boundary.
 *
 * A single render exception used to drop the viewer onto Next's raw error
 * overlay — jarring anywhere, alarming in front of a patient. This catches it
 * and keeps the person inside the product: the brand, a plain explanation, and
 * two ways forward (retry the view, or go home). No stack traces to the user;
 * the detail goes to the console for whoever is on call.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // In production this is where an error reporter (App Insights) would receive
    // the exception. Kept to the console for now.
    console.error("[apex] route error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <AlphaMark size={40} />
      <h1 className="mt-5 font-display text-title font-semibold text-ink-50">Something went wrong on this screen</h1>
      <p className="mt-2 max-w-md text-detail leading-relaxed text-ink-400">
        The rest of Apex is fine — just this view hit a snag. You can try it again, or head back to your
        dashboard. Nothing you did was lost.
      </p>
      {error?.digest && (
        <p className="mt-3 stat-mono text-micro text-ink-600">Reference: {error.digest}</p>
      )}
      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="focus-ring inline-flex items-center gap-2 rounded-control bg-gold-500 px-4 py-2.5 text-detail font-medium text-white transition-colors hover:bg-gold-600"
        >
          <RotateCcw className="h-4 w-4" /> Try again
        </button>
        <Link
          href="/"
          className="focus-ring inline-flex items-center gap-2 rounded-control border border-ink-700 px-4 py-2.5 text-detail text-ink-300 transition-colors hover:text-ink-50"
        >
          <Home className="h-4 w-4" /> Home
        </Link>
      </div>
    </div>
  );
}
