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
      borderRadius: {
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
