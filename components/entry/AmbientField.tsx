"use client";

import { useEffect, useRef } from "react";

/**
 * Ambient particle field behind the entry screen.
 *
 * Canvas rather than DOM because we draw ~70 nodes plus their proximity edges
 * every frame — that is far too much churn for React. Deterministic seeding
 * keeps the opening frame identical on every load, which matters when the
 * screen is being screen-shared or recorded for a pitch.
 *
 * Honors prefers-reduced-motion by painting a single static frame.
 */

const NODE_COUNT = 70;
const LINK_DISTANCE = 132;
const DRIFT = 0.13;

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

/** xmur3 + mulberry32 — same deterministic PRNG idiom as lib/utils. */
function seeded(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function AmbientField({ accent = "#e93d3d" }: { accent?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rand = seeded("apex-entry-field");

    let width = 0;
    let height = 0;
    let dpr = 1;
    let nodes: Node[] = [];

    function resize() {
      const canvas = ref.current;
      if (!canvas || !ctx) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function seedNodes() {
      nodes = Array.from({ length: NODE_COUNT }, () => ({
        x: rand() * width,
        y: rand() * height,
        vx: (rand() - 0.5) * DRIFT,
        vy: (rand() - 0.5) * DRIFT,
        r: 0.7 + rand() * 1.5,
      }));
    }

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);

      // Proximity edges first so nodes sit on top of their own links.
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.hypot(dx, dy);
          if (dist > LINK_DISTANCE) continue;
          const strength = 1 - dist / LINK_DISTANCE;
          ctx.globalAlpha = strength * 0.14;
          ctx.strokeStyle = accent;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.stroke();
        }
      }

      for (const n of nodes) {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function step() {
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        // Wrap rather than bounce — bouncing reads as "trapped", wrapping reads
        // as a continuous field extending past the viewport.
        if (n.x < -10) n.x = width + 10;
        if (n.x > width + 10) n.x = -10;
        if (n.y < -10) n.y = height + 10;
        if (n.y > height + 10) n.y = -10;
      }
      draw();
      raf = requestAnimationFrame(step);
    }

    let raf = 0;
    resize();
    seedNodes();

    if (reduced) {
      draw();
    } else {
      raf = requestAnimationFrame(step);
    }

    const onResize = () => {
      resize();
      seedNodes();
      if (reduced) draw();
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [accent]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
