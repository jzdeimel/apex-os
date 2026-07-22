import type { Config } from "tailwindcss";

/**
 * Apex design system — "luxury clinical operating system".
 *
 * Brand cues:
 *  - Deep black / charcoal canvas with hairline borders.
 *  - A single restrained gold accent (Alpha) for emphasis + actions.
 *  - Clinical status semantics (optimal / watch / low / high) as their own scale.
 *  - Mono figures for every biomarker value, dose-free protocol code, and stat.
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Charcoal / ink canvas
        /**
         * The ink scale is SEMANTIC BY POSITION, not by lightness.
         *
         * 950 is always the page canvas, 850 always a card, 700 always a
         * hairline, 100 always body text. Under the V1 skin those resolve to
         * light values (see app/globals.css) — so `bg-ink-950` still means "the
         * canvas" and every existing class reskins for free. Read the numbers
         * as depth, not brightness.
         *
         * RGB channels, not hex, because the codebase leans on opacity
         * modifiers (`bg-ink-850/80`, `border-ink-700/70`) and those only work
         * when Tailwind can compose the alpha itself.
         */
        ink: {
          50: "rgb(var(--ink-50) / <alpha-value>)",
          100: "rgb(var(--ink-100) / <alpha-value>)",
          200: "rgb(var(--ink-200) / <alpha-value>)",
          300: "rgb(var(--ink-300) / <alpha-value>)",
          400: "rgb(var(--ink-400) / <alpha-value>)",
          500: "rgb(var(--ink-500) / <alpha-value>)",
          600: "rgb(var(--ink-600) / <alpha-value>)",
          700: "rgb(var(--ink-700) / <alpha-value>)",
          800: "rgb(var(--ink-800) / <alpha-value>)",
          850: "rgb(var(--ink-850) / <alpha-value>)",
          900: "rgb(var(--ink-900) / <alpha-value>)",
          950: "rgb(var(--ink-950) / <alpha-value>)",
        },
        // Alpha brand red (matches alphamaleraleigh.com: #e93d3d / #bf1e2e).
        // Token is named `gold` for historical reasons; values are the ALPHA
        // HEALTH BRAND RED. Anchored on the exact logo red #b81828 (600) and the
        // dark-surface-legible lift #ec3d50 (400) — the same two values the
        // production AlphaOS brand uses — so the crimson hue matches the real
        // logo rather than the previous orange-shifted red (#e93d3d).
        gold: {
          50: "rgb(var(--brand-50) / <alpha-value>)",
          100: "rgb(var(--brand-100) / <alpha-value>)",
          200: "rgb(var(--brand-200) / <alpha-value>)",
          300: "rgb(var(--brand-300) / <alpha-value>)",
          400: "rgb(var(--brand-400) / <alpha-value>)",
          500: "rgb(var(--brand-500) / <alpha-value>)",
          600: "rgb(var(--brand-600) / <alpha-value>)",
          700: "rgb(var(--brand-700) / <alpha-value>)",
          800: "rgb(var(--brand-800) / <alpha-value>)",
          900: "rgb(var(--brand-900) / <alpha-value>)",
          950: "rgb(var(--brand-950) / <alpha-value>)",
        },
        // Clinical status semantics
        optimal: "rgb(var(--status-optimal) / <alpha-value>)",
        watch: "rgb(var(--status-watch) / <alpha-value>)",
        low: "rgb(var(--status-low) / <alpha-value>)",
        high: "rgb(var(--status-high) / <alpha-value>)",
        /** The sidebar rail — dark in BOTH skins. That is V1's design, not a
         *  compromise: a #16181c rail against a #f7f7f8 page is the most
         *  recognisable thing about the app a coach opens every morning. */
        rail: {
          DEFAULT: "rgb(var(--rail-bg) / <alpha-value>)",
          border: "rgb(var(--rail-border) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      letterSpacing: {
        tightest: "-0.04em",
      },

      /**
       * THE TYPE SCALE.
       *
       * An audit found 14 distinct sizes in use, seven of them arbitrary
       * one-offs (text-[9px] through text-[15px]), and 1,578 uses of small text
       * against 96 uses of large. Hierarchy was being attempted with one-pixel
       * increments — 11 against 12 against 13 — which does not read as hierarchy
       * at all. It reads as mush, and it is the clearest fingerprint of an
       * interface that was generated rather than designed.
       *
       * Six steps, wide gaps. The distance between `body` and `display` is what
       * creates hierarchy; small increments never will. Body sits at 15px rather
       * than the Tailwind default 14 because the extra pixel is most of what
       * separates an interface that feels considered from one that feels cheap.
       *
       * Named rather than numbered so a size cannot be picked by feel.
       */
      fontSize: {
        display: ["2.5rem", { lineHeight: "1.05", letterSpacing: "-0.02em", fontWeight: "600" }],
        title: ["1.5rem", { lineHeight: "1.2", letterSpacing: "-0.015em", fontWeight: "600" }],
        heading: ["1.0625rem", { lineHeight: "1.35", letterSpacing: "-0.01em", fontWeight: "600" }],
        body: ["0.9375rem", { lineHeight: "1.6" }],
        detail: ["0.8125rem", { lineHeight: "1.5" }],
        micro: ["0.6875rem", { lineHeight: "1.45", letterSpacing: "0.04em" }],
      },

      /**
       * THREE RADII, and a rule for each.
       *
       * The audit found seven in use with nothing governing which went where.
       * `control` is anything a finger acts on, `panel` is anything that holds
       * content, and `full` is reserved for avatars and true status dots.
       *
       * Text pills were the worst of it: 199 `rounded-full` elements meant every
       * noun on screen had become a chip. A capsule around a word is a stadium,
       * and stadiums everywhere is the house style of generated dashboards.
       */
      borderRadius: {
        control: "0.5rem",
        panel: "1rem",
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.4), 0 12px 32px -12px rgba(0,0,0,0.6)",
        glow: "0 0 0 1px rgba(233,61,61,0.18), 0 16px 48px -16px rgba(233,61,61,0.30)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        /**
         * Ends on the visible frame, always. See the `page-in` animation note.
         *
         * The final keyframe is `transform: none`, NOT `translateY(0)`, and the
         * difference is not cosmetic. With `fill-mode: both` the last keyframe
         * keeps applying forever, and an element with ANY transform becomes the
         * containing block for its `position: fixed` descendants. Ending on
         * translateY(0) therefore left every modal, overlay and toast inside the
         * page scoped to the page rather than the viewport — one measured at
         * 7580px tall, centring its content three thousand pixels below the fold
         * where nobody would ever see it.
         *
         * `transform: none` produces the same visual result and creates no
         * containing block.
         */
        "page-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "none" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.4s cubic-bezier(0.22,1,0.36,1) both",
        "fade-in": "fade-in 0.5s ease both",
        "pulse-soft": "pulse-soft 2.2s ease-in-out infinite",
        /**
         * Route transition. Deliberately CSS rather than framer-motion.
         *
         * This replaced an `<AnimatePresence mode="wait">` that wrapped the App
         * Router's `children` slot. Because that slot is a single mutable node,
         * the retained exiting element ended up rendering the INCOMING page and
         * animating it to opacity 0, where it stayed — a blank screen on roughly
         * half of all client-side navigations, with the content present in the
         * DOM the whole time.
         *
         * A CSS animation cannot wedge that way: it always runs to completion,
         * and it ends on the visible frame. The transition only ever moves the
         * element TOWARDS visible, never away from it.
         */
        /*
         * NOTE the absent `both`. Fill-mode is deliberately left at `none`.
         *
         * With a fill mode, the final keyframe keeps applying after the
         * animation ends — and even `transform: none` interpolates to an
         * IDENTITY MATRIX, which still makes the element a containing block for
         * its `position: fixed` descendants. That silently scoped every overlay
         * in the app to the page instead of the viewport: one measured 7580px
         * tall and centred its dialog 3,800px below the fold.
         *
         * Without a fill mode the element returns to its base style once the
         * 0.34s is up, leaving no transform and no containing block. It also
         * fails open, which is the rule for this animation: the resting style is
         * already visible, so if the animation never runs the content still
         * shows.
         */
        "page-in": "page-in 0.34s cubic-bezier(0.22,1,0.36,1)",
      },
    },
  },
  plugins: [],
};

export default config;
