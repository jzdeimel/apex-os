"use client";

import Link from "next/link";
import type { Client } from "@/lib/types";
import { clientName } from "@/lib/mock/clients";
import { staffName } from "@/lib/mock/staff";
import { locationName } from "@/lib/mock/locations";
import { relativeDays } from "@/lib/utils";
import { alphaScore } from "@/lib/alphaScore";
import { ClientStatusBadge } from "@/components/StatusBadge";
import { RiskBadge } from "@/components/RiskBadge";
import { Monogram } from "@/components/Monogram";
import { AlphaScoreRing } from "@/components/AlphaScoreRing";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { FavoriteStar } from "@/components/FavoriteStar";
import { motion } from "framer-motion";
import { Users, CalendarClock, ArrowUpRight } from "lucide-react";

function topRisk(c: Client) {
  const order = { high: 3, moderate: 2, low: 1, none: 0 };
  return c.riskFlags.slice().sort((a, b) => order[b.level] - order[a.level])[0];
}

export function ClientGallery({ clients }: { clients: Client[] }) {
  if (clients.length === 0) {
    return <EmptyState icon={<Users className="h-6 w-6" />} title="No clients match these filters" hint="Try clearing search or location." />;
  }

  return (
    <motion.div
      className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3"
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
    >
      {clients.map((c) => {
        const risk = topRisk(c);
        const score = alphaScore(c);
        return (
          <motion.div
            key={c.id}
            variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } } }}
            whileHover={{ y: -5 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            className="group relative overflow-hidden rounded-2xl border border-ink-700/70 bg-ink-850/80 p-4 shadow-card hover:border-ink-600 hover:shadow-glow"
          >
            {/* overlay link covers the card; interactive controls sit above it */}
            <Link href={`/clients/${c.id}`} aria-label={clientName(c)} className="absolute inset-0 z-0" />

            {/* accent wash */}
            <div
              className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-20 blur-2xl transition-opacity group-hover:opacity-40"
              style={{ background: c.avatarColor }}
            />

            <FavoriteStar clientId={c.id} className="absolute right-3 top-3 z-20" />

            <div className="pointer-events-none relative z-10">
              <div className="flex items-center gap-3 pr-8">
                <Monogram client={c} size="lg" />
                <div>
                  <h3 className="font-display text-body font-semibold leading-tight text-ink-50">{clientName(c)}</h3>
                  <p className="text-detail text-ink-400">
                    {c.age} · {c.sex === "male" ? "M" : "F"} · {locationName(c.locationId)}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <ClientStatusBadge status={c.status} />
                  {risk && risk.level !== "none" ? <RiskBadge level={risk.level} /> : <RiskBadge level="none" />}
                </div>
                {score.hasLabs ? (
                  <AlphaScoreRing result={score} size={44} showLabel={false} />
                ) : (
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-dashed border-ink-600 text-center text-micro leading-tight text-ink-400">
                    Labs<br />pending
                  </span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-1">
                {c.goals.slice(0, 3).map((g) => (
                  <Badge key={g}>{g}</Badge>
                ))}
                {c.goals.length > 3 && <Badge>+{c.goals.length - 3}</Badge>}
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-ink-800/70 pt-3 text-detail text-ink-400">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5" />
                  {c.nextAppointment ? relativeDays(c.nextAppointment) : "No visit booked"}
                </span>
                <span className="inline-flex items-center gap-1 text-ink-500 transition-colors group-hover:text-gold-400">
                  {staffName(c.coachId).split(" ")[0]}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
