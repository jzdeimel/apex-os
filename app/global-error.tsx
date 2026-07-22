"use client";

import { useEffect } from "react";

/**
 * Root error boundary. This fires when the error is in the root layout itself,
 * so it REPLACES <html>/<body> and cannot assume the app's stylesheet loaded —
 * hence the inline styles. Deliberately minimal and self-contained: a dark card,
 * the mark drawn inline (no imports that might also be failing), and one action.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[apex] root error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#070809",
          color: "var(--chart-tooltip-text)",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 460, textAlign: "center" }}>
          <svg width="44" height="44" viewBox="0 0 64 64" role="img" aria-label="Alpha Health" style={{ margin: "0 auto" }}>
            <rect width="64" height="64" rx="14" fill="#b81828" />
            <path d="M15 49 L32 14 L49 49" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M22.5 38 H41.5" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" />
          </svg>
          <h1 style={{ marginTop: 20, fontSize: 22, fontWeight: 600 }}>Apex hit an unexpected error</h1>
          <p style={{ marginTop: 8, color: "#7a838f", lineHeight: 1.6, fontSize: 14 }}>
            The application ran into a problem loading. Reloading usually clears it. If it keeps
            happening, let the team know{error?.digest ? ` and quote ${error.digest}` : ""}.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 24,
              padding: "10px 20px",
              borderRadius: 10,
              border: "none",
              background: "#b81828",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
