export type MoveTone = "neutral" | "gold" | "optimal" | "watch" | "high" | "low" | "info";

export type MoveIcon =
  | "spark"
  | "message"
  | "calendar"
  | "flask"
  | "signature"
  | "package"
  | "growth"
  | "money"
  | "room"
  | "shield";

export interface NextMove {
  id: string;
  owner: string;
  title: string;
  detail: string;
  metric?: string;
  href?: string;
  tone: MoveTone;
  icon: MoveIcon;
}

export function toneForScore(score: number): MoveTone {
  if (score >= 70) return "high";
  if (score >= 45) return "watch";
  if (score >= 22) return "gold";
  return "neutral";
}
