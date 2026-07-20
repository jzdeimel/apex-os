import type { TimelineEvent, TimelineEventType } from "@/lib/types";
import { staffName } from "@/lib/mock/staff";
import { formatDateTime } from "@/lib/utils";
import {
  UserPlus,
  CalendarCheck,
  ClipboardList,
  FlaskConical,
  FileCheck2,
  Scale,
  Sparkles,
  UserCheck,
  ShieldCheck,
  CalendarClock,
} from "lucide-react";

const ICON: Record<TimelineEventType, typeof UserPlus> = {
  "Lead created": UserPlus,
  "Consult booked": CalendarCheck,
  "Intake submitted": ClipboardList,
  "Labs ordered": FlaskConical,
  "Results received": FileCheck2,
  "Body scan completed": Scale,
  "AI recommendations generated": Sparkles,
  "Coach reviewed": UserCheck,
  "Provider approved": ShieldCheck,
  "Follow-up scheduled": CalendarClock,
};

const ACCENT: Partial<Record<TimelineEventType, string>> = {
  "AI recommendations generated": "text-gold-400 bg-gold-400/15",
  "Provider approved": "text-optimal bg-optimal/15",
  "Results received": "text-low bg-low/15",
};

export function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="relative space-y-4 pl-2">
      <span className="absolute left-[18px] top-2 bottom-2 w-px bg-ink-800" aria-hidden />
      {events.map((e) => {
        const Icon = ICON[e.type];
        const accent = ACCENT[e.type] ?? "text-ink-400 bg-ink-800";
        return (
          <li key={e.id} className="relative flex gap-3.5">
            <span className={`z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full ring-4 ring-ink-950 ${accent}`}>
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                <p className="text-body font-medium text-ink-100">{e.type}</p>
                <time className="stat-mono text-micro text-ink-500">{formatDateTime(e.at)}</time>
              </div>
              <p className="text-detail text-ink-400">{e.detail}</p>
              {e.actorId && (
                <p className="mt-0.5 text-micro text-ink-600">by {staffName(e.actorId)}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
