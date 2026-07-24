import type { Client } from "@/lib/types";
import { staffMap } from "@/lib/mock/staff";
import { ordersForClient } from "@/lib/mock/orders";
import { clientFacingStatus } from "@/lib/orders/lifecycle";
import { topMoments, NOW as MEMBER_NOW } from "@/lib/engage/moments";
import { weeklyReview } from "@/lib/member/weeklyReview";
import { getLabsForClient } from "@/lib/mock/labs";
import type { NextMove } from "@/lib/intelligence/types";

export function memberMoves(client: Client, nowIso: string = MEMBER_NOW): NextMove[] {
  const moments = topMoments(client.id, 2, nowIso);
  const week = weeklyReview(client);
  const lab = getLabsForClient(client.id);
  const flagged = lab?.biomarkers.filter((b) => b.status !== "optimal").length ?? 0;
  const latestOrder = ordersForClient(client.id).find((o) => o.visibleToClient);

  const out: NextMove[] = [];
  const top = moments[0];
  if (top) {
    out.push({
      id: `moment-${top.id}`,
      owner: top.from?.role ?? "Apex",
      title: top.headline,
      detail: top.detail,
      href: top.href,
      metric: top.kind === "quiet-day" ? "today" : "new",
      tone: top.kind === "quiet-day" ? "neutral" : top.kind === "labs-back" ? "info" : "gold",
      icon: top.kind === "labs-back" ? "flask" : top.kind === "coach-message" ? "message" : "spark",
    });
  }

  out.push({
    id: `week-${client.id}`,
    owner: "You",
    title: week.next.label,
    detail: week.next.why,
    href: week.next.href,
    metric: `${week.adherence.daysClosed}/7 days`,
    tone: week.next.id === "nothing" ? "optimal" : "watch",
    icon: week.next.id === "visit" ? "calendar" : "growth",
  });

  if (lab) {
    out.push({
      id: `labs-${lab.id}`,
      owner: staffMap[client.providerId]?.name ?? "Provider",
      title: flagged ? `${flagged} lab markers to discuss` : "Newest lab panel has no flagged markers",
      detail: flagged
        ? "Markers are grouped for review so you can see what changed before your care team responds."
        : "The newest panel has no marker outside its shown reference lane.",
      href: "/portal/labs",
      metric: lab.resultedOn,
      tone: flagged ? "info" : "optimal",
      icon: "flask",
    });
  }

  if (latestOrder) {
    out.push({
      id: `order-${latestOrder.id}`,
      owner: "Operations",
      title: clientFacingStatus(latestOrder.status),
      detail: latestOrder.lines.map((l) => l.name).slice(0, 2).join(", "),
      href: "/portal",
      metric: latestOrder.status,
      tone:
        latestOrder.status === "Insufficient stock" || latestOrder.status === "QC hold"
          ? "high"
          : latestOrder.status === "Delivered"
            ? "optimal"
            : "watch",
      icon: "package",
    });
  }

  return out.slice(0, 4);
}
