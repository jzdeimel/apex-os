import type { BodyScan, SegmentalLean } from "@/lib/types";
import { clients } from "@/lib/mock/clients";
import { seededRandom, clamp } from "@/lib/utils";

// A client has an InBody scan on file if they're on a program or fall into a
// deterministic ~40% of the rest of the population.
function hasScan(clientId: string, hasProgram: boolean): boolean {
  if (hasProgram) return true;
  return seededRandom(clientId + "hasscan")() < 0.4;
}

// Body-fat % anchors per client to match their metabolic story.
const BF_ANCHOR: Record<string, number> = {
  "c-001": 27.5, "c-003": 18.0, "c-005": 31.0, "c-007": 14.5, "c-008": 34.0,
  "c-011": 20.0, "c-013": 29.0, "c-014": 33.0, "c-019": 22.0, "c-021": 30.5,
  "c-022": 31.5, "c-024": 28.0,
};

function segmentals(rand: () => number, leanKg: number, sex: "male" | "female"): SegmentalLean[] {
  const armFrac = 0.06;
  const legFrac = 0.16;
  const trunkFrac = 0.5;
  const mk = (segment: SegmentalLean["segment"], frac: number): SegmentalLean => {
    const massKg = clamp(leanKg * frac * (0.92 + rand() * 0.16), 1, 40);
    const r = rand();
    const rating: SegmentalLean["rating"] = r < 0.2 ? "low" : r > 0.82 ? "high" : "normal";
    return { segment, massKg: Math.round(massKg * 10) / 10, rating };
  };
  void sex;
  return [
    mk("Left Arm", armFrac),
    mk("Right Arm", armFrac),
    mk("Trunk", trunkFrac),
    mk("Left Leg", legFrac),
    mk("Right Leg", legFrac),
  ];
}

export const bodyScans: BodyScan[] = clients
  .filter((c) => hasScan(c.id, c.programs.length > 0))
  .map((c) => {
    const rand = seededRandom(c.id + "scan");
    const bf = BF_ANCHOR[c.id] ?? (c.sex === "male" ? 13 + rand() * 18 : 22 + rand() * 17);
    const weightKg =
      c.sex === "male" ? 82 + rand() * 28 : 64 + rand() * 22;
    const leanKg = weightKg * (1 - bf / 100);
    const skeletalMuscleKg = leanKg * 0.55;
    const bmr = Math.round(
      370 + 21.6 * leanKg + (c.sex === "male" ? 60 : 0),
    );
    const visceral = clamp(
      Math.round((bf - 8) / 1.6 + (c.sex === "male" ? 2 : 0)),
      1,
      20,
    );

    // 5-point progress history easing from a worse start toward current.
    const dates = ["2026-01-20", "2026-03-03", "2026-04-14", "2026-05-19", c.latestLabDate ?? "2026-06-01"];
    const onProtocol = c.programs.length > 0;
    const history = dates.map((date, i) => {
      const t = i / (dates.length - 1);
      const driftBf = onProtocol ? 4.5 : 1.0; // improving clients drop BF
      const startBf = bf + driftBf;
      const startW = weightKg + driftBf * 0.9;
      const startMuscle = skeletalMuscleKg - (onProtocol ? 1.2 : 0.2);
      return {
        date,
        weightKg: Math.round((startW + (weightKg - startW) * t) * 10) / 10,
        bodyFatPct: Math.round((startBf + (bf - startBf) * t) * 10) / 10,
        skeletalMuscleKg: Math.round((startMuscle + (skeletalMuscleKg - startMuscle) * t) * 10) / 10,
      };
    });

    return {
      id: `scan-${c.id}`,
      clientId: c.id,
      scannedOn: dates[dates.length - 1],
      device: "InBody 970 (simulated)",
      weightKg: Math.round(weightKg * 10) / 10,
      bodyFatPct: Math.round(bf * 10) / 10,
      skeletalMuscleKg: Math.round(skeletalMuscleKg * 10) / 10,
      visceralFatLevel: visceral,
      bmr,
      totalBodyWaterPct: Math.round((50 + rand() * 12) * 10) / 10,
      segmental: segmentals(rand, leanKg, c.sex),
      history,
    };
  });

export const scanByClient = Object.fromEntries(bodyScans.map((s) => [s.clientId, s]));

export function getScanForClient(clientId: string): BodyScan | undefined {
  return scanByClient[clientId];
}
