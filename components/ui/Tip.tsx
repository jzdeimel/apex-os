"use client";

/**
 * Tip — the shared tooltip primitive.
 *
 * Written phone-first, because the screen where a member most needs a
 * definition is the one where they are reading their own lab results at
 * 11pm on a 390px phone. A tooltip that only opens on `:hover` is not a
 * degraded experience there — it is an invisible one.
 *
 * The four things that make this different from a CSS-only tooltip:
 *
 *  1. THREE INPUTS. Mouse hover, keyboard focus, and tap all open it. Hover is
 *     gated on `pointerType === "mouse"` because touch browsers synthesise a
 *     pointerenter immediately before the click — without the gate, a tap
 *     opens on enter and then instantly closes on click, and the tooltip
 *     "doesn't work" in a way that is very hard to see in a desktop browser.
 *  2. FIXED POSITIONING IN A PORTAL. Positioned from the trigger's viewport
 *     rect and clamped to the viewport with a hard gutter, so it can never
 *     push the document wide. An absolutely-positioned tooltip inside a card
 *     is the single most common cause of horizontal scroll on mobile, and at
 *     390px a 260px panel next to a right-aligned trigger overflows every time.
 *  3. FLIPS. Below by default; above when there isn't room below.
 *  4. NO FOCUS TRAP. Focus never moves into the panel — the panel is
 *     descriptive text, not a dialog. Tabbing away closes it and moves on,
 *     which is what a screen-reader or keyboard user expects from something
 *     wired up with aria-describedby.
 */

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/** Viewport gutter, px. The panel is never allowed closer than this to an edge. */
const GUTTER = 12;
/** Gap between trigger and panel, px. */
const OFFSET = 8;
/** Panel max width. Fits inside 390 − 2×GUTTER with room to spare. */
const MAX_W = 300;

/**
 * useLayoutEffect warns during server rendering, and this is a client component
 * that Next still renders on the server. Falling back to useEffect there is the
 * standard shim — the layout pass only ever matters in the browser anyway.
 */
const useIsoLayoutEffect = typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

interface Pos {
  left: number;
  top: number;
  width: number;
  placement: "top" | "bottom";
}

export function Tip({
  content,
  children,
  label,
  className,
}: {
  /** The tooltip body. Rich content is fine — it is not announced as a dialog. */
  content: React.ReactNode;
  /** The trigger. Must be focusable, or supply your own focusable element. */
  children: React.ReactNode;
  /**
   * Screen-reader label for the trigger affordance itself, e.g.
   * "What SHBG means". Optional: when the trigger already reads sensibly on
   * its own, adding a label just makes it read twice.
   */
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<Pos | null>(null);
  const [mounted, setMounted] = React.useState(false);

  const triggerRef = React.useRef<HTMLSpanElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const id = React.useId();
  const panelId = `tip-${id}`;

  // Portals need a document. Render nothing on the server pass.
  React.useEffect(() => setMounted(true), []);

  /**
   * Measure and clamp. Runs on open and on any scroll/resize while open —
   * a tooltip that stays put while the page moves under it is worse than one
   * that closes.
   */
  const place = React.useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const width = Math.min(MAX_W, vw - GUTTER * 2);

    // Centre on the trigger, then clamp both edges into the viewport. The
    // clamp is what guarantees no horizontal overflow at any width.
    const centred = r.left + r.width / 2 - width / 2;
    const left = Math.max(GUTTER, Math.min(centred, vw - GUTTER - width));

    // Flip: prefer below, go above when the measured panel would not fit.
    // Falls back to a conservative estimate on the first frame, before the
    // panel has been laid out.
    const panelH = panelRef.current?.offsetHeight ?? 120;
    const roomBelow = vh - r.bottom - OFFSET - GUTTER;
    const roomAbove = r.top - OFFSET - GUTTER;
    const placement: Pos["placement"] =
      roomBelow >= panelH || roomBelow >= roomAbove ? "bottom" : "top";

    const top =
      placement === "bottom" ? r.bottom + OFFSET : Math.max(GUTTER, r.top - OFFSET - panelH);

    setPos({ left, top, width, placement });
  }, []);

  // Position before paint so the panel never flashes at 0,0.
  useIsoLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open, place]);

  // Second pass once the panel has real height — the flip decision above uses
  // an estimate on frame one and this corrects it.
  React.useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, [open, place]);

  React.useEffect(() => {
    if (!open) return;

    const onScrollOrResize = () => place();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        // Escape should hand control back to where it came from, not leave
        // focus stranded on an element whose description just vanished.
        triggerRef.current?.querySelector("button")?.focus();
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    };

    // `capture` on scroll catches scrolling inside any ancestor container,
    // not just the window.
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open, place]);

  return (
    <>
      <span
        ref={triggerRef}
        className={cn("relative inline", className)}
        // Mouse only — see note 1 at the top of the file.
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") setOpen(true);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setOpen(false);
        }}
        onFocusCapture={() => setOpen(true)}
        onBlurCapture={(e) => {
          // Only close when focus actually leaves the trigger subtree.
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
        }}
        onClick={(e) => {
          // `detail === 0` means the click was synthesised by Enter/Space on a
          // focused trigger. Focus has already opened the tip, so toggling here
          // would close it the instant a keyboard user activated it.
          if (e.detail === 0) {
            setOpen(true);
            return;
          }
          setOpen((v) => !v);
        }}
      >
        {/* aria-describedby is applied via a wrapper attribute rather than
            cloned onto the child, so any trigger shape works. */}
        <span aria-describedby={open ? panelId : undefined} aria-label={label}>
          {children}
        </span>
      </span>

      {mounted && open
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              role="tooltip"
              style={{
                position: "fixed",
                left: pos?.left ?? -9999,
                top: pos?.top ?? -9999,
                width: pos?.width ?? MAX_W,
                // Hidden until measured — one frame, but a visible one.
                opacity: pos ? 1 : 0,
              }}
              className={cn(
                "z-[70] rounded-xl border border-ink-600/70 bg-ink-850 p-3.5 text-left shadow-2xl shadow-black/60",
                "text-[13px] leading-relaxed text-ink-200",
                // Animation is opt-in per user preference, never assumed.
                "transition-opacity duration-150 motion-reduce:transition-none",
              )}
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
