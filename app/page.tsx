import { redirect } from "next/navigation";

import { currentPrincipal } from "@/lib/auth/principal";
import { IS_DEMO } from "@/lib/config";
import type { AccessProfile } from "@/lib/authz/profiles";
import DemoEntryPage from "@/components/entry/DemoEntryPage";

export const dynamic = "force-dynamic";

const HOME_BY_PROFILE: Record<AccessProfile, string> = {
  owner: "/admin/migration-preview",
  "system-admin": "/admin/migration-preview",
  executive: "/exec",
  operations: "/admin/cases",
  provider: "/clinic",
  nursing: "/clinic",
  coach: "/coach",
  "front-desk": "/desk",
  billing: "/clients",
  fulfillment: "/supply-chain",
  marketing: "/exec/marketing",
  unassigned: "/access-pending",
};

/**
 * Shared Azure environments behave like the clinic application: EasyAuth
 * identifies the staff member and their database-backed access profile chooses
 * the home screen. The multi-console launcher survives only in an explicitly
 * enabled local demo build.
 */
export default async function HomePage() {
  if (IS_DEMO) return <DemoEntryPage />;

  const principal = await currentPrincipal();
  if (!principal) {
    redirect("/.auth/login/aad?post_login_redirect_uri=/");
  }

  redirect(HOME_BY_PROFILE[principal.accessProfile ?? "unassigned"]);
}
