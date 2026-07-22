import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { StoreProvider } from "@/lib/store";
import { PortalProvider } from "@/lib/portalStore";
import { ToastProvider } from "@/components/ui/Toast";
import { FeatureProvider } from "@/lib/features/client";
import { featuresForCurrentUser, activePreset } from "@/lib/features/server";

/**
 * Fonts are VENDORED (app/fonts/*.woff2), loaded via next/font/local — not
 * fetched from Google at build time.
 *
 * The old next/font/google import reached fonts.googleapis.com during `next
 * build`, so any CI or ACR network hiccup failed the deploy, and a healthcare
 * build pipeline made a third-party call it did not need to. These are the
 * latin-subset variable woff2s for the same three families (Inter, Space
 * Grotesk, JetBrains Mono), so the type is byte-identical and the build is
 * hermetic.
 */
const sans = localFont({
  src: "./fonts/inter.woff2",
  weight: "100 900",
  variable: "--font-sans",
  display: "swap",
});
// Display face: Bricolage Grotesque — a characterful variable grotesque with
// real personality (contrasty strokes, distinctive a/g), so headings read as a
// DIFFERENT voice from the Inter body rather than "uniform". Vendored like the
// rest; the old Space Grotesk was too close to Inter to create hierarchy.
const display = localFont({
  src: "./fonts/bricolage-grotesque.woff2",
  weight: "300 800",
  variable: "--font-display",
  display: "swap",
});
const mono = localFont({
  src: "./fonts/jetbrains-mono.woff2",
  weight: "100 800",
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Apex — Clinic Operating System",
  description:
    "Apex is the operating system for Alpha Health — hormone, peptide, medical weight loss, diagnostics & wellness. Demo only. Not medical advice.",
};

/**
 * Async because feature resolution is a server read.
 *
 * This makes every route dynamic, which is the correct outcome rather than a
 * cost: Apex sits behind EasyAuth and renders per-identity content on every
 * surface, so a statically generated page was never servable anyway. Resolving
 * features here — once, at the root — means the whole client tree can render
 * honestly without each page fetching its own answer.
 */
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const features = await featuresForCurrentUser();
  const preset = activePreset();

  return (
    <html
      lang="en"
      /**
       * `data-skin` selects the palette. Under the `clinic-v1` release preset
       * Apex wears Alpha OS V1's look — light canvas, dark rail, V1's status
       * colours — so the Aug 7 cutover does not also ask coaches to relearn
       * what the software looks like. See app/globals.css.
       *
       * The `dark` class stays bound to the Apex-native skin only. It was
       * previously hardcoded, which is what made the palette unswappable.
       */
      data-skin={preset === "clinic-v1" ? "v1" : "apex"}
      className={`${preset === "clinic-v1" ? "" : "dark"} ${sans.variable} ${display.variable} ${mono.variable}`}
    >
      <body>
        <FeatureProvider value={features} preset={preset}>
          <StoreProvider>
            <PortalProvider>
              <ToastProvider>
                <AppShell>{children}</AppShell>
              </ToastProvider>
            </PortalProvider>
          </StoreProvider>
        </FeatureProvider>
      </body>
    </html>
  );
}
