/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /**
   * Standalone output for the container image.
   *
   * Next traces the exact files the server needs and emits a self-contained
   * `.next/standalone` tree, so the runtime image ships without node_modules.
   * On an app this size that is the difference between a ~1.2GB image and one
   * nearer 200MB — which is also the difference between a fast revision swap
   * and watching a deploy crawl.
   */
  output: "standalone",

  /**
   * Required for instrumentation.ts to run at all on Next 14.
   *
   * Without it the hook is silently ignored — no warning, no error, the file
   * simply never executes. That is how migrations "ran" against a configured
   * database and left it empty while /api/health reported ok.
   */
  experimental: {
    instrumentationHook: true,
  },

  /**
   * Build output directory.
   *
   * Overridable so a dev server can be run for diagnosis WITHOUT clobbering the
   * production standalone build sitting in .next — running `next dev` against
   * the default directory silently replaces it, and the next attempt to serve
   * the real build fails with a missing server.js.
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

module.exports = nextConfig;
