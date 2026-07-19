"use client";

import { Menu, Search, ShieldCheck } from "lucide-react";
import { useStore, type RoleView } from "@/lib/store";
import { LocationFilter } from "@/components/LocationFilter";
import { NotificationBell } from "@/components/NotificationBell";
import { usePortal } from "@/lib/portalStore";
import { me } from "@/components/portal/PortalHeader";

const ROLES: RoleView[] = ["Medical", "Coach", "Admin"];

const ROLE_PERSON: Record<RoleView, { name: string; initials: string }> = {
  Medical: { name: "Dr. Marcus Vale", initials: "MV" },
  Coach: { name: "Tyler Brooks", initials: "TB" },
  Admin: { name: "Owen Castellano", initials: "OC" },
};

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { role, setRole, portal } = useStore() as ReturnType<typeof useStore> & { portal?: never };
  const { portal: activePortal } = usePortal();

  /**
   * A member is not staff.
   *
   * The client portal must never render the location filter, the staff role
   * switcher, a staff identity chip, or a compliance ribbon written for
   * clinicians. Leaking operator chrome onto a member surface is both a broken
   * flow and, in a demo, a bad look — it implies the member can see across the
   * practice.
   */
  const isMember = activePortal.id === "patient";
  const member = isMember ? me() : null;

  const openCommand = () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true }),
    );
  };

  return (
    <header className="sticky top-0 z-30 border-b border-ink-800 bg-ink-950/80 backdrop-blur-xl">
      <div className="flex items-center gap-3 px-4 py-3 lg:px-6">
        <button
          onClick={onMenu}
          className="text-ink-300 hover:text-ink-50 lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Command bar trigger (⌘K) */}
        <button
          onClick={openCommand}
          className="relative hidden h-9 max-w-sm flex-1 items-center rounded-lg border border-ink-800 bg-ink-900/70 pl-9 pr-2 text-left text-sm text-ink-500 transition-colors hover:border-ink-700 sm:flex"
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
          Search or ask AI…
          <kbd className="ml-auto rounded border border-ink-700 px-1.5 py-0.5 text-[10px] text-ink-500">⌘K</kbd>
        </button>
        <button
          onClick={openCommand}
          className="text-ink-300 hover:text-ink-50 sm:hidden"
          aria-label="Open command bar"
        >
          <Search className="h-5 w-5" />
        </button>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {!isMember && <LocationFilter />}
          {!isMember && <NotificationBell />}

          {/* Staff role switcher — never on a member surface. */}
          {!isMember && (
            <div className="hidden items-center rounded-lg border border-ink-800 bg-ink-900/70 p-0.5 md:flex">
              {ROLES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors " +
                    (role === r
                      ? "bg-gold-400/15 text-gold-200"
                      : "text-ink-400 hover:text-ink-100")
                  }
                >
                  {r}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 rounded-lg border border-ink-800 bg-ink-900/70 px-2.5 py-1.5">
            <span
              className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold text-ink-950"
              style={{
                background: member
                  ? member.avatarColor
                  : undefined,
              }}
            >
              <span className={member ? "" : "grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-gold-300 to-gold-600"}>
                {member
                  ? `${member.firstName[0]}${member.lastName[0]}`
                  : ROLE_PERSON[role].initials}
              </span>
            </span>
            <span className="hidden text-xs font-medium text-ink-200 sm:block">
              {member ? `${member.firstName} ${member.lastName}` : ROLE_PERSON[role].name}
            </span>
          </div>
        </div>
      </div>

      {/* Compliance ribbon */}
      <div className="flex items-center gap-2 border-t border-ink-800/60 bg-ink-900/40 px-4 py-1.5 lg:px-6">
        <ShieldCheck className="h-3.5 w-3.5 text-gold-400/80" />
        <p className="text-[11px] text-ink-400">
          {isMember
            ? "Demonstration build. Synthetic data — this is not a real health record and not medical advice."
            : "Demo only. Not medical advice. Recommendations require review and approval by a licensed provider."}
        </p>
      </div>
    </header>
  );
}
