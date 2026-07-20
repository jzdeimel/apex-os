"use client";

import * as React from "react";
import { MobileSignQueue } from "@/components/clinic/MobileSignQueue";
import { SecondOpinion } from "@/components/clinic/SecondOpinion";
import { SwitchView } from "@/components/motion";
import { Tabs } from "@/components/ui/Tabs";

/**
 * Clinic · Sign — the provider's signature queue, built phone-first, with the
 * second-opinion comparison alongside it.
 *
 * The two belong on one page because they answer the same question from
 * opposite ends. The queue asks "should I sign this one?" and the comparison
 * asks "would this even exist under a different rule set?" — a provider who has
 * just seen a recommendation appear in exactly one configuration reads the next
 * signature request very differently.
 */
export default function ClinicSignPage() {
  const [tab, setTab] = React.useState("queue");

  return (
    <div className="space-y-8">
      <header>
        <p className="label-eyebrow">CLINIC</p>
        <h1 className="mt-1 font-display text-title font-semibold tracking-tight text-ink-50">
          Sign
        </h1>
        <p className="mt-2 text-body text-ink-400">
          Clear your signature queue one item at a time, with the evidence on the same screen as
          the decision. Built for a phone between patients — the failure mode a mobile sign-off
          flow has to design against is signing blind.
        </p>
      </header>

        <Tabs
          tabs={[
            { id: "queue", label: "Signature queue" },
            { id: "second-opinion", label: "Second opinion" },
          ]}
          active={tab}
          onChange={setTab}
        />

      <SwitchView k={tab}>
        {tab === "queue" ? <MobileSignQueue /> : <SecondOpinion />}
      </SwitchView>
    </div>
  );
}
