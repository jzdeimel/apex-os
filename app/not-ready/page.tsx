import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

import { currentPrincipal } from "@/lib/auth/principal";
import { Button } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

const HOME: Record<string, string> = {
  owner: "/admin/migration-preview",
  "system-admin": "/admin/migration-preview",
  executive: "/exec/marketing",
  operations: "/admin/cases",
  provider: "/clinic",
  nursing: "/clinic",
  coach: "/coach",
  "front-desk": "/desk",
  billing: "/admin/cases",
  fulfillment: "/supply-chain",
  marketing: "/exec/marketing",
};

export default async function NotReadyPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const [principal, params] = await Promise.all([
    currentPrincipal(),
    searchParams,
  ]);
  const home = HOME[principal?.accessProfile ?? ""] ?? "/";

  return (
    <div className="mx-auto max-w-2xl py-16">
      <div className="rounded-panel border border-watch/30 bg-watch/[0.05] p-7">
        <ShieldCheck className="h-8 w-8 text-watch" aria-hidden />
        <p className="mt-5 label-eyebrow">AUTHORITATIVE DATA REQUIRED</p>
        <h1 className="mt-2 font-display text-display text-ink-50">
          This surface is not operational yet
        </h1>
        <p className="mt-4 text-body leading-relaxed text-ink-300">
          This screen still depends on seeded, browser-only, scripted, or
          illustrative information. Apex has disabled it in the shared
          environment rather than presenting a demonstration as a patient,
          clinical, operational, or financial record.
        </p>
        {params.from && (
          <p className="mt-4 stat-mono text-micro text-ink-500">
            Blocked route: {params.from}
          </p>
        )}
        <div className="mt-6">
          <Link href={home}>
            <Button>
              <ArrowLeft className="h-4 w-4" /> Return to operational Apex
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
