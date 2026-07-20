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
        ink: {
          50: "#f5f6f7",
          100: "#e7e9ec",
          200: "#c9ced4",
          300: "#a3abb5",
          400: "#7a838f",
          500: "#5d646f",
          600: "#474e58",
          700: "#23272d",
          800: "#17191e",
          850: "#121419",
          900: "#0d0f12",
          950: "#070809",
        },
        // Alpha brand red (matches alphamaleraleigh.com: #e93d3d / #bf1e2e).
        // Token is named `gold` for historical reasons; values are the brand red.
        gold: {
          50: "#fdeaea",
          100: "#fbd5d5",
          200: "#f6aaaa",
          300: "#f17d7d",
          400: "#e93d3d",
          500: "#d92b2b",
          600: "#bf1e2e",
          700: "#9e1824",
          800: "#82141d",
          900: "#6b1318",
          950: "#3d0a0d",
        },
        // Clinical status semantics
        optimal: "#34d399",
        watch: "#e0bd6e",
        low: "#60a5fa",
        high: "#f87171",
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
        // Ends on the visible frame, always. See the `page-in` animation note.
        "page-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
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
        "page-in": "page-in 0.34s cubic-bezier(0.22,1,0.36,1) both",
      },
    },
  },
  plugins: [],
};

export default config;
