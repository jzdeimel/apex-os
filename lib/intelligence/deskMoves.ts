import type { NextMove } from "@/lib/intelligence/types";

export function deskMoves(args: {
  waitingCount: number;
  inRoomCount: number;
  longestWaitMin: number;
  nextName?: string;
  nextInMin?: number | null;
}): NextMove[] {
  const out: NextMove[] = [];
  if (args.longestWaitMin >= 15) {
    out.push({
      id: "desk-wait",
      owner: "Front desk",
      title: "Longest wait needs a room decision",
      detail: "A wait over 15 minutes is the moment to update the member and unblock the room plan.",
      metric: `${args.longestWaitMin} min`,
      tone: "high",
      icon: "room",
    });
  }
  if (args.waitingCount > 0) {
    out.push({
      id: "desk-arrived",
      owner: "Front desk",
      title: `${args.waitingCount} waiting to move`,
      detail: "Check documents, payment and room assignment before the provider falls behind.",
      metric: `${args.inRoomCount} roomed`,
      tone: "watch",
      icon: "calendar",
    });
  }
  if (args.nextName) {
    out.push({
      id: "desk-next",
      owner: "Front desk",
      title: `${args.nextName} is next through the door`,
      detail:
        args.nextInMin === null || args.nextInMin === undefined
          ? "Arrival time is unknown."
          : args.nextInMin < 0
            ? "They are late. A quick call protects the visit slot."
            : "The next handoff is the one to prepare.",
      metric:
        args.nextInMin === null || args.nextInMin === undefined
          ? "next"
          : args.nextInMin < 0
            ? `${Math.abs(args.nextInMin)} min late`
            : `${args.nextInMin} min`,
      tone: args.nextInMin !== null && args.nextInMin !== undefined && args.nextInMin < 0 ? "watch" : "neutral",
      icon: "calendar",
    });
  }
  if (out.length === 0) {
    out.push({
      id: "desk-clear",
      owner: "Front desk",
      title: "The day is moving cleanly",
      detail: "No one is waiting, no room is overrun and the next arrival has room to land.",
      metric: "clear",
      tone: "optimal",
      icon: "spark",
    });
  }
  return out;
}
