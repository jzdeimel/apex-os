import { notFound } from "next/navigation";
import { AutomationOperations } from "@/components/automation/AutomationOperations";
import { actorFromPrincipal } from "@/lib/auth/actor";
import { currentPrincipal } from "@/lib/auth/principal";
import { serializeAutomationState } from "@/lib/automationState";
import { readAutomationState } from "@/lib/db/automationRepo";

export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
  const principal = await currentPrincipal();
  const actor = principal ? actorFromPrincipal(principal) : null;
  if (!actor || !["owner", "operations"].includes(actor.accessProfile)) {
    notFound();
  }

  const state = await readAutomationState();
  return (
    <AutomationOperations
      initialState={serializeAutomationState(state)}
      view="rules"
    />
  );
}
