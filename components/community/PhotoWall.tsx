"use client";

/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { ImagePlus, X, Loader2, Trash2 } from "lucide-react";
import { Card, CardContent, Badge, Button } from "@/components/ui/primitives";
import { Stagger, StaggerItem } from "@/components/motion";
import { useToast } from "@/components/ui/Toast";
import { KudosButton } from "@/components/community/KudosButton";
import { usePhotos, CATEGORY_LABEL, type PhotoCategory } from "@/lib/community/photos";
import { relativeDays } from "@/lib/utils";

/**
 * The photo wall.
 *
 * The upload is real: the member picks a photo from their device, it is
 * downscaled in the browser (max 1000px, JPEG) so it fits in localStorage and no
 * full-resolution copy is kept, and it shows immediately with their handle and
 * caption. This is the surface that makes the community feel like people rather
 * than a leaderboard.
 */

const MAX_DIM = 1000;

/** Read a File, downscale it on a canvas, return a JPEG data URL. */
function downscale(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no canvas"));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("could not read image"));
    };
    img.src = url;
  });
}

const CATEGORIES: PhotoCategory[] = ["progress", "meal", "training", "event", "other"];

export function PhotoWall({
  clientId,
  actorId = clientId,
  actorHandle,
}: {
  clientId: string;
  actorId?: string;
  actorHandle?: string;
}) {
  const { toast } = useToast();
  const { posts, hydrated, addPhoto, removePhoto } = usePhotos(clientId);
  const fileRef = useRef<HTMLInputElement>(null);

  const [pending, setPending] = useState<string | null>(null); // downscaled data URL awaiting caption
  const [busy, setBusy] = useState(false);
  const [caption, setCaption] = useState("");
  const [category, setCategory] = useState<PhotoCategory>("progress");

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("That's not an image", { tone: "warn" });
      return;
    }
    setBusy(true);
    try {
      const src = await downscale(file);
      setPending(src);
    } catch {
      toast("Couldn't read that photo", { tone: "warn" });
    } finally {
      setBusy(false);
    }
  }

  function post() {
    if (!pending) return;
    addPhoto({ src: pending, caption: caption.trim() || "Shared a photo", category, actorId, actorHandle });
    setPending(null);
    setCaption("");
    setCategory("progress");
    toast("Posted to the wall", { desc: "Everyone in the community can see it" });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-body leading-relaxed text-ink-400">
          Progress shots, meal prep, the trail from Saturday&apos;s hike. Real photos from real people
          doing the work. You post as {actorHandle ?? "your handle"}.
        </p>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
        <Button variant="primary" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          Share a photo
        </Button>
      </div>

      {/* Compose: after a photo is picked + downscaled, caption + category it. */}
      {pending && (
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="relative sm:w-56">
                <img src={pending} alt="Your photo" className="w-full rounded-control object-cover" />
                <button
                  type="button"
                  onClick={() => setPending(null)}
                  className="focus-ring absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-ink-950/70 text-ink-200 hover:text-white"
                  aria-label="Discard"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(c)}
                      className={
                        "rounded-control border px-2.5 py-1 text-micro transition-colors " +
                        (category === c ? "border-gold-400/50 bg-gold-400/10 text-gold-200" : "border-ink-700 text-ink-400 hover:text-ink-100")
                      }
                    >
                      {CATEGORY_LABEL[c]}
                    </button>
                  ))}
                </div>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={3}
                  placeholder="Say something about it…"
                  className="w-full rounded-control border border-ink-700 bg-ink-900/70 px-3 py-2 text-detail text-ink-100 focus-ring"
                />
                <div className="flex justify-end">
                  <Button variant="primary" onClick={post}>Post to the wall</Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!hydrated ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[4/3] animate-pulse rounded-panel bg-ink-900/40" />
          ))}
        </div>
      ) : (
        <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((p) => (
            <StaggerItem key={p.id}>
              <motion.div layout>
                <Card className="overflow-hidden">
                  <img src={p.src} alt={p.caption} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                  <CardContent className="space-y-2 p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-detail">
                        <span className="font-medium text-ink-50">{p.clientId === actorId ? "You" : p.handle}</span>
                        <Badge tone="neutral">{CATEGORY_LABEL[p.category]}</Badge>
                      </span>
                      <span className="text-micro text-ink-600">{relativeDays(p.postedAt)}</span>
                    </div>
                    <p className="text-detail leading-relaxed text-ink-300">{p.caption}</p>
                    <div className="flex items-center justify-between pt-1">
                      <KudosButton itemId={p.id} />
                      {p.clientId === actorId && !p.seeded && (
                        <button
                          type="button"
                          onClick={() => removePhoto(p.id)}
                          className="focus-ring inline-flex items-center gap-1 text-micro text-ink-600 hover:text-high"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Remove
                        </button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </StaggerItem>
          ))}
        </Stagger>
      )}

      <p className="text-micro leading-relaxed text-ink-600">
        Demo build: photos stay in this browser and are downscaled on your device — nothing is
        uploaded to a server. In production these live in private, access-controlled storage.
      </p>
    </div>
  );
}
