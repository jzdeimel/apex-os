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
  /**
   * `postgres` is required at runtime from node_modules, never bundled.
   *
   * A native TCP driver cannot be compiled into an Edge bundle — there is no
   * `net` and no `crypto` there. This also documents why instrumentation.ts was
   * removed: Next evaluates that file for BOTH runtimes, so the import chain
   * instrumentation -> migrate -> client -> postgres dragged the driver into the
   * Edge build and failed with "Module not found: Can't resolve 'crypto'". The
   * NEXT_RUNTIME guard inside the file is a runtime check and does not stop
   * static analysis, so no amount of dynamic-importing fixed it.
   *
   * Migrations now run lazily on first database use instead. See lib/db/client.ts.
   */
  serverExternalPackages: ["postgres"],

  /**
   * Build output directory.
   *
   * Overridable so a dev server can be run for diagnosis WITHOUT clobbering the
   * production standalone build sitting in .next — running `next dev` against
   * the default directory silently replaces it, and the next attempt to serve
   * the real build fails with a missing server.js.
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",

  /**
   * Security headers.
   *
   * Table stakes for a HIPAA-adjacent app behind Entra, and the first thing a
   * client's security reviewer greps for. HSTS forces TLS; DENY framing blocks
   * clickjacking; nosniff stops MIME confusion; a strict referrer policy keeps
   * PHI-bearing URLs out of third-party referers. The CSP is intentionally
   * report-only to start (it observes and reports violations without breaking
   * anything) because the app inlines some styles/scripts that a strict
   * enforcing policy would need to be tuned against first.
   */
  async headers() {
    const csp = [
      "default-src 'self'",
      // Next injects inline bootstrap scripts; 'unsafe-inline' stays until we
      // move to nonces. Report-only, so this observes rather than blocks.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.communication.azure.com https://*.azurecomm.net",
      "media-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
          { key: "Content-Security-Policy-Report-Only", value: csp },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
