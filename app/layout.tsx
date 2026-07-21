import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { StoreProvider } from "@/lib/store";
import { PortalProvider } from "@/lib/portalStore";
import { ToastProvider } from "@/components/ui/Toast";

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`dark ${sans.variable} ${display.variable} ${mono.variable}`}
    >
      <body>
        <StoreProvider>
          <PortalProvider>
            <ToastProvider>
              <AppShell>{children}</AppShell>
            </ToastProvider>
          </PortalProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
