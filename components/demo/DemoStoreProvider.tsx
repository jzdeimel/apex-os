"use client";

import { StoreProvider } from "@/lib/store";

/**
 * Fixture/browser state for explicit local demo mode only.
 *
 * Keeping this behind a lazy module boundary prevents shared Apex from loading
 * the seeded staff, automation, note, and task stores at all.
 */
export function DemoStoreProvider({ children }: { children: React.ReactNode }) {
  return <StoreProvider>{children}</StoreProvider>;
}
