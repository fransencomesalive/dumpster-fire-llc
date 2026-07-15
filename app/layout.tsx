import type { Metadata } from "next";
import localFont from "next/font/local";
import LandingBackground from "./LandingBackground";
import QAFeedbackWidget from "./QAFeedbackWidget";
import "./globals.css";
import "./ds.css";

const gotham = localFont({
  src: [
    { path: "./scans/fonts/Gotham-Light.otf", weight: "300", style: "normal" },
    { path: "./scans/fonts/Gotham-Medium.otf", weight: "500", style: "normal" },
    { path: "./scans/fonts/Gotham-Bold.otf", weight: "700", style: "normal" },
    { path: "./scans/fonts/Gotham-Black.otf", weight: "900", style: "normal" },
  ],
  variable: "--font-gotham",
});

const bemio = localFont({
  src: [
    { path: "./fonts/Bemio.otf", weight: "400", style: "normal" },
    { path: "./fonts/Bemio-Italic.otf", weight: "400", style: "italic" },
  ],
  variable: "--font-bemio",
});

const bebas = localFont({
  src: [{ path: "./fonts/BebasNeue-Regular.woff2", weight: "400", style: "normal" }],
  variable: "--font-bebas",
});

const plantagenet = localFont({
  src: [{ path: "./fonts/PlantagenetCherokee.ttf", weight: "400", style: "normal" }],
  variable: "--font-plantagenet",
});

const originalSurfer = localFont({
  src: [{ path: "./fonts/OriginalSurfer-Regular.ttf", weight: "400", style: "normal" }],
  variable: "--font-original-surfer",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.thejobmarketisadumpsterfire.com"),
  title: {
    default: "The Job Market Is a Dumpster Fire",
    template: "%s | The Job Market Is a Dumpster Fire",
  },
  // Share copy is the homepage hook + first intro line + sign pair, verbatim (163 chars).
  // Approved OG image: mascot + brand lockup on paper, 1200x630 (Claude Design "Sharing",
  // Randall 2026-07-14). Never reintroduce internal vocabulary here (Human Path, matching).
  description: "A job-search operating system for people who are done feeding the machine. Job boards and ATS's are where good candidates disappear. Stop applying. Start pursuing.",
  icons: {
    icon: "/scans/icon.png",
  },
  openGraph: {
    title: "The Job Market Is a Dumpster Fire",
    description: "A job-search operating system for people who are done feeding the machine. Job boards and ATS's are where good candidates disappear. Stop applying. Start pursuing.",
    url: "https://www.thejobmarketisadumpsterfire.com",
    siteName: "The Job Market Is a Dumpster Fire",
    images: [{ url: "/og-share.png", width: 1200, height: 630 }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${gotham.variable} ${bemio.variable} ${bebas.variable} ${plantagenet.variable} ${originalSurfer.variable}`}>
      <body>
        <div className="appGrainGround" aria-hidden="true">
          <LandingBackground />
        </div>
        <div className="appContentLayer">
          {children}
          <QAFeedbackWidget />
        </div>
      </body>
    </html>
  );
}
