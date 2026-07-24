import type { Metadata } from "next";
import localFont from "next/font/local";
import dynamic from "next/dynamic";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { PortalProvider } from "@/lib/portalStore";
import { ToastProvider } from "@/components/ui/Toast";
import { FeatureProvider } from "@/lib/features/client";
import { featuresForCurrentUser, activePreset } from "@/lib/features/server";
import { IS_DEMO, UI_SKIN } from "@/lib/config";
import { currentPrincipal } from "@/lib/auth/principal";
import type { AccessProfile } from "@/lib/authz/profiles";
import type { PortalId } from "@/lib/portals";

const DemoStoreProvider = dynamic(
  () =>
    import("@/components/demo/DemoStoreProvider").then(
      (module) => module.DemoStoreProvider,
    ),
);

function portalForProfile(profile: AccessProfile | null | undefined): PortalId | null {
  switch (profile) {
    case "provider":
    case "nursing":
      return "clinic";
    case "coach":
      return "coach";
    case "front-desk":
      return "desk";
    case "owner":
    case "system-admin":
    case "executive":
    case "operations":
    case "billing":
    case "fulfillment":
    case "marketing":
      return "exec";
    default:
      return null;
  }
}

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
    "Apex is Alpha Health's clinic operating system for coordinated coaching, medical care, scheduling, fulfillment, and member operations.",
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
  const [features, principal] = await Promise.all([
    featuresForCurrentUser(),
    IS_DEMO ? Promise.resolve(null) : currentPrincipal(),
  ]);
  const preset = activePreset();
  const lightSkin = UI_SKIN === "v1-light";

  return (
    <html
      lang="en"
      /**
       * `data-skin` selects the palette independently from the feature preset.
       * Alpha staff use the dark Alpha OS theme, so the shared environment is
       * dark even when an owner later subtracts an individual feature.
       *
       * The legacy light skin remains available for deliberate comparison and
       * accessibility testing, but changing features can no longer select it.
       */
      data-skin={lightSkin ? "v1" : "apex"}
      className={`${lightSkin ? "" : "dark"} ${sans.variable} ${display.variable} ${mono.variable}`}
    >
      <body>
        <FeatureProvider value={features} preset={preset}>
          {IS_DEMO ? (
            <DemoStoreProvider>
              <PortalProvider defaultPortalId={portalForProfile(principal?.accessProfile)}>
                <ToastProvider>
                  <AppShell>{children}</AppShell>
                </ToastProvider>
              </PortalProvider>
            </DemoStoreProvider>
          ) : (
            <PortalProvider defaultPortalId={portalForProfile(principal?.accessProfile)}>
              <ToastProvider>
                <AppShell>{children}</AppShell>
              </ToastProvider>
            </PortalProvider>
          )}
        </FeatureProvider>
      </body>
    </html>
  );
}
