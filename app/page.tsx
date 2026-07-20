"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { PORTAL_LIST, type PortalDef } from "@/lib/portals";
import { AmbientField } from "@/components/entry/AmbientField";
import { usePortal } from "@/lib/portalStore";
import {
  ArrowRight,
  ConciergeBell,
  ShieldCheck,
  Fingerprint,
  Stethoscope,
  HeartPulse,
  Sparkles,
  Lock,
  Gauge,
} from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

const PORTAL_ICON = {
  patient: HeartPulse,
  clinic: Stethoscope,
  coach: Sparkles,
  desk: ConciergeBell,
  exec: Gauge,
} as const;

/** Ledger-style proof points shown under the wordmark. */
const PROOF = [
  { label: "Every read logged", detail: "not just writes" },
  { label: "Hash-chained ledger", detail: "tamper-evident" },
  { label: "Reproducible clinical output", detail: "rule-set versioned" },
];

export default function EntryPage() {
  const router = useRouter();
  const { setPortal } = usePortal();
  const [hovered, setHovered] = useState<PortalDef | null>(null);
  const [entering, setEntering] = useState<string | null>(null);

  const accent = hovered?.accent.hex ?? "#e93d3d";

  function enter(p: PortalDef) {
    setEntering(p.id);
    setPortal(p.id);
    // Let the card's exit transition read before the route swaps.
    setTimeout(() => router.push(p.home), 420);
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-ink-950">
      {/* Ambient layers, painted back-to-front */}
      <AmbientField accent={accent} />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        animate={{
          background: `radial-gradient(58rem 40rem at 50% -10%, ${accent}22, transparent 62%)`,
        }}
        transition={{ duration: 0.8, ease: EASE }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(60rem 40rem at 50% 30%, #000 20%, transparent 75%)",
        }}
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-10 lg:px-8">
        {/* ── Masthead ─────────────────────────────────────────────── */}
        <motion.header
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-gold-500 shadow-glow">
              <span className="font-display text-body font-bold text-white">A</span>
            </div>
            <div className="leading-none">
              <p className="font-display text-body font-semibold tracking-tight text-ink-50">
                Apex
              </p>
              <p className="mt-0.5 text-micro uppercase tracking-[0.18em] text-ink-500">
                Alpha Health
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-ink-700/70 bg-ink-900/60 px-3 py-1.5 backdrop-blur">
            <ShieldCheck className="h-3.5 w-3.5 text-optimal" />
            <span className="text-micro text-ink-300">Demonstration build · synthetic data</span>
          </div>
        </motion.header>

        {/* ── Hero ─────────────────────────────────────────────────── */}
        <div className="flex flex-1 flex-col justify-center py-14">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.08 }}
            className="max-w-3xl"
          >
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-gold-400/25 bg-gold-400/8 px-3 py-1">
              <Lock className="h-3 w-3 text-gold-300" />
              <span className="text-micro font-medium tracking-wide text-gold-200">
                Traceable by construction
              </span>
            </div>

            <h1 className="font-display text-display font-semibold leading-[1.05] tracking-tightest text-ink-50 sm:text-6xl">
              The clinic operating system
              <br />
              <span className="bg-gradient-to-r from-gold-300 via-gold-400 to-gold-600 bg-clip-text text-transparent">
                that can prove its work.
              </span>
            </h1>

            <p className="mt-5 max-w-xl text-body leading-relaxed text-ink-400">
              {/* Count-free on purpose. This read "Three portals" and went
                  stale the day a fourth was added, then again on the fifth. */}
              A portal per person, over one system of record. Every recommendation carries
              the rule that produced it, every chart view is logged, and any record
              can be replayed exactly as it looked on any past date.
            </p>

            <div className="mt-7 flex flex-wrap gap-x-7 gap-y-3">
              {PROOF.map((p, i) => (
                <motion.div
                  key={p.label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: EASE, delay: 0.3 + i * 0.09 }}
                  className="flex items-baseline gap-2"
                >
                  <span className="h-1 w-1 rounded-full bg-optimal" />
                  <span className="text-detail font-medium text-ink-200">{p.label}</span>
                  <span className="text-micro text-ink-600">{p.detail}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* ── Portal cards ───────────────────────────────────────── */}
          {/* Two-up then five-up. Was `sm:grid-cols-3`, which left the fourth
              portal orphaned on its own row the moment the front desk was
              added; two columns on a tablet is a better read than three
              narrow ones anyway. Bumped 4 → 5 when the owner console landed,
              for the same reason: at `lg:grid-cols-4` the fifth card sat alone
              on a second row, which reads as an afterthought rather than as a
              peer of the other four. The track is still ~260px at the 1400px
              container, which these cards carry. */}
          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {PORTAL_LIST.map((p, i) => {
              const Icon = PORTAL_ICON[p.id];
              const isLeaving = entering !== null && entering !== p.id;
              return (
                <motion.button
                  key={p.id}
                  type="button"
                  onClick={() => enter(p)}
                  onMouseEnter={() => setHovered(p)}
                  onMouseLeave={() => setHovered((h) => (h?.id === p.id ? null : h))}
                  onFocus={() => setHovered(p)}
                  onBlur={() => setHovered((h) => (h?.id === p.id ? null : h))}
                  initial={{ opacity: 0, y: 26 }}
                  animate={{
                    opacity: isLeaving ? 0 : 1,
                    y: isLeaving ? 14 : 0,
                    scale: entering === p.id ? 1.03 : 1,
                  }}
                  transition={{
                    duration: 0.55,
                    ease: EASE,
                    delay: entering ? 0 : 0.45 + i * 0.1,
                  }}
                  whileHover={{ y: -6 }}
                  className="group relative overflow-hidden rounded-2xl border border-ink-700/70 bg-ink-900/60 p-5 text-left backdrop-blur-md transition-colors hover:border-ink-600 focus-ring"
                >
                  {/* Accent wash — only visible on hover/focus */}
                  <div
                    aria-hidden
                    className={`pointer-events-none absolute inset-0 bg-gradient-to-br opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-focus-visible:opacity-100 ${p.accent.gradient}`}
                  />
                  {/* Top hairline that lights up in the portal accent */}
                  <div
                    aria-hidden
                    className="absolute inset-x-0 top-0 h-px origin-left scale-x-0 transition-transform duration-500 group-hover:scale-x-100 group-focus-visible:scale-x-100"
                    style={{ background: `linear-gradient(90deg, transparent, ${p.accent.hex}, transparent)` }}
                  />

                  <div className="relative">
                    <div
                      className={`mb-4 grid h-10 w-10 place-items-center rounded-xl border transition-transform duration-500 group-hover:scale-110 ${p.accent.soft} ${p.accent.border}`}
                    >
                      <Icon className={`h-5 w-5 ${p.accent.text}`} />
                    </div>

                    <p className="label-eyebrow">{p.persona}</p>
                    <h2 className="mt-1 font-display text-heading font-semibold text-ink-50">
                      {p.label}
                    </h2>
                    <p className="mt-2 min-h-[3.25rem] text-detail leading-relaxed text-ink-400">
                      {p.tagline}
                    </p>

                    <div className="mt-4 space-y-1.5 border-t border-ink-700/60 pt-3">
                      <div className="flex items-center gap-1.5">
                        <Fingerprint className="h-3 w-3 text-ink-500" />
                        <span className="text-micro text-ink-300">{p.identity.method}</span>
                      </div>
                      <p className="pl-[18px] text-micro text-ink-600">{p.identity.session}</p>
                      {/* The production identity model, rendered explicitly as a
                          PLAN. These strings used to sit in `method`/`session`
                          and read as statements of fact — five cards making five
                          security claims the code did not honour. Labelled, they
                          are useful; unlabelled, they were the worst kind of
                          untruth this product could tell. */}
                      <p className="pl-[18px] text-micro text-ink-700">
                        <span className="text-ink-600">Planned:</span> {p.identity.planned}
                      </p>
                    </div>

                    <div className="mt-4 flex items-center gap-1.5">
                      <span className={`text-detail font-medium ${p.accent.text}`}>
                        {entering === p.id ? "Signing in" : "Enter"}
                      </span>
                      <ArrowRight
                        className={`h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1 ${p.accent.text}`}
                      />
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* ── Footer ───────────────────────────────────────────────── */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.9 }}
          className="flex flex-col items-start justify-between gap-3 border-t border-ink-800/60 pt-5 sm:flex-row sm:items-center"
        >
          <p className="text-micro leading-relaxed text-ink-600">
            Apex demonstration build. Synthetic data, Apex-owned. No PHI, no real
            prescribing, no real fulfillment.
          </p>
          <Link
            href="/clinic"
            className="text-micro text-ink-500 underline-offset-4 transition-colors hover:text-ink-300 hover:underline focus-ring"
          >
            Skip to the medical console →
          </Link>
        </motion.footer>
      </div>

      {/* Sign-in sweep — a single accent wipe as the route changes. */}
      <AnimatePresence>
        {entering && (
          <motion.div
            key="sweep"
            aria-hidden
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.42, ease: EASE }}
            className="pointer-events-none absolute inset-0 origin-bottom"
            style={{
              background: `linear-gradient(0deg, ${
                PORTAL_LIST.find((p) => p.id === entering)?.accent.hex ?? "#e93d3d"
              }14, transparent)`,
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
