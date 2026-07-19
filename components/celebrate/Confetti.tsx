"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { cn, seededRandom } from "@/lib/utils";

/**
 * Dependency-free canvas confetti.
 *
 * Written by hand rather than pulled in because the alternatives are ~15kb to
 * animate rectangles, and every one of them calls `Math.random()` — which in an
 * SSR app means a hydration-unstable first frame and a screenshot that never
 * looks the same twice. Particles here are seeded from a string, so the same
 * celebration renders identically every run.
 *
 * Four things it is careful about:
 *  - **Fires on a trigger, never on mount.** Confetti that appears because a
 *    page loaded is confetti that means nothing. It has to mark an event.
 *  - **Capped particle count.** `MAX_PARTICLES` is a hard ceiling; a caller
 *    asking for 5,000 gets 160 and a smooth frame instead.
 *  - **Cancels its rAF on unmount**, and on every re-fire, so navigating away
 *    mid-burst does not leave a loop running against a detached canvas.
 *  - **Reduced motion is a real fallback, not a no-op.** The burst still
 *    happens — it is just already over: one static settled frame that fades.
 *    Removing the acknowledgement entirely is worse than animating it.
 */

const MAX_PARTICLES = 160;

/** Hoisted so the default props keep a stable identity across renders — an
 *  inline `colors={[...]}` default would re-run the effect every render and
 *  re-fire the burst on every parent state change. */
const DEFAULT_COLORS = ["#e93d3d", "#e0bd6e", "#34d399", "#60a5fa", "#a78bfa"];
const DEFAULT_ORIGIN = { x: 0.5, y: 0.45 };

const GRAVITY = 0.0011; // px per ms²
const DRAG = 0.9985;
const LIFE_MS = 1500;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  color: string;
  /** Staggered so the burst reads as a spray, not a single frame of dots. */
  delay: number;
}

export function Confetti({
  trigger,
  seed = "confetti",
  count = 90,
  colors = DEFAULT_COLORS,
  origin = DEFAULT_ORIGIN,
  className,
}: {
  /** Changing this to a new truthy value fires a burst. `0`/`false` is idle. */
  trigger: number | boolean;
  seed?: string;
  count?: number;
  colors?: string[];
  /** Burst origin as a fraction of the canvas box. */
  origin?: { x: number; y: number };
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const fired = typeof trigger === "boolean" ? trigger : trigger > 0;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Always start from a clean slate — a re-fire must not composite onto the
    // tail of the previous burst.
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!fired) return;

    const parent = canvas.parentElement;
    const w = parent?.clientWidth || 320;
    const h = parent?.clientHeight || 200;
    const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const n = Math.min(MAX_PARTICLES, Math.max(1, count));
    const rand = seededRandom(`${seed}:${String(trigger)}:${n}`);
    const ox = w * origin.x;
    const oy = h * origin.y;

    const particles: Particle[] = Array.from({ length: n }, () => {
      // Cone upward and outward: a fountain reads as celebration, a sphere
      // reads as an explosion.
      const angle = -Math.PI / 2 + (rand() - 0.5) * 2.1;
      const speed = 0.18 + rand() * 0.42;
      return {
        x: ox,
        y: oy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rot: rand() * Math.PI * 2,
        vr: (rand() - 0.5) * 0.012,
        w: 4 + rand() * 5,
        h: 6 + rand() * 7,
        color: colors[Math.floor(rand() * colors.length)],
        delay: rand() * 160,
      };
    });

    const draw = (elapsed: number) => {
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        const t = elapsed - p.delay;
        if (t <= 0) continue;
        const life = Math.min(1, t / LIFE_MS);
        const damp = Math.pow(DRAG, t);
        const x = p.x + p.vx * t * damp;
        const y = p.y + p.vy * t * damp + 0.5 * GRAVITY * t * t;
        if (y > h + 24) continue;
        ctx.save();
        ctx.globalAlpha = 1 - life * life;
        ctx.translate(x, y);
        ctx.rotate(p.rot + p.vr * t);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
    };

    // Reduced motion: one settled frame, then clear. The event is still
    // acknowledged; it simply does not move.
    if (reduced) {
      draw(LIFE_MS * 0.62);
      const id = window.setTimeout(() => ctx.clearRect(0, 0, w, h), 900);
      return () => window.clearTimeout(id);
    }

    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      draw(elapsed);
      if (elapsed < LIFE_MS + 200) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, w, h);
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, seed, count, reduced, colors.join(","), origin.x, origin.y]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 z-20", className)}
    />
  );
}
