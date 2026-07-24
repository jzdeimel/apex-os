"use client";

import dynamic from "next/dynamic";

import { useCurrentStaff } from "@/lib/auth/useCurrentStaff";
import { IS_DEMO_UI } from "@/lib/publicConfig";

const DemoPersonaSwitcher = dynamic(
  () => import("@/components/layout/DemoPersonaSwitcher").then((module) => module.DemoPersonaSwitcher),
  { ssr: false },
);

function StaffIdentity() {
  const currentStaff = useCurrentStaff();
  const signedInName = currentStaff?.name || "Signed in";
  const initials = signedInName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "AH";

  return (
    <div className="flex items-center gap-2 rounded-lg border border-ink-800 bg-ink-900/70 px-2.5 py-1.5">
      <span className="grid h-6 w-6 place-items-center rounded-full bg-gold-500 text-micro font-bold text-white">
        {initials}
      </span>
      <span className="hidden text-detail font-medium text-ink-200 sm:block">{signedInName}</span>
    </div>
  );
}

export function PersonaSwitcher() {
  return IS_DEMO_UI ? <DemoPersonaSwitcher /> : <StaffIdentity />;
}
