"use client";

/**
 * Training — /portal/train
 *
 * The plan hands a member a weekly split written in coach shorthand. This page
 * turns the day they are standing in into a session they can run: sets, reps,
 * rest and a cue per movement, with joint-friendly swaps one tap away.
 */

import { WorkoutLibrary } from "@/components/portal/WorkoutLibrary";
import { me, PortalPageHeader } from "@/components/portal/PortalHeader";

export default function PortalTrainPage() {
  const client = me();

  return (
    <div className="space-y-8">
      <PortalPageHeader
        eyebrow="Your training"
        title="What to do today"
        subtitle="Your plan sets the focus for each day. Here is how to train it — sets, reps, rest and one thing to think about on every movement."
      />
      <WorkoutLibrary client={client} />
    </div>
  );
}
