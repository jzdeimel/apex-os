import { ShieldAlert } from "lucide-react";

import { currentPrincipal } from "@/lib/auth/principal";

export const dynamic = "force-dynamic";

export default async function AccessPendingPage() {
  const principal = await currentPrincipal();

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-2xl items-center px-6 py-16">
      <section className="w-full rounded-2xl border border-ink-800 bg-ink-900/70 p-8 shadow-card">
        <ShieldAlert className="h-8 w-8 text-watch" />
        <p className="label-eyebrow mt-5">Access pending</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-ink-50">
          Your Alpha Health account is signed in but not assigned.
        </h1>
        <p className="mt-4 text-body leading-relaxed text-ink-400">
          An Apex administrator must map this Entra account to an active staff
          record and approved job profile before clinic data can be opened.
        </p>
        <p className="mt-5 text-detail text-ink-500">
          Signed in as {principal?.email || principal?.name || "an unmapped account"}.
        </p>
      </section>
    </main>
  );
}
