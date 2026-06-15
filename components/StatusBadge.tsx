import type {
  ClientStatus,
  BiomarkerStatus,
  RecommendationStatus,
  InventoryStatus,
} from "@/lib/types";
import { Badge } from "@/components/ui/primitives";

const CLIENT_TONE: Record<ClientStatus, "neutral" | "gold" | "optimal" | "watch" | "low" | "high" | "info"> = {
  Lead: "neutral",
  "Consult Booked": "info",
  "Labs Ordered": "low",
  "Results Ready": "gold",
  "Plan Review": "watch",
  "Active Protocol": "optimal",
  "Follow-Up Due": "high",
  Inactive: "neutral",
};

export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  return <Badge tone={CLIENT_TONE[status]}>{status}</Badge>;
}

const BIO_TONE: Record<BiomarkerStatus, "optimal" | "watch" | "low" | "high"> = {
  optimal: "optimal",
  watch: "watch",
  low: "low",
  high: "high",
};
const BIO_LABEL: Record<BiomarkerStatus, string> = {
  optimal: "Optimal",
  watch: "Watch",
  low: "Low",
  high: "High",
};

export function BiomarkerStatusBadge({ status }: { status: BiomarkerStatus }) {
  return <Badge tone={BIO_TONE[status]}>{BIO_LABEL[status]}</Badge>;
}

const REC_TONE: Record<RecommendationStatus, "neutral" | "info" | "optimal" | "high"> = {
  draft: "neutral",
  "coach reviewed": "info",
  "provider approved": "optimal",
  declined: "high",
};
const REC_LABEL: Record<RecommendationStatus, string> = {
  draft: "Draft",
  "coach reviewed": "Coach reviewed",
  "provider approved": "Provider approved",
  declined: "Declined",
};

export function RecStatusBadge({ status }: { status: RecommendationStatus }) {
  return <Badge tone={REC_TONE[status]}>{REC_LABEL[status]}</Badge>;
}

const INV_TONE: Record<InventoryStatus, "optimal" | "watch" | "high" | "neutral"> = {
  "in stock": "optimal",
  low: "watch",
  "expiring soon": "high",
  "out of stock": "high",
};

export function InventoryStatusBadge({ status }: { status: InventoryStatus }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return <Badge tone={INV_TONE[status]}>{label}</Badge>;
}
