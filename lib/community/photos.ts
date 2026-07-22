"use client";

import { useCallback, useEffect, useState } from "react";
import { handleFor } from "@/lib/mock/community";
import { seededRandom, absolute } from "@/lib/utils";

/**
 * The photo wall — real photo sharing.
 *
 * A feed of numbers is a dashboard; a feed of photos is a community. This lets a
 * member post an actual image from their phone — a progress shot, Sunday meal
 * prep, the trail from a group hike — with a caption, and see it appear
 * immediately. The upload is REAL: the file is read on-device, downscaled in the
 * browser (so localStorage stays small and no full-resolution image is kept),
 * and stored. Nothing is transmitted — like everything else at this stage it is
 * device-local — but the member genuinely picks a photo and it genuinely shows.
 *
 * HONESTY ABOUT THE SEED
 * ----------------------
 * The demo seeds a few community posts so the wall is not empty, but it does NOT
 * fabricate before/after progress photos of people who do not exist — that would
 * be both dishonest and unsettling. Seeded posts are abstract, category-tinted
 * tiles (meal prep, a trail, a lift) that read as "someone shared something",
 * with the real magic being the member's own upload. Everything is handle-based.
 */

const KEY = "apex_photos_v1";
const NOW = "2026-06-12T09:00:00";
const NOW_MS = absolute(NOW).getTime();
const DAY = 86_400_000;

export type PhotoCategory = "progress" | "meal" | "training" | "event" | "other";

export interface PhotoPost {
  id: string;
  clientId: string;
  handle: string;
  /** Data URL — either the member's downscaled upload, or a seeded SVG tile. */
  src: string;
  caption: string;
  category: PhotoCategory;
  postedAt: string;
  /** True for the demo seeds, so the UI can label them honestly if it wants. */
  seeded?: boolean;
}

export const CATEGORY_LABEL: Record<PhotoCategory, string> = {
  progress: "Progress",
  meal: "Meal prep",
  training: "Training",
  event: "Event",
  other: "Life",
};

/* -------------------------------------------------------------------------- */
/* Seeded posts (abstract, no fabricated people)                               */
/* -------------------------------------------------------------------------- */

const CAT_HUES: Record<PhotoCategory, [string, string]> = {
  progress: ["#b81828", "#3d0a0d"],
  meal: ["#1a7f4e", "#0c2f1e"],
  training: ["var(--c-watch)", "#3a2e13"],
  event: ["#3b82f6", "#0e1e3a"],
  other: ["#7a838f", "#1a1d22"],
};

/** A deterministic gradient tile as an SVG data URI — a placeholder, honestly. */
function tile(category: PhotoCategory, seed: string): string {
  const [a, b] = CAT_HUES[category];
  const rand = seededRandom(seed);
  const angle = Math.floor(rand() * 360);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'>
    <defs><linearGradient id='g' gradientTransform='rotate(${angle})'>
      <stop offset='0%' stop-color='${a}'/><stop offset='100%' stop-color='${b}'/>
    </linearGradient></defs>
    <rect width='400' height='300' fill='url(#g)'/>
    <text x='20' y='280' fill='rgba(255,255,255,0.5)' font-family='sans-serif' font-size='16'>${CATEGORY_LABEL[category]}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const SEED_POSTS: { handleClient: string; category: PhotoCategory; caption: string; daysAgo: number }[] = [
  { handleClient: "c-002", category: "meal", caption: "Sunday prep done — chicken, rice, done thinking about food till Wednesday.", daysAgo: 2 },
  { handleClient: "c-004", category: "training", caption: "5am club. Nobody's here to see it but me and the bar.", daysAgo: 3 },
  { handleClient: "c-006", category: "event", caption: "Crew after the Saturday hike. Legs cooked, worth it.", daysAgo: 5 },
  { handleClient: "c-009", category: "progress", caption: "Same shirt, 90 days apart. Numbers on the scale don't tell the whole story.", daysAgo: 8 },
  { handleClient: "c-013", category: "meal", caption: "Trying the high-protein overnight oats the group swears by.", daysAgo: 11 },
];

function seededPosts(): PhotoPost[] {
  return SEED_POSTS.map((s, i) => ({
    id: `photo-seed-${i}`,
    clientId: s.handleClient,
    handle: handleFor(s.handleClient),
    src: tile(s.category, `${s.handleClient}-${i}`),
    caption: s.caption,
    category: s.category,
    postedAt: absolute(NOW_MS - s.daysAgo * DAY).toISOString(),
    seeded: true,
  }));
}

/* -------------------------------------------------------------------------- */
/* Store                                                                       */
/* -------------------------------------------------------------------------- */

function readMine(): PhotoPost[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as PhotoPost[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeMine(posts: PhotoPost[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(posts));
    window.dispatchEvent(new Event("apex-photos"));
  } catch {
    /* quota — likely too many/large images. The UI warns and drops the oldest. */
  }
}

export interface NewPhoto {
  src: string; // downscaled data URL from the component
  caption: string;
  category: PhotoCategory;
  actorId?: string;
  actorHandle?: string;
}

export function usePhotos(clientId: string) {
  const [mine, setMine] = useState<PhotoPost[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const sync = () => {
      setMine(readMine());
      setHydrated(true);
    };
    sync();
    window.addEventListener("apex-photos", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("apex-photos", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const posts = [...mine, ...seededPosts()].sort((a, b) => b.postedAt.localeCompare(a.postedAt));

  const addPhoto = useCallback(
    (input: NewPhoto) => {
      const cur = readMine();
      const post: PhotoPost = {
        id: `photo-${cur.length + 1}-${Math.abs(hashStr(input.caption + input.src.slice(0, 40))) % 100000}`,
        clientId: input.actorId ?? clientId,
        handle: input.actorHandle ?? handleFor(clientId),
        src: input.src,
        caption: input.caption,
        category: input.category,
        postedAt: absolute(NOW).toISOString(),
      };
      // Keep the most recent 12 of the member's own uploads — localStorage has a
      // few-MB ceiling and downscaled images are ~50–150KB each.
      const next = [post, ...cur].slice(0, 12);
      writeMine(next);
      return post;
    },
    [clientId],
  );

  const removePhoto = useCallback((id: string) => {
    writeMine(readMine().filter((p) => p.id !== id));
  }, []);

  return { posts, mine, hydrated, addPhoto, removePhoto };
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
