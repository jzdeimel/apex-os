/* eslint-disable @next/next/no-img-element */
/**
 * The real Alpha Health brand marks.
 *
 * Two forms:
 *  - <AlphaMark/> — the inline-SVG icon (the red rounded square with the white
 *    "A"). Vector, so it scales crisply anywhere and needs no network request;
 *    this is the same geometry as app/icon.svg (the favicon), kept in code so it
 *    can inherit sizing and sit inline with text.
 *  - <AlphaLogo/> — the full horizontal wordmark lockup, from the actual brand
 *    PNGs shipped in /public/brand. apex is dark-first, so it defaults to the
 *    white-text lockup; pass `onLight` for the black-text lockup on a light
 *    surface.
 *
 * These replace the old text-only "Apex / Alpha Health" wordmark. The clinic's
 * real logo, not a stand-in.
 */

/** Intrinsic pixel dimensions of the source PNGs (lock the aspect ratio). */
const FULL = { w: 5625, h: 703 }; // ~8:1 horizontal lockup
const MARK_PNG = { w: 690, h: 406 };

export function AlphaMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Alpha Health"
      className={className}
    >
      <rect width="64" height="64" rx="14" fill="#b81828" />
      <path
        d="M15 49 L32 14 L49 49"
        fill="none"
        stroke="#ffffff"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M22.5 38 H41.5" fill="none" stroke="#ffffff" strokeWidth="7" strokeLinecap="round" />
    </svg>
  );
}

export function AlphaLogo({
  height = 30,
  onLight = false,
  className = "",
}: {
  height?: number;
  onLight?: boolean;
  className?: string;
}) {
  const src = onLight ? "/brand/alpha-health-logo-red-black.png" : "/brand/alpha-health-logo-red-white.png";
  return (
    <img
      src={src}
      width={FULL.w}
      height={FULL.h}
      style={{ height, width: "auto" }}
      className={className}
      alt="Alpha Health"
      decoding="async"
    />
  );
}

/** The square icon-crop lockup PNG, when a chunkier mark than the SVG is wanted. */
export function AlphaMarkImage({
  height = 32,
  onLight = false,
  className = "",
}: {
  height?: number;
  onLight?: boolean;
  className?: string;
}) {
  const src = onLight ? "/brand/alpha-mark-red-black.png" : "/brand/alpha-mark-red-white.png";
  return (
    <img
      src={src}
      width={MARK_PNG.w}
      height={MARK_PNG.h}
      style={{ height, width: "auto" }}
      className={className}
      alt="Alpha Health"
      decoding="async"
    />
  );
}
