import type { Metadata, Viewport } from "next";
import { AgeNotice } from "@/components/AgeNotice";
import { siteUrl } from "@/lib/env";
import "./globals.css";

// Validated and guaranteed parseable - see src/lib/env.ts.
const site = siteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: {
    default: "Pour Finder — cheap beer near you",
    template: "%s · Pour Finder",
  },
  description:
    "Find cheap beer deals at bars, restaurants and breweries near you. Community-reported prices with verification dates, so you know how fresh the info is.",
  applicationName: "Pour Finder",
  openGraph: {
    type: "website",
    siteName: "Pour Finder",
    title: "Pour Finder — cheap beer near you",
    description: "Community-reported cheap beer deals, with verification dates you can trust.",
    url: site,
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#faf6ef",
  width: "device-width",
  initialScale: 1,
  // Never block zoom: pinch-to-zoom is an accessibility requirement, and this
  // app is used one-handed in dark bars.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col">
        <a href="#results" className="skip-link">
          Skip to results
        </a>
        <AgeNotice />
        <div className="min-h-0 flex-1">{children}</div>
      </body>
    </html>
  );
}
