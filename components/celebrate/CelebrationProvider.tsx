"use client";

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Confetti } from "@/components/celebrate/Confetti";
import { DoseLoggedBurst } from "@/components/portal/DoseLoggedBurst";
import { DayComplete } from "@/components/portal/DayComplete";

type DoseLoggedEvent = {
  type: "doseLogged";
  name: string;
  libraryKey?: string;
};

type DayCompleteEvent = {
  type: "dayComplete";
  label?: string;
};

type ConfettiEvent = {
  type: "confetti";
  seed: string;
  count?: number;
};

export type CelebrationEvent = DoseLoggedEvent | DayCompleteEvent | ConfettiEvent;

interface CelebrationStore {
  emit: (event: CelebrationEvent) => void;
}

const Ctx = createContext<CelebrationStore | null>(null);

export function CelebrationProvider({ children }: { children: React.ReactNode }) {
  const [dose, setDose] = useState<(DoseLoggedEvent & { key: number }) | null>(null);
  const [day, setDay] = useState<(DayCompleteEvent & { key: number }) | null>(null);
  const [confetti, setConfetti] = useState<(ConfettiEvent & { key: number }) | null>(null);
  const eventKey = useRef(0);

  const emit = useCallback((event: CelebrationEvent) => {
    eventKey.current += 1;
    const key = eventKey.current;
    if (event.type === "doseLogged") setDose({ ...event, key });
    if (event.type === "dayComplete") setDay({ ...event, key });
    if (event.type === "confetti") setConfetti({ ...event, key });
  }, []);

  const value = useMemo<CelebrationStore>(() => ({ emit }), [emit]);

  return (
    <Ctx.Provider value={value}>
      {children}

      {dose && (
        <DoseLoggedBurst
          key={dose.key}
          show
          libraryKey={dose.libraryKey}
          name={dose.name}
          onDone={() => setDose((current) => (current?.key === dose.key ? null : current))}
        />
      )}

      {day && <DayComplete key={day.key} show label={day.label ?? "Everything logged"} />}

      {confetti && (
        <div className="pointer-events-none fixed inset-0 z-[70]" aria-hidden>
          <Confetti trigger={confetti.key} seed={confetti.seed} count={confetti.count ?? 90} />
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useCelebrations(): CelebrationStore {
  const ctx = useContext(Ctx);
  if (!ctx) return { emit: () => {} };
  return ctx;
}
