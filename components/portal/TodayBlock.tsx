"use client";

import { dosesDueOn } from "@/lib/dosing/prescriptions";
import { useMemberLog } from "@/lib/member/logStore";
import { TodayDoses } from "@/components/portal/TodayDoses";
import { QuickLog } from "@/components/portal/QuickLog";
import { DayComplete } from "@/components/portal/DayComplete";

/**
 * Everything a member logs, in one place, above everything they merely read.
 *
 * The dashboard used to be seventeen cards of read-only status, with the actual
 * logging scattered across four other routes — and in the case of taking a dose,
 * existing nowhere at all. A member opened the app, looked at a protocol ring
 * they had no way to move, and left having recorded nothing.
 *
 * This block inverts that. What you have to DO is at the top, in one card, and
 * everything that reports on what you have done sits below it. Food and training
 * stay on their own screens because they are genuinely bigger interactions; the
 * daily minimum — doses, weight, how you feel — is all here.
 *
 * The completion state is deliberately a single condition covering all three.
 * Celebrating doses alone would teach a member that the rest is optional.
 */
export function TodayBlock({ clientId, iso }: { clientId: string; iso: string }) {
  const { today } = useMemberLog();
  const due = dosesDueOn(clientId, iso);

  const dosesLogged = today.doses.length >= due.length;
  const weightLogged = today.weightLb !== undefined;
  const feelLogged = !!today.feel;
  const allDone = dosesLogged && weightLogged && feelLogged;

  const remaining =
    (dosesLogged ? 0 : due.length - today.doses.length) +
    (weightLogged ? 0 : 1) +
    (feelLogged ? 0 : 1);

  return (
    <section className="rounded-panel border border-ink-700/70 bg-ink-850/60">
      <header className="flex items-baseline justify-between border-b border-ink-800/70 px-5 py-4">
        <h2 className="text-title text-ink-50">Today</h2>
        <p className="text-detail text-ink-400">
          {allDone ? (
            <span className="text-optimal">All logged</span>
          ) : (
            <>
              <span className="stat-mono text-ink-100">{remaining}</span>{" "}
              {remaining === 1 ? "thing" : "things"} left
            </>
          )}
        </p>
      </header>

      <div className="space-y-7 px-5 py-5">
        <TodayDoses clientId={clientId} iso={iso} />
        <div className="border-t border-ink-800/70 pt-6">
          <QuickLog />
        </div>
      </div>

      <DayComplete show={allDone} label="Everything logged" />
    </section>
  );
}
