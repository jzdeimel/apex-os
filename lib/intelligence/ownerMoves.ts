import { attentionItems } from "@/lib/exec/attention";
import { bookState } from "@/lib/exec/business";
import type { NextMove } from "@/lib/intelligence/types";

export function ownerMoves(limit = 5): NextMove[] {
  const attention = attentionItems().slice(0, limit).map((item) => ({
    id: `owner-${item.id}`,
    owner: "Owner",
    title: item.headline,
    detail: item.detail,
    href: item.href,
    metric: item.magnitude,
    tone:
      item.kind === "member-waiting" || item.kind === "clinical-ageing"
        ? "high"
        : item.kind === "money-uncollected"
          ? "watch"
          : "neutral",
    icon:
      item.kind === "money-uncollected"
        ? "money"
        : item.kind === "member-waiting"
          ? "package"
          : item.kind === "clinical-ageing"
            ? "signature"
            : "spark",
  })) satisfies NextMove[];

  const book = bookState("all");
  const leakage = book.lapsedMrr + book.pausedMrr;
  if (leakage > 0) {
    attention.push({
      id: "owner-leakage",
      owner: "Revenue",
      title: `$${leakage.toLocaleString("en-US")}/mo is paused or lapsed`,
      detail: "Paused and lapsed memberships need a reason, a recovery path and a resume date.",
      href: "/coach/winback",
      metric: `${book.lapsedCount + book.pausedCount} accounts`,
      tone: "watch",
      icon: "money",
    });
  }

  return attention.slice(0, limit);
}
